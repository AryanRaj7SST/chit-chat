import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import asyncHandler from "../utils/asyncHandler.js";
import HttpError from "../utils/HttpError.js";
import { ensureBuddyConversation, ensureBuddy } from "../bot/buddy.js";
import { canMessage, getFriendIds, pairKey } from "../utils/friendship.js";
import { messageViews, notExpired, visibleReadPositions } from "../utils/messageView.js";
import { escapeRegex } from "../utils/validators.js";
import ConversationSettings from "../models/ConversationSettings.js";
import { privateProfile } from "../utils/privacy.js";

const populateConversation = (query) =>
  query.populate("participants", "name email isBot avatar about lastSeenAt settings.presence").populate("lastMessage");

export const listConversations = asyncHandler(async (req, res) => {
  await ensureBuddyConversation(req.user._id);
  const allowed = [...await getFriendIds(req.user._id), await ensureBuddy()];
  const deleted = await User.findOne({ email: "deleted@system.local" }).select("_id");
  if (deleted) allowed.push(deleted._id);
  const conversations = await populateConversation(
    Conversation.find({ $and: [{ participants: req.user._id }, { participants: { $in: allowed } }] }).sort({ updatedAt: -1 })
  );
  const counts = conversations.length ? await Message.aggregate([
    { $match: {
      sender: { $ne: req.user._id },
      hiddenFor: { $ne: req.user._id }, deletedAt: null,
      $and: [notExpired()],
      $or: conversations.map((conversation) => ({
        conversation: conversation._id,
        createdAt: { $gt: conversation.lastReadAt.get(String(req.user._id)) || new Date(0) },
      })),
    } },
    { $group: { _id: "$conversation", count: { $sum: 1 } } },
  ]) : [];
  const unreadCounts = new Map(counts.map((entry) => [String(entry._id), entry.count]));
  const preferences = await ConversationSettings.findOne({ user: req.user._id });
  res.json({ success: true, conversations: await Promise.all(conversations.map(async (conversation) => ({
    ...conversation.toObject({ flattenMaps: true }),
    participants: await Promise.all(conversation.participants.map(user => privateProfile(user, req.user._id))),
    unreadCount: unreadCounts.get(String(conversation._id)) || 0,
    settings: preferences?.chats.find(chat => chat.conversationId.equals(conversation._id))?.toObject() || { pinned: false, muted: false, archived: false },
    lastReadAt: await visibleReadPositions(conversation, req.user._id),
    lastMessage: (await Message.findOne({ conversation: conversation._id, hiddenFor: { $ne: req.user._id }, $and: [notExpired()] }).sort({ createdAt: -1, _id: -1 }).then(messages => messages ? messageViews([messages], req.user._id) : []))[0] || null,
  }))) });
});

export const getOrCreateConversation = asyncHandler(async (req, res) => {
  const { userId } = req.body || {};
  if (!mongoose.isValidObjectId(userId)) throw new HttpError(400, "A valid userId is required");
  if (String(userId) === String(req.user._id)) throw new HttpError(400, "You cannot chat with yourself");
  if (!(await User.exists({ _id: userId }))) throw new HttpError(404, "User not found");
  if (!(await canMessage(req.user._id, userId))) throw new HttpError(403, "You can only message friends");

  const key = pairKey(req.user._id, userId);

  let conversation;
  try {
    conversation = await Conversation.findOneAndUpdate(
      { participantsKey: key },
      { $setOnInsert: { participants: [req.user._id, userId] } },
      { returnDocument: "after", upsert: true }
    );
  } catch (err) {
    if (err.code !== 11000) throw err;
    conversation = await Conversation.findOne({ participantsKey: key }); // lost a race, fetch winner
  }

  await conversation.populate("participants", "name email isBot avatar about lastSeenAt settings.presence");
  await conversation.populate("lastMessage");
  const data = conversation.toObject({ flattenMaps: true });
  data.participants = await Promise.all(conversation.participants.map(user => privateProfile(user, req.user._id)));
  data.lastReadAt = await visibleReadPositions(conversation, req.user._id);
  const latest = await Message.findOne({ conversation: conversation._id, hiddenFor: { $ne: req.user._id }, $and: [notExpired()] }).sort({ createdAt: -1, _id: -1 });
  data.lastMessage = latest ? (await messageViews([latest], req.user._id))[0] : null;
  data.settings = (await ConversationSettings.findOne({ user: req.user._id }))?.chats.find(chat => chat.conversationId.equals(conversation._id))?.toObject() || { pinned: false, muted: false, archived: false };
  res.json({ success: true, conversation: data });
});

export const getMessages = asyncHandler(async (req, res) => {
  const searching = typeof req.query.q === "string" && req.query.q.trim();
  const limit = searching ? 30 : Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
  const filter = { conversation: req.conversation._id, hiddenFor: { $ne: req.user._id }, $and: [notExpired()] };
  if (searching) {
    const regex = new RegExp(escapeRegex(req.query.q.trim().slice(0, 100)), "i");
    const window = await Message.find({ ...filter, deletedAt: null }).sort({ createdAt: -1, _id: -1 }).limit(500);
    const matches = window.filter(message => regex.test(message.content || "") || regex.test(message.caption || "")).slice(0, 30).reverse();
    return res.json({ success: true, messages: await messageViews(matches, req.user._id), hasMore: false, searchWindow: 500, lastReadAt: await visibleReadPositions(req.conversation, req.user._id) });
  }
  if (req.query.around) {
    if (!mongoose.isValidObjectId(req.query.around)) throw new HttpError(400, "Invalid message id");
    const target = await Message.findOne({ ...filter, _id: req.query.around });
    if (!target) throw new HttpError(404, "Message unavailable");
    const nearby = await Message.find({ ...filter, $and: [...filter.$and, { $or: [{ createdAt: { $lt: target.createdAt } }, { createdAt: target.createdAt, _id: { $lte: target._id } }] }] }).sort({ createdAt: -1, _id: -1 }).limit(50);
    return res.json({ success: true, messages: await messageViews(nearby.reverse(), req.user._id), hasMore: true, lastReadAt: await visibleReadPositions(req.conversation, req.user._id) });
  }

  if (req.query.before) {
    const [time, id] = String(req.query.before).split("|");
    const before = new Date(time);
    if (Number.isNaN(before.getTime())) throw new HttpError(400, "Invalid 'before' date");
    if (id && mongoose.isValidObjectId(id)) filter.$and.push({ $or: [{ createdAt: { $lt: before } }, { createdAt: before, _id: { $lt: id } }] });
    else filter.createdAt = { $lt: before };
  }

  const found = await Message.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1);
  const hasMore = found.length > limit;
  const messages = found.slice(0, limit).reverse(); // oldest -> newest
  res.json({ success: true, messages: await messageViews(messages, req.user._id), hasMore, lastReadAt: await visibleReadPositions(req.conversation, req.user._id) });
});
