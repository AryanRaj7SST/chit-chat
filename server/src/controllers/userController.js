import User from "../models/User.js";
import asyncHandler from "../utils/asyncHandler.js";
import { escapeRegex } from "../utils/validators.js";

export const searchUsers = asyncHandler(async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 50);
  const filter = { _id: { $ne: req.user._id } };
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const users = await User.find(filter).select("name email createdAt").sort({ name: 1 }).limit(20);
  res.json({ success: true, users });
});
