import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";
import { getStorage } from "../storage/index.js";
import { canMessage } from "../utils/friendship.js";
import { mediaEnabled } from "../config/media.js";

let sweeping = false;
export async function sweepExpired({ now = new Date(), io, onlyIds } = {}) {
  if (sweeping) return { removed: 0, failed: 0 };
  sweeping = true;
  let removed = 0, failed = 0;
  try {
    const records = await Message.find({ expireAt: { $lte: now, $ne: null }, ...(onlyIds ? { _id: { $in: onlyIds } } : {}) }).limit(1000);
    for (const message of records) {
      try {
        // Never let a storage error turn into an orphaned media object.
        if (mediaEnabled()) for (const key of message.attachments.flatMap(a => [a.key, a.thumbKey].filter(Boolean))) {
          const shared = await Message.exists({ _id: { $ne: message._id }, deletedAt: null, $and: [{ $or: [{ expireAt: null }, { expireAt: { $gt: now } }] }], $or: [{ "attachments.key": key }, { "attachments.thumbKey": key }] });
          if (!shared) await getStorage().remove(key);
        }
        await Message.deleteOne({ _id: message._id, expireAt: { $lte: now } }); removed++;
        const conversation = await Conversation.findById(message.conversation);
        if (io && conversation && await canMessage(conversation.participants[0], conversation.participants[1]))
          io.to(conversation.participants.map(id => `user:${id}`)).emit("message:delete:update", { _id: String(message._id), conversation: String(message.conversation), expired: true });
      } catch { failed++; }
    }
  } finally { sweeping = false; }
  return { removed, failed };
}
export function startExpirySweeper(io) {
  const run = () => sweepExpired({ io }).catch(() => console.error("Message expiry sweep failed"));
  const timer = setInterval(run, 5 * 60000); timer.unref(); void run();
  return () => clearInterval(timer);
}
