import asyncHandler from "../utils/asyncHandler.js";
import HttpError from "../utils/HttpError.js";
import { getUserFromToken } from "../utils/token.js";

export const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "Not authenticated");

  const user = await getUserFromToken(token);
  if (!user) throw new HttpError(401, "Invalid or expired token");

  req.user = user;
  next();
});
