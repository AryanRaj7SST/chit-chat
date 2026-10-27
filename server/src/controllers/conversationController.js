import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import asyncHandler from "../utils/asyncHandler.js";
import HttpError from "../utils/HttpError.js";

const populateConversation = (query) =>
  query.populate("participants", "name email").populate("lastMessage");

export const listConversations = asyncHandler(async (req, res) => {
  const conversations = await populateConversation(
    Conversation.find({ participants: req.user._id, lastMessage: { $ne: null } }).sort({ updatedAt: -1 })
  );
  res.json({ success: true, conversations });
});

export const getOrCreateConversation = asyncHandler(async (req, res) => {
  const { userId } = req.body || {};
  if (!mongoose.isValidObjectId(userId)) throw new HttpError(400, "A valid userId is required");
  if (String(userId) === String(req.user._id)) throw new HttpError(400, "You cannot chat with yourself");
  if (!(await User.exists({ _id: userId }))) throw new HttpError(404, "User not found");

  const key = [String(req.user._id), String(userId)].sort().join("_");

  let conversation;
  try {
    conversation = await Conversation.findOneAndUpdate(
      { participantsKey: key },
      { $setOnInsert: { participants: [req.user._id, userId] } },
      { new: true, upsert: true }
    );
  } catch (err) {
    if (err.code !== 11000) throw err;
    conversation = await Conversation.findOne({ participantsKey: key }); // lost a race, fetch winner
  }

  await conversation.populate("participants", "name email");
  await conversation.populate("lastMessage");
  res.json({ success: true, conversation });
});

export const getMessages = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
  const filter = { conversation: req.conversation._id };

  if (req.query.before) {
    const before = new Date(req.query.before);
    if (Number.isNaN(before.getTime())) throw new HttpError(400, "Invalid 'before' date");
    filter.createdAt = { $lt: before };
  }

  const found = await Message.find(filter).sort({ createdAt: -1 }).limit(limit + 1);
  const hasMore = found.length > limit;
  const messages = found.slice(0, limit).reverse(); // oldest -> newest
  res.json({ success: true, messages, hasMore });
});
