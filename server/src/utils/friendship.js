import Friendship from "../models/Friendship.js";
import User from "../models/User.js";

export const pairKey = (a, b) => [String(a).toLowerCase(), String(b).toLowerCase()].sort().join("_");
export const getFriendIds = async (userId) => {
  const records = await Friendship.find({ status: "accepted", $or: [{ requester: userId }, { recipient: userId }] });
  return records.map((record) => String(record.requester) === String(userId) ? record.recipient : record.requester);
};
export const canMessage = async (a, b) => {
  const other = await User.findById(b).select("isBot");
  return !!other && (other.isBot || !!(await Friendship.exists({ pairKey: pairKey(a, b), status: "accepted" })));
};
