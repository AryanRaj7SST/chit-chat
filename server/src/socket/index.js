import { Server } from "socket.io";
import { getCorsOptions } from "../config/cors.js";
import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import { getUserFromToken } from "../utils/token.js";
import { cleanMessageContent, MAX_MESSAGE_LENGTH } from "../utils/validators.js";
import { canMessage, getFriendIds } from "../utils/friendship.js";
import { ensureBuddy, getBuddyReply } from "../bot/buddy.js";

let currentIO = null;
export const getIO = () => currentIO;

const getConversationForUser = (conversationId, userId) => {
  if (!mongoose.isValidObjectId(conversationId)) return null;
  return Conversation.findOne({ _id: conversationId, participants: userId }).select("participants");
};

export function initSocket(httpServer) {
  // userId -> Set of socket ids (a user can have several tabs/devices)
  const onlineUsers = new Map();
  const announcedOnline = new Set();
  const io = new Server(httpServer, {
    cors: getCorsOptions(),
  });
  currentIO = io;
  io.friendshipRevision = 0;
  const withCurrentFriends = async (userId, publish) => {
    // A friendship can change while the database lookup is in flight. Retry
    // before publishing so an old lookup cannot leak presence after unfriend.
    for (;;) {
      const revision = io.friendshipRevision;
      const ids = (await getFriendIds(userId)).map(String);
      if (revision !== io.friendshipRevision) continue;
      publish(ids);
      return;
    }
  };
  const botPending = new Map();
  let jokeIndex = 0;
  const queueBuddyReply = (conversationId, userId, botId, content) => {
    const key = String(conversationId);
    botPending.set(key, (botPending.get(key) || 0) + 1);
    io.to(`user:${userId}`).emit("typing:update", { conversationId: key, userId: String(botId), isTyping: true });
    const joke = /\bjoke\b/i.test(content) ? jokeIndex++ : 0;
    setTimeout(async () => {
      try {
        const reply = await Message.create({ conversation: conversationId, sender: botId,
          content: getBuddyReply(content, userId, { now: new Date(), variant: Math.floor(Math.random() * 3), jokeIndex: joke }) });
        const at = new Date();
        await Conversation.updateOne({ _id: conversationId }, { lastMessage: reply._id, $max: { [`lastReadAt.${botId}`]: at } });
        io.to(`user:${userId}`).emit("message:new", reply.toObject());
        io.to(`user:${userId}`).emit("message:read:update", { conversationId: key, userId: String(botId), at: at.toISOString() });
      } catch {
        console.error("Buddy reply failed");
      } finally {
        const remaining = (botPending.get(key) || 1) - 1;
        if (remaining) botPending.set(key, remaining);
        else {
          botPending.delete(key);
          io.to(`user:${userId}`).emit("typing:update", { conversationId: key, userId: String(botId), isTyping: false });
        }
      }
    }, 700 + Math.floor(Math.random() * 801));
  };

  // Authenticate every socket with the same JWT used for REST
  io.use(async (socket, next) => {
    const user = await getUserFromToken(socket.handshake.auth?.token);
    if (!user || user.isBot) return next(new Error("Authentication error"));
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
    (async () => {
      const botId = String(await ensureBuddy());
      await withCurrentFriends(userId, (ids) => {
        if (!socket.connected) return;
        socket.emit("presence:list", [...ids.filter((id) => onlineUsers.has(id)), botId]);
        if (!announcedOnline.has(userId) && onlineUsers.has(userId)) {
          announcedOnline.add(userId);
          if (ids.length) io.to(ids.map((id) => `user:${id}`)).emit("user:status", { userId, online: true });
        }
      });
    })().catch(() => console.error("Friend presence lookup failed"));

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
        const otherId = conversation.participants.find((id) => String(id) !== userId);
        if (!(await canMessage(userId, otherId))) return reply({ success: false, message: "You are no longer friends" });

        // sender comes from the authenticated socket, never from the client
        const tempId = typeof payload?.tempId === "string" ? payload.tempId : undefined;
        if (tempId !== undefined && (!tempId || tempId.length > 100))
          return reply({ success: false, message: "Invalid message tempId" });
        const identity = { conversation: conversation._id, sender: userId, tempId };
        let message;
        let created = true;
        if (tempId) {
          try {
            const result = await Message.findOneAndUpdate(
              identity, { $setOnInsert: { ...identity, content, createdAt: new Date() } },
              { upsert: true, returnDocument: "after", runValidators: true, timestamps: false, includeResultMetadata: true }
            );
            message = result.value;
            created = !result.lastErrorObject.updatedExisting;
          } catch (err) {
            if (err.code !== 11000) throw err;
            message = await Message.findOne(identity);
            created = false;
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
        try {
          if (created && String(otherId) === String(await ensureBuddy()))
            queueBuddyReply(conversation._id, userId, otherId, content);
        } catch { console.error("Buddy scheduling failed"); }
      } catch (err) {
        console.error("message:send failed:", err.message);
        reply({ success: false, message: "Failed to send message" });
      }
    });

    // ----- read receipts -----
    socket.on("message:read", async (payload, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      try {
        if (!mongoose.isValidObjectId(payload?.conversationId))
          return reply({ success: false, message: "Invalid conversation id" });
        // The caller and timestamp always come from the server, never the payload.
        // $max keeps concurrent updates from different tabs monotonic.
        const conversation = await Conversation.findOneAndUpdate(
          { _id: payload.conversationId, participants: userId },
          { $max: { [`lastReadAt.${userId}`]: new Date() } },
          { returnDocument: "after", timestamps: false }
        );
        if (!conversation) return reply({ success: false, message: "Conversation not found or access denied" });
        const data = {
          conversationId: String(conversation._id), userId,
          at: conversation.lastReadAt.get(userId).toISOString(),
        };
        // Includes the reader's other tabs so badges stay consistent everywhere.
        io.to(conversation.participants.map((id) => `user:${id}`)).emit("message:read:update", data);
        reply({ success: true, ...data });
      } catch (err) {
        console.error("message:read failed:", err.message);
        reply({ success: false, message: "Failed to mark conversation read" });
      }
    });

    // ----- typing -----
    let typingSequence = 0;
    const typingVersions = new Map();
    const relayTyping = (isTyping) => async (payload) => {
      const id = payload?.conversationId;
      if (typeof id !== "string" || !mongoose.isValidObjectId(id)) return;
      const version = ++typingSequence;
      typingVersions.set(id, version);
      try {
        const conversation = await getConversationForUser(id, userId);
        // Database lookups can finish out of order. Relay only the newest
        // typing state for this socket/conversation, including rapid stop/start.
        if (!conversation || !socket.connected || typingVersions.get(id) !== version) return;
        const otherId = conversation.participants.find((participant) => String(participant) !== userId);
        if (!(await canMessage(userId, otherId)) || typingVersions.get(id) !== version) return;
        const rooms = conversation.participants
          .filter((p) => String(p) !== userId)
          .map((p) => `user:${p}`);
        if (rooms.length) {
          io.to(rooms).emit("typing:update", { conversationId: String(conversation._id), userId, isTyping });
        }
      } catch (err) {
        console.error("typing relay failed:", err.message);
      } finally {
        if (typingVersions.get(id) === version) typingVersions.delete(id);
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
        announcedOnline.delete(userId);
        withCurrentFriends(userId, (ids) => {
          if (ids.length && !onlineUsers.has(userId)) io.to(ids.map((id) => `user:${id}`)).emit("user:status", { userId, online: false, lastSeen: new Date().toISOString() });
        }).catch(() => console.error("Friend presence lookup failed"));
      }
    });
  });

  return io;
}
