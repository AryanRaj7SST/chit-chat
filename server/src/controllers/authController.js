import User from "../models/User.js";
import asyncHandler from "../utils/asyncHandler.js";
import HttpError from "../utils/HttpError.js";
import { signToken } from "../utils/token.js";
import { isValidEmail } from "../utils/validators.js";
import { ensureBuddyConversation } from "../bot/buddy.js";
import bcrypt from "bcryptjs";
import { dummyHash, passwordError } from "../security/passwords.js";
import { getIO } from "../socket/index.js";

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body || {};
  if ([name, email, password].some(value => typeof value !== "string")) throw new HttpError(400, "Name, email and password must be text");
  const cleanName = String(name || "").trim();
  const cleanEmail = String(email || "").trim().toLowerCase();
  const pass = String(password || "");

  if (cleanName.length < 2 || cleanName.length > 50) throw new HttpError(400, "Name must be 2-50 characters");
  if (cleanEmail.length > 254 || !isValidEmail(cleanEmail)) throw new HttpError(400, "Please enter a valid email address");
  const policyError = passwordError(pass); if (policyError) throw new HttpError(400, policyError);
  if (await User.exists({ email: cleanEmail })) throw new HttpError(409, "Email is already registered");

  const user = await User.create({ name: cleanName, email: cleanEmail, password: pass });
  await ensureBuddyConversation(user._id);
  res.status(201).json({ success: true, token: signToken(user._id, user.tokenVersion || 0), user: user.toPublic() });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const pass = typeof password === "string" ? password : "";
  const user = await User.findOne({ email: cleanEmail.slice(0, 254) }).select("+password +tokenVersion");
  const matches = await bcrypt.compare(pass.slice(0, 1000), user?.password || dummyHash);
  if (!user || user.isBot || !matches || cleanEmail.length > 254 || Buffer.byteLength(pass) > 72) throw new HttpError(401, "Invalid email or password");
  if (bcrypt.getRounds(user.password) < 12 && !passwordError(pass)) {
    // An opportunistic rehash must not overwrite a concurrent password change.
    const hash = await bcrypt.hash(pass, 12);
    await User.updateOne({ _id: user._id, password: user.password }, { $set: { password: hash } });
  }

  res.json({ success: true, token: signToken(user._id, user.tokenVersion || 0), user: user.toPublic() });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user.toPublic() });
});
export const logoutAll = asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  getIO()?.in(`user:${req.user._id}`).disconnectSockets(true);
  res.json({ success: true });
});
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = await User.findById(req.user._id).select("+password +tokenVersion");
  if (typeof currentPassword !== "string" || !(await bcrypt.compare(currentPassword.slice(0, 1000), user.password))) throw new HttpError(400, "Current password is incorrect");
  const error = passwordError(newPassword); if (error) throw new HttpError(400, error);
  const hash = await bcrypt.hash(newPassword, 12);
  // Compare the old hash so concurrent password changes cannot both succeed.
  const result = await User.updateOne({ _id: user._id, password: user.password }, { $set: { password: hash }, $inc: { tokenVersion: 1 } });
  if (!result.modifiedCount) throw new HttpError(409, "Password changed in another session. Log in again.");
  getIO()?.in(`user:${user._id}`).disconnectSockets(true);
  res.json({ success: true });
});
