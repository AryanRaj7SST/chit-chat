import User from "../models/User.js";
import asyncHandler from "../utils/asyncHandler.js";
import HttpError from "../utils/HttpError.js";
import { signToken } from "../utils/token.js";
import { isValidEmail } from "../utils/validators.js";

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body || {};
  const cleanName = String(name || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();
  const pass = String(password || "");

  if (cleanName.length < 2 || cleanName.length > 50) throw new HttpError(400, "Name must be 2-50 characters");
  if (!isValidEmail(cleanEmail)) throw new HttpError(400, "Please enter a valid email address");
  if (pass.length < 6) throw new HttpError(400, "Password must be at least 6 characters");
  if (await User.exists({ email: cleanEmail })) throw new HttpError(409, "Email is already registered");

  const user = await User.create({ name: cleanName, email: cleanEmail, password: pass });
  res.status(201).json({ success: true, token: signToken(user._id), user: user.toPublic() });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = String(email || "").trim().toLowerCase();
  const pass = String(password || "");
  if (!cleanEmail || !pass) throw new HttpError(400, "Email and password are required");

  const user = await User.findOne({ email: cleanEmail }).select("+password");
  if (!user || !(await user.matchPassword(pass))) throw new HttpError(401, "Invalid email or password");

  res.json({ success: true, token: signToken(user._id), user: user.toPublic() });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user.toPublic() });
});
