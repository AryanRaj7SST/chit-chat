import mongoose from "mongoose";
import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";
import User from "../models/User.js";
import { canMessage } from "../utils/friendship.js";
import { cleanMessageContent, characterCount } from "../utils/validators.js";
import { getStorage } from "../storage/index.js";
import { mediaEnabled } from "../config/media.js";
import { messageViews, notExpired } from "../utils/messageView.js";
import HttpError from "../utils/HttpError.js";

export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
export const editWindow = () => process.env.NODE_ENV === "production" ? 15 * 60000 : Number(process.env.MESSAGE_EDIT_WINDOW_MS || 15 * 60000);
export async function actionMessage(messageId, userId, allowBot = false) {
  if (!mongoose.isValidObjectId(messageId)) throw new HttpError(400, "Invalid message id");
  const message = await Message.findOne({ _id: messageId, hiddenFor: { $ne: userId }, $and: [notExpired()] });
  const conversation = message && await Conversation.findOne({ _id: message.conversation, participants: userId });
  if (!conversation) throw new HttpError(403, "Message access denied");
  const other = conversation.participants.find(id => String(id) !== String(userId));
  if (!(await canMessage(userId, other))) throw new HttpError(403, "You are no longer friends");
  if (!allowBot && (await User.findById(other).select("isBot"))?.isBot) throw new HttpError(400, "This action is unavailable in Buddy chat");
  return { message, conversation };
}
export function registerMessageActions(io, socket) {
  const userId = socket.user.id;
  const handlers = [];
  const register = (name, action) => {
    const handler = async (payload, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      try { await action(payload || {}, reply); }
      catch (error) { reply({ success: false, message: error.status ? error.message : "Message action failed" }); }
    };
    socket.on(name, handler); handlers.push([name, handler]);
  };
  socket.once("disconnect", () => { for (const [name, handler] of handlers) socket.off(name, handler); });
  const publish = async (name, message, conversation) => {
    // Serialize separately so a quote cannot reveal something hidden by its viewer.
    for (const participant of conversation.participants) {
      if (message.hiddenFor?.some(id => String(id) === String(participant))) continue;
      const data = (await messageViews([message], participant))[0];
      io.to(`user:${participant}`).emit(name, data);
    }
  };
  register("conversation:timer", async ({ conversationId, seconds }, reply) => {
    if (!mongoose.isValidObjectId(conversationId) || ![0, 3600, 86400, 604800].includes(seconds)) throw new HttpError(400, "Invalid disappearing timer");
    const conversation = await Conversation.findOne({ _id: conversationId, participants: userId });
    if (!conversation) throw new HttpError(403, "Conversation access denied");
    const otherId = conversation.participants.find(id => String(id) !== userId);
    if (!(await canMessage(userId, otherId))) throw new HttpError(403, "You are no longer friends");
    if ((await User.findById(otherId).select("isBot"))?.isBot) throw new HttpError(400, "Buddy does not support disappearing messages");
    const updated = await Conversation.findOneAndUpdate({ _id: conversationId, disappearingSeconds: { $ne: seconds } }, { disappearingSeconds: seconds }, { returnDocument: "after" });
    if (!updated) return reply({ success: true });
    const actor = await User.findById(userId).select("name");
    const label = ({ 0: "Off", 3600: "1 hour", 86400: "24 hours", 604800: "7 days" })[seconds];
    const notice = await Message.create({ conversation: conversationId, sender: userId, type: "system", content: `${actor.name} set disappearing messages to ${label}`, ...(seconds ? { expireAt: new Date(Date.now() + seconds * 1000) } : {}) });
    await Conversation.updateOne({ _id: conversationId }, { lastMessage: notice._id });
    io.to(conversation.participants.map(id => `user:${id}`)).emit("conversation:timer:update", { conversationId, seconds });
    await publish("message:new", notice, conversation);
    reply({ success: true });
  });
  register("message:delivered", async ({ messageId }, reply) => {
    const { message, conversation } = await actionMessage(messageId, userId, true);
    if (String(message.sender) === userId) throw new HttpError(403, "Only the recipient can acknowledge delivery");
    const updated = await Message.findOneAndUpdate({ _id: message._id, deliveredAt: null }, { deliveredAt: new Date() }, { returnDocument: "after" });
    if (updated) io.to(conversation.participants.map(id => `user:${id}`)).emit("message:delivery:update", { conversationId: String(conversation._id), messageId, at: updated.deliveredAt });
    reply({ success: true });
  });
  register("message:react", async ({ messageId, emoji }, reply) => {
    const { message, conversation } = await actionMessage(messageId, userId);
    if (message.deletedAt) throw new HttpError(400, "Message was deleted");
    if (emoji !== null && !REACTIONS.includes(emoji)) throw new HttpError(400, "Unsupported reaction");
    // A single atomic pipeline prevents duplicate reactions from concurrent tabs.
    const reactions = { $filter: { input: { $ifNull: ["$reactions", []] }, as: "reaction", cond: { $ne: ["$$reaction.user", new mongoose.Types.ObjectId(userId)] } } };
    const updated = await Message.findOneAndUpdate({ _id: message._id, deletedAt: null }, [{ $set: {
      reactions: emoji === null ? reactions : { $concatArrays: [reactions, [{ user: new mongoose.Types.ObjectId(userId), emoji }]] },
      revision: { $add: [{ $ifNull: ["$revision", 0] }, 1] },
    } }], { returnDocument: "after", updatePipeline: true });
    if (!updated) throw new HttpError(409, "Message changed; retry");
    await publish("message:react:update", updated, conversation); reply({ success: true });
  });
  register("message:edit", async ({ messageId, content }, reply) => {
    const { message, conversation } = await actionMessage(messageId, userId);
    if (String(message.sender) !== userId) throw new HttpError(403, "Only the sender can edit a message");
    const clean = cleanMessageContent(content);
    if (!clean || characterCount(clean) > 2000 || Buffer.byteLength(clean) > 100000) throw new HttpError(400, "Use 1–2000 characters");
    const updated = await Message.findOneAndUpdate({ _id: message._id, sender: userId, type: "text", deletedAt: null, createdAt: { $gte: new Date(Date.now() - editWindow()) } },
      { $set: { content: clean, editedAt: new Date() }, $inc: { revision: 1 } }, { returnDocument: "after", runValidators: true });
    if (!updated) throw new HttpError(400, "Only text messages sent in the last 15 minutes can be edited");
    await publish("message:edit:update", updated, conversation); reply({ success: true });
  });
  register("message:delete", async ({ messageId, forEveryone }, reply) => {
    if (typeof forEveryone !== "boolean") throw new HttpError(400, "Choose delete-for-me or delete-for-everyone");
    const { message, conversation } = await actionMessage(messageId, userId, !forEveryone);
    if (!forEveryone) {
      await Message.updateOne({ _id: message._id }, { $addToSet: { hiddenFor: userId } });
      io.to(`user:${userId}`).emit("message:delete:update", { _id: messageId, conversation: String(conversation._id), hidden: true });
      return reply({ success: true });
    }
    if (String(message.sender) !== userId) throw new HttpError(403, "Only the sender can delete for everyone");
    if (Date.now() - message.createdAt > 48 * 3600000) throw new HttpError(400, "Delete-for-everyone window has expired");
    // Remove bytes first. A failed storage operation leaves the document retryable.
    if (mediaEnabled()) for (const key of message.attachments.flatMap(a => [a.key, a.thumbKey].filter(Boolean))) {
      if (!(await Message.exists({ _id: { $ne: message._id }, deletedAt: null, $and: [notExpired()], $or: [{ "attachments.key": key }, { "attachments.thumbKey": key }] }))) await getStorage().remove(key);
    }
    const updated = await Message.findOneAndUpdate({ _id: message._id, sender: userId, createdAt: { $gte: new Date(Date.now() - 48 * 3600000) } },
      { $set: { content: "", caption: "", attachments: [], reactions: [], deletedAt: message.deletedAt || new Date() }, $inc: { revision: 1 } }, { returnDocument: "after" });
    if (!updated) throw new HttpError(409, "Message changed; retry");
    await publish("message:delete:update", updated, conversation); reply({ success: true });
  });
}
