import { Server } from "socket.io";
import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import { getUserFromToken } from "../utils/token.js";
import { cleanMessageContent, MAX_MESSAGE_LENGTH } from "../utils/validators.js";

const getConversationForUser = (conversationId, userId) => {
  if (!mongoose.isValidObjectId(conversationId)) return null;
  return Conversation.findOne({ _id: conversationId, participants: userId }).select("participants");
};

export function initSocket(httpServer) {
  // userId -> Set of socket ids (a user can have several tabs/devices)
  const onlineUsers = new Map();
  const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL, credentials: true },
  });

  // Authenticate every socket with the same JWT used for REST
  io.use(async (socket, next) => {
    const user = await getUserFromToken(socket.handshake.auth?.token);
    if (!user) return next(new Error("Authentication error"));
    socket.user = { id: String(user._id), name: user.name };
    next();
  });

  io.on("connection", (socket) => {
    const userId = socket.user.id;
    socket.join(`user:${userId}`);

    // ----- presence -----
    let sockets = onlineUsers.get(userId);
    if (!sockets) {
      sockets = new Set();
      onlineUsers.set(userId, sockets);
    }
    sockets.add(socket.id);
    if (sockets.size === 1) socket.broadcast.emit("user:status", { userId, online: true });
    socket.emit("presence:list", [...onlineUsers.keys()]);

    // ----- messaging -----
    socket.on("message:send", async (payload, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      try {
        const content = cleanMessageContent(payload?.content);
        if (!content) return reply({ success: false, message: "Message cannot be empty" });
        if (content.length > MAX_MESSAGE_LENGTH)
          return reply({ success: false, message: `Message is too long (max ${MAX_MESSAGE_LENGTH})` });

        const conversation = await getConversationForUser(payload?.conversationId, userId);
        if (!conversation) return reply({ success: false, message: "Conversation not found or access denied" });

        // sender comes from the authenticated socket, never from the client
        const tempId = typeof payload?.tempId === "string" ? payload.tempId : undefined;
        if (tempId !== undefined && (!tempId || tempId.length > 100))
          return reply({ success: false, message: "Invalid message tempId" });
        const identity = { conversation: conversation._id, sender: userId, tempId };
        let message;
        if (tempId) {
          try {
            message = await Message.findOneAndUpdate(
              identity, { $setOnInsert: { ...identity, content, createdAt: new Date() } },
              { upsert: true, returnDocument: "after", runValidators: true, timestamps: false }
            );
          } catch (err) {
            if (err.code !== 11000) throw err;
            message = await Message.findOne(identity);
          }
        } else {
          message = await Message.create({ conversation: conversation._id, sender: userId, content });
        }
        // An old retry must not move the preview back to an older message.
        await Conversation.updateOne(
          { _id: conversation._id, $or: [{ lastMessage: null }, { lastMessage: { $lt: message._id } }] },
          { lastMessage: message._id }
        );

        const data = message.toObject();
        const rooms = conversation.participants.map((p) => `user:${p}`);
        socket.to(rooms).emit("message:new", data); // everyone except this socket

        reply({ success: true, message: data, tempId: payload?.tempId });
      } catch (err) {
        console.error("message:send failed:", err.message);
        reply({ success: false, message: "Failed to send message" });
      }
    });

    // ----- typing -----
    const relayTyping = (isTyping) => async (payload) => {
      try {
        const conversation = await getConversationForUser(payload?.conversationId, userId);
        if (!conversation) return;
        const rooms = conversation.participants
          .filter((p) => String(p) !== userId)
          .map((p) => `user:${p}`);
        if (rooms.length) {
          io.to(rooms).emit("typing:update", { conversationId: String(conversation._id), userId, isTyping });
        }
      } catch (err) {
        console.error("typing relay failed:", err.message);
      }
    };
    socket.on("typing:start", relayTyping(true));
    socket.on("typing:stop", relayTyping(false));

    // ----- disconnect -----
    socket.on("disconnect", () => {
      const set = onlineUsers.get(userId);
      if (!set) return;
      set.delete(socket.id);
      if (set.size === 0) {
        onlineUsers.delete(userId);
        io.emit("user:status", { userId, online: false, lastSeen: new Date().toISOString() });
      }
    });
  });

  return io;
}
