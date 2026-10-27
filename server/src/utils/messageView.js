import Message from "../models/Message.js";
import User from "../models/User.js";
export const notExpired = () => ({ $or: [{ expireAt: null }, { expireAt: { $gt: new Date() } }] });

export async function visibleReadPositions(conversation, viewerId) {
  const users = await User.find({ _id: { $in: conversation.participants } }).select("settings.readReceipts");
  const map = Object.fromEntries(conversation.lastReadAt || []);
  if (users.some(user => user.settings?.readReceipts === false))
    return map[String(viewerId)] ? { [viewerId]: map[String(viewerId)] } : {};
  return map;
}
export async function messageViews(documents, viewerId) {
  const data = documents.map(document => document.toObject ? document.toObject() : { ...document });
  const ids = data.map(message => message.replyTo?._id || message.replyTo).filter(Boolean);
  const originals = ids.length ? await Message.find({ _id: { $in: ids }, $and: [notExpired()], ...(viewerId ? { hiddenFor: { $ne: viewerId } } : {}) }).select("conversation sender content caption type deletedAt") : [];
  const byId = new Map(originals.map(message => [String(message._id), message]));
  return data.map(message => {
    delete message.hiddenFor;
    if (message.replyTo) {
      const original = byId.get(String(message.replyTo?._id || message.replyTo));
      message.replyTo = { _id: message.replyTo?._id || message.replyTo,
        preview: !original || original.deletedAt ? "Message unavailable" : original.type === "image" ? `Photo${original.caption ? `: ${original.caption}` : ""}` : original.content.slice(0, 160),
        sender: original?.sender };
    }
    return message;
  });
}
