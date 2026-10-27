import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const signToken = (userId, tokenVersion = 0) =>
  jwt.sign({ id: String(userId), tokenVersion }, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn: "24h", audience: "mern-chat", issuer: "mern-chat-api" });

// Shared by HTTP middleware and the Socket.IO handshake
export const getUserFromToken = async (token) => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"], audience: "mern-chat", issuer: "mern-chat-api" });
    if (typeof decoded.id !== "string" || !Number.isInteger(decoded.tokenVersion)) return null;
    const user = await User.findById(decoded.id).select("+tokenVersion");
    return user && !user.isBot && !user.deleting && user.tokenVersion === decoded.tokenVersion ? user : null;
  } catch {
    return null;
  }
};
