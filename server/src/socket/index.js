import { Server } from "socket.io";
import { getCorsOptions } from "../config/cors.js";
import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import { getUserFromToken } from "../utils/token.js";
import { characterCount, cleanMessageContent, MAX_MESSAGE_LENGTH } from "../utils/validators.js";
import { requireImageConversation, validateAttachments } from "../controllers/uploadController.js";
import Upload from "../models/Upload.js";
import User from "../models/User.js";
import { registerMessageActions } from "./messageActions.js";
import { messageViews, notExpired } from "../utils/messageView.js";
import { hardenSocket } from "../security/socketPolicy.js";
import { canMessage, getFriendIds } from "../utils/friendship.js";
import { ensureBuddy, getBuddyReply } from "../bot/buddy.js";
import { canSeePresence, visibleRecipients } from "../utils/privacy.js";

let currentIO = null;
export const getIO = () => currentIO;

const getConversationForUser = (conversationId, userId) => {
  if (!mongoose.isValidObjectId(conversationId)) return null;
  return Conversation.findOne({ _id: conversationId, participants: userId }).select("participants disappearingSeconds");
};

export function initSocket(httpServer) {
  // userId -> Set of socket ids (a user can have several tabs/devices)
  const onlineUsers = new Map();
  const pendingSockets = new Map();
  const announcedOnline = new Set();
  const io = new Server(httpServer, {
    cors: getCorsOptions(),
    maxHttpBufferSize: 1024 * 1024,
  });
  currentIO = io;
  io.friendshipRevision = 0;
  const withCurrentFriends = async (userId, publish) => {
    // A friendship can change while the database lookup is in flight. Retry
    // before publishing so an old lookup cannot leak presence after unfriend.
    for (;;) {
      const revision = io.friendshipRevision;
      const ids = await visibleRecipients(userId, [...onlineUsers.keys()].filter(id => id !== String(userId)));
      if (revision !== io.friendshipRevision) continue;
      await publish(ids);
      return;
    }
  };
  io.visibleOnlineFor = async viewer => {
    const users = await User.find({ _id: { $in: [...onlineUsers.keys()] } }).select("settings.presence isBot");
    return (await Promise.all(users.map(async user => await canSeePresence(user, viewer) ? String(user._id) : null))).filter(Boolean);
  };
  io.refreshPrivacy = async id => {
    const allowed = new Set(await visibleRecipients(id, [...onlineUsers.keys()]));
    for (const viewer of onlineUsers.keys()) if (viewer !== id) io.to(`user:${viewer}`).emit("user:status", { userId: id, online: allowed.has(viewer) && onlineUsers.has(id), lastSeen: null });
  };
  io.clearUserTyping = async id => {
    const conversations = await Conversation.find({ participants: id });
    for (const conversation of conversations) io.to(conversation.participants.filter(p => String(p) !== id).map(p => `user:${p}`)).emit("typing:update", { conversationId: String(conversation._id), userId: id, isTyping: false });
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
        if ((await User.findById(userId).select("settings.readReceipts"))?.settings?.readReceipts !== false)
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
    const id = String(user._id), pending = pendingSockets.get(id) || new Set();
    if ((onlineUsers.get(id)?.size || 0) + pending.size >= 10) return next(new Error("Too many active devices"));
    pending.add(socket.id); pendingSockets.set(id, pending);
    const release = () => { pending.delete(socket.id); if (!pending.size) pendingSockets.delete(id); socket.conn.off("close", release); };
    socket.conn.once("close", release); socket.data.releaseReservation = release;
    socket.user = { id, name: user.name };
    next();
  });

  io.on("connection", (socket) => {
    const userId = socket.user.id;
    socket.data.releaseReservation?.();
    hardenSocket(socket);
    registerMessageActions(io, socket);
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
      await withCurrentFriends(userId, async (ids) => {
        if (!socket.connected) return;
        socket.emit("presence:list", [...await io.visibleOnlineFor(userId), botId]);
        if (!announcedOnline.has(userId) && onlineUsers.has(userId)) {
          announcedOnline.add(userId);
          if (ids.length) io.to(ids.map((id) => `user:${id}`)).emit("user:status", { userId, online: true });
        }
      });
      // Re-deliver missed, unacknowledged messages. Clients merge by persisted ID.
      const permitted = [...await getFriendIds(userId), botId];
      const conversations = await Conversation.find({ $and: [{ participants: userId }, { participants: { $in: permitted } }] }).select("_id");
      const pending = await Message.find({ conversation: { $in: conversations.map(c => c._id) }, sender: { $ne: userId }, deliveredAt: null, deletedAt: null, hiddenFor: { $ne: userId }, $and: [notExpired()] }).sort({ createdAt: -1 }).limit(1000);
      for (const data of await messageViews(pending.reverse(), userId)) if (socket.connected && await canMessage(userId, data.sender)) socket.emit("message:new", data);
    })().catch(() => console.error("Friend presence lookup failed"));

    // ----- messaging -----
    socket.on("message:send", async (payload, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      try {
        const image = payload?.type === "image" || (Array.isArray(payload?.attachments) && payload.attachments.length > 0);
        const content = image ? "" : cleanMessageContent(payload?.content);
        const caption = image ? cleanMessageContent(payload?.caption) : "";
        if (!image && !content) return reply({ success: false, message: "Message cannot be empty" });
        if (characterCount(content) > MAX_MESSAGE_LENGTH || Buffer.byteLength(content) > 100000)
          return reply({ success: false, message: `Message is too long (max ${MAX_MESSAGE_LENGTH})` });
        if (characterCount(caption) > 1000 || Buffer.byteLength(caption) > 50000) return reply({ success: false, message: "Caption is too long (max 1000)" });

        const conversation = await getConversationForUser(payload?.conversationId, userId);
        if (!conversation) return reply({ success: false, message: "Conversation not found or access denied" });
        const otherId = conversation.participants.find((id) => String(id) !== userId);
        if (!(await canMessage(userId, otherId))) return reply({ success: false, message: "You are no longer friends" });

        // sender comes from the authenticated socket, never from the client
        const tempId = typeof payload?.tempId === "string" ? payload.tempId : undefined;
        if (tempId !== undefined && (!tempId || tempId.length > 100))
          return reply({ success: false, message: "Invalid message tempId" });
        const identity = { conversation: conversation._id, sender: userId, tempId };
        const existing = tempId ? await Message.findOne(identity) : null;
        if (image) await requireImageConversation(conversation._id, userId);
        const attachments = image && !existing ? await validateAttachments(payload.attachments, String(conversation._id), userId) : [];
        let replyTo;
        if (!existing && payload?.replyTo) {
          if (!mongoose.isValidObjectId(payload.replyTo) || !(await Message.exists({ _id: payload.replyTo, conversation: conversation._id, hiddenFor: { $ne: userId }, deletedAt: null, $and: [notExpired()] })))
            return reply({ success: false, message: "Reply target is unavailable in this conversation" });
          replyTo = payload.replyTo;
        }
        const fields = { content, type: image ? "image" : "text", caption, attachments, hasMedia: image, ...(conversation.disappearingSeconds ? { expireAt: new Date(Date.now() + conversation.disappearingSeconds * 1000) } : {}), ...(replyTo ? { replyTo } : {}) };
        let message;
        let created = true;
        if (existing) { message = existing; created = false; }
        else if (tempId) {
          try {
            const result = await Message.findOneAndUpdate(
              identity, { $setOnInsert: { ...identity, ...fields, createdAt: new Date() } },
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
          message = await Message.create({ conversation: conversation._id, sender: userId, ...fields });
        }
        if (message.type === "image") await Upload.updateMany({ user: userId, key: { $in: message.attachments.flatMap(item => [item.key, item.thumbKey].filter(Boolean)) } }, { $set: { claim: String(message._id) } });
        // An old retry must not move the preview back to an older message.
        await Conversation.updateOne(
          { _id: conversation._id, $or: [{ lastMessage: null }, { lastMessage: { $lt: message._id } }] },
          { lastMessage: message._id }
        );

        if (String(otherId) === String(await ensureBuddy()) && !message.deliveredAt) {
          message.deliveredAt = new Date(); await Message.updateOne({ _id: message._id, deliveredAt: null }, { deliveredAt: message.deliveredAt });
        }
        const data = (await messageViews([message], userId))[0];
        for (const participant of conversation.participants) {
          const visible = (await messageViews([message], participant))[0];
          socket.to(`user:${participant}`).emit("message:new", visible);
        }

        reply({ success: true, message: data, tempId: payload?.tempId });
        try {
          if (created && String(otherId) === String(await ensureBuddy()))
            queueBuddyReply(conversation._id, userId, otherId, content);
        } catch { console.error("Buddy scheduling failed"); }
      } catch (err) {
        if (!err.status) console.error("message:send failed");
        reply({ success: false, message: err.status && err.status < 500 ? err.message : "Failed to send message" });
      }
    });

    // ----- read receipts -----
    socket.on("message:read", async (payload, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      try {
        if (!mongoose.isValidObjectId(payload?.conversationId))
          return reply({ success: false, message: "Invalid conversation id" });
        const access = await getConversationForUser(payload.conversationId, userId);
        if (!access || !(await canMessage(userId, access.participants.find(id => String(id) !== userId))))
          return reply({ success: false, message: "Conversation not found or access denied" });
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
        const participants = await User.find({ _id: { $in: conversation.participants } }).select("settings.readReceipts");
        const destinations = participants.some(user => user.settings?.readReceipts === false) ? [`user:${userId}`] : conversation.participants.map(id => `user:${id}`);
        io.to(destinations).emit("message:read:update", data);
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
      if (typeof id !== "string" || !mongoose.isValidObjectId(id)) { if (socket.data.latestTyping.get(id) === payload) socket.data.latestTyping.delete(id); return; }
      if (socket.data.latestTyping.get(id) !== payload) return;
      const version = ++typingSequence;
      typingVersions.set(id, version);
      try {
        const conversation = await getConversationForUser(id, userId);
        if (isTyping && (await User.findById(userId).select("settings.typingIndicators"))?.settings?.typingIndicators === false) return;
        // Database lookups can finish out of order. Relay only the newest
        // typing state for this socket/conversation, including rapid stop/start.
        if (!conversation || !socket.connected || typingVersions.get(id) !== version || socket.data.latestTyping.get(id) !== payload) return;
        const otherId = conversation.participants.find((participant) => String(participant) !== userId);
        if (!(await canMessage(userId, otherId)) || typingVersions.get(id) !== version || socket.data.latestTyping.get(id) !== payload) return;
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
        if (socket.data.latestTyping.get(id) === payload) socket.data.latestTyping.delete(id);
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
        void io.clearUserTyping(userId).catch(() => {});
        const lastSeen = new Date();
        User.updateOne({ _id: userId }, { lastSeenAt: lastSeen }).then(() => withCurrentFriends(userId, (ids) => {
          if (ids.length && !onlineUsers.has(userId)) io.to(ids.map((id) => `user:${id}`)).emit("user:status", { userId, online: false, lastSeen: lastSeen.toISOString() });
        })).catch(() => console.error("Friend presence lookup failed"));
      }
    });
  });

  return io;
}
