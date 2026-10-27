import mongoose from "mongoose";
import ConversationSettings from "../models/ConversationSettings.js";
import Block from "../models/Block.js";
import User from "../models/User.js";
import Friendship from "../models/Friendship.js";
import { canMessage, pairKey } from "../utils/friendship.js";
import HttpError from "../utils/HttpError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { getIO } from "../socket/index.js";

export const updateChatSettings = asyncHandler(async (req, res) => {
  const other = req.conversation.participants.find(id => String(id) !== String(req.user._id));
  if (!(await canMessage(req.user._id, other))) throw new HttpError(403, "You are no longer friends");
  const patch = {};
  for (const key of ["pinned", "muted", "archived"]) if (req.body?.[key] !== undefined) {
    if (typeof req.body[key] !== "boolean") throw new HttpError(400, "Chat settings must be booleans");
    patch[key] = req.body[key];
  }
  if (!Object.keys(patch).length) throw new HttpError(400, "No chat settings supplied");
  try { await ConversationSettings.updateOne({ user: req.user._id }, { $setOnInsert: { user: req.user._id, chats: [] } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  const id = req.conversation._id;
  const others = { $filter: { input: "$chats", as: "chat", cond: { $ne: ["$$chat.conversationId", id] } } };
  const filter = { user: req.user._id };
  if (patch.pinned === true) filter.$expr = { $lt: [{ $size: { $filter: { input: others, as: "chat", cond: { $eq: ["$$chat.pinned", true] } } } }, 3] };
  const current = { $arrayElemAt: [{ $filter: { input: "$chats", as: "chat", cond: { $eq: ["$$chat.conversationId", id] } } }, 0] };
  const document = await ConversationSettings.findOneAndUpdate(filter, [{ $set: { chats: { $concatArrays: [others, [{ $mergeObjects: [{ pinned: false, muted: false, archived: false }, current, { conversationId: id, ...patch }] }]] } } }], { updatePipeline: true, returnDocument: "after" });
  if (!document) throw new HttpError(400, "You can pin at most three chats");
  const settings = document.chats.find(chat => chat.conversationId.equals(id)).toObject();
  getIO()?.to(`user:${req.user._id}`).emit("conversation:settings:update", { conversationId: String(id), settings });
  res.json({ success: true, settings });
});

export const listBlocked = asyncHandler(async (req, res) => {
  const blocks = await Block.find({ blocker: req.user._id }).populate("blocked", "name");
  res.json({ success: true, users: blocks.map(record => record.blocked).filter(Boolean) });
});
export const blockUser = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id) || String(id).toLowerCase() === String(req.user._id)) throw new HttpError(400, "Invalid block target");
  const target = await User.findById(id).select("isBot");
  if (!target || target.isBot) throw new HttpError(400, "This user cannot be blocked");
  try { await Block.updateOne({ blocker: req.user._id, blocked: id }, { $setOnInsert: { blocker: req.user._id, blocked: id } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  const io = getIO(); if (io) io.friendshipRevision++;
  const pending = await Friendship.findOneAndDelete({ pairKey: pairKey(req.user._id, id) });
  for (const [source, other] of [[req.user._id, id], [id, req.user._id]]) {
    io?.to(`user:${source}`).emit("friend:removed", { userId: String(other) });
    if (pending) io?.to(`user:${source}`).emit("friend:request:removed", { requestId: String(pending._id) });
  }
  res.json({ success: true });
});
export const unblockUser = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, "Invalid user id");
  await Block.deleteOne({ blocker: req.user._id, blocked: req.params.id });
  res.json({ success: true });
});
