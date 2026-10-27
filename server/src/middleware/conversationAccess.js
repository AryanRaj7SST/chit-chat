import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import asyncHandler from "../utils/asyncHandler.js";
import HttpError from "../utils/HttpError.js";

export const requireMembership = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid conversation id");

  const conversation = await Conversation.findById(id);
  if (!conversation) throw new HttpError(404, "Conversation not found");

  const isMember = conversation.participants.some((p) => p.equals(req.user._id));
  if (!isMember) throw new HttpError(403, "You are not a participant in this conversation");

  req.conversation = conversation;
  next();
});
