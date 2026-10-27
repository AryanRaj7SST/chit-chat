import User from "../models/User.js";
import asyncHandler from "../utils/asyncHandler.js";
import { escapeRegex } from "../utils/validators.js";
import Friendship from "../models/Friendship.js";
import { pairKey } from "../utils/friendship.js";

export const searchUsers = asyncHandler(async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 50);
  if (q.length < 2) return res.json({ success: true, users: [] });
  const rx = new RegExp(escapeRegex(q), "i");
  const filter = { _id: { $ne: req.user._id }, isBot: { $ne: true }, $or: [{ name: rx }, { email: rx }] };
  const users = await User.find(filter).select("name email createdAt").sort({ name: 1 }).limit(20);
  const relationships = await Friendship.find({ pairKey: { $in: users.map((user) => pairKey(req.user._id, user._id)) } });
  const byPair = new Map(relationships.map((record) => [record.pairKey, record]));
  res.json({ success: true, users: users.map((user) => {
    const record = byPair.get(pairKey(req.user._id, user._id));
    const relationship = !record ? "none" : record.status === "accepted" ? "friends"
      : record.requester.equals(req.user._id) ? "request_sent" : "request_received";
    const [local, domain] = user.email.split("@");
    const maskedEmail = `${local[0]}***@${domain[0]}***.${domain.split(".").at(-1)}`;
    return { _id: user._id, name: user.name, maskedEmail, relationship,
      ...(relationship === "friends" ? { email: user.email } : {}),
      ...(record?.status === "pending" ? { requestId: record._id } : {}),
    };
  }) });
});
