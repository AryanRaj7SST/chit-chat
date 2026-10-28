import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";
import Upload from "../models/Upload.js";
import Friendship from "../models/Friendship.js";
import Block from "../models/Block.js";
import ConversationSettings from "../models/ConversationSettings.js";
import { getStorage } from "../storage/index.js";
import { getIO } from "../socket/index.js";
import { randomBytes } from "node:crypto";
import { mediaEnabled } from "../config/media.js";
import asyncHandler from "../utils/asyncHandler.js";
import HttpError from "../utils/HttpError.js";

const deleting = new Set();
export const exportAccount = asyncHandler(async (req, res) => {
  const user = req.user.toPublic();
  // Export only messages authored by this account, never recipient text or URLs.
  const messages = await Message.find({ sender: req.user._id }).sort({ createdAt: 1 });
  const media = item => ({ mime: item.mime, size: item.size, width: item.width, height: item.height, url: null, expired: true });
  const profile = { ...user, avatar: user.avatar?.key ? media(user.avatar) : null };
  res.set("Cache-Control", "no-store").set("Content-Disposition", 'attachment; filename="chit-chat-export.json"').json({ profile, exportedAt: new Date(), messages: messages.map(message => ({ _id: message._id, conversation: message.conversation, content: message.content, caption: message.caption, createdAt: message.createdAt, deletedAt: message.deletedAt, attachments: message.attachments.map(media) })) });
});
export const deleteAccount = asyncHandler(async (req, res) => {
  const id = String(req.user._id), password = req.body?.password;
  const user = await User.findById(id).select("+password");
  if (typeof password !== "string" || Buffer.byteLength(password) > 72 || !(await bcrypt.compare(password, user.password))) throw new HttpError(400, "Password is incorrect");
  if (deleting.has(id)) throw new HttpError(409, "Account deletion is already running");
  deleting.add(id);
  try {
    await User.updateOne({ _id: id }, { deleting: true });
    getIO()?.in(`user:${id}`).disconnectSockets(true);
    const uploads = mediaEnabled() ? await Upload.find({ user: id }) : [];
    const messages = await Message.find({ sender: id }).select("attachments");
    const keys = new Set([user.avatar?.key, user.avatar?.thumbKey, ...uploads.map(upload => upload.key), ...messages.flatMap(message => message.attachments.flatMap(a => [a.key, a.thumbKey]))].filter(Boolean));
    // Fail before removing records if storage deletion fails; re-login to retry.
    if (mediaEnabled()) for (const key of keys) await getStorage().remove(key);
    let removed = await User.findOne({ email: "deleted@system.local" });
    if (!removed) {
      try { removed = await User.create({ name: "Deleted user", email: "deleted@system.local", password: randomBytes(24).toString("hex"), deleting: true, settings: { presence: "nobody" } }); }
      catch (error) { if (error.code !== 11000) throw error; removed = await User.findOne({ email: "deleted@system.local" }); }
    }
    const conversations = await Conversation.find({ participants: id });
    await Message.deleteMany({ sender: id });
    // Remove this identity from reactions and per-user hiding metadata too.
    await Message.updateMany({}, { $pull: { reactions: { user: user._id }, hiddenFor: user._id } });
    await Upload.deleteMany({ user: id });
    await Friendship.deleteMany({ $or: [{ requester: id }, { recipient: id }] });
    await Block.deleteMany({ $or: [{ blocker: id }, { blocked: id }] });
    await ConversationSettings.deleteMany({ user: id });
    for (const conversation of conversations) {
      const remaining = conversation.participants.filter(p => String(p) !== id);
      if (remaining.every(p => String(p) === String(removed._id))) { await Message.deleteMany({ conversation: conversation._id }); await Conversation.deleteOne({ _id: conversation._id }); continue; }
      const latest = await Message.findOne({ conversation: conversation._id }).sort({ createdAt: -1, _id: -1 });
      await Conversation.updateOne({ _id: conversation._id }, { $set: { participants: conversation.participants.map(p => String(p) === id ? removed._id : p), lastMessage: latest?._id || null }, $unset: { [`lastReadAt.${id}`]: "" } });
      getIO()?.to(remaining.map(p => `user:${p}`)).emit("friend:removed", { userId: id });
    }
    await User.deleteOne({ _id: id });
    res.json({ success: true });
  } catch (error) {
    await User.updateOne({ _id: id }, { deleting: false });
    throw error;
  } finally { deleting.delete(id); }
});
