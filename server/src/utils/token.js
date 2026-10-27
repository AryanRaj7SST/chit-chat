import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const signToken = (userId) =>
  jwt.sign({ id: String(userId) }, process.env.JWT_SECRET, { expiresIn: "7d" });

// Shared by HTTP middleware and the Socket.IO handshake
export const getUserFromToken = async (token) => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return await User.findById(decoded.id);
  } catch {
    return null;
  }
};
