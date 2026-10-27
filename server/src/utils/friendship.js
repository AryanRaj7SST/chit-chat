import Friendship from "../models/Friendship.js";
import User from "../models/User.js";
import Block from "../models/Block.js";

export const isBlocked = (a, b) => Block.exists({ $or: [{ blocker: a, blocked: b }, { blocker: b, blocked: a }] });
export const getBlockedIds = async userId => (await Block.find({ $or: [{ blocker: userId }, { blocked: userId }] })).map(record => String(record.blocker) === String(userId) ? record.blocked : record.blocker);

export const pairKey = (a, b) => [String(a).toLowerCase(), String(b).toLowerCase()].sort().join("_");
export const getFriendIds = async (userId) => {
  const records = await Friendship.find({ status: "accepted", $or: [{ requester: userId }, { recipient: userId }] });
  const blocked = new Set((await getBlockedIds(userId)).map(String));
  return records.map((record) => String(record.requester) === String(userId) ? record.recipient : record.requester).filter(id => !blocked.has(String(id)));
};
export const canMessage = async (a, b) => {
  if (await isBlocked(a, b)) return false;
  const other = await User.findById(b).select("isBot");
  return !!other && (other.isBot || !!(await Friendship.exists({ pairKey: pairKey(a, b), status: "accepted" })));
};
