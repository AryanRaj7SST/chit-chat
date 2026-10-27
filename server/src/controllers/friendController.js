import mongoose from "mongoose";
import Friendship from "../models/Friendship.js";
import User from "../models/User.js";
import HttpError from "../utils/HttpError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { getFriendIds, isBlocked, pairKey } from "../utils/friendship.js";
import { getIO } from "../socket/index.js";

const validateId = (id) => {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid user or request id");
};
const publicFriend = (user) => ({ _id: user._id, name: user.name, email: user.email });
const publishAcceptance = async (record) => {
  const io = getIO();
  if (io) io.friendshipRevision++;
  const [requester, recipient] = await Promise.all([User.findById(record.requester), User.findById(record.recipient)]);
  io?.to(`user:${record.requester}`).emit("friend:accepted", { user: publicFriend(recipient) });
  io?.to(`user:${record.recipient}`).emit("friend:request:removed", { requestId: String(record._id) });
  for (const [source, target] of [[record.requester, record.recipient], [record.recipient, record.requester]]) {
    if (io?.sockets.adapter.rooms.has(`user:${source}`))
      io.to(`user:${target}`).emit("user:status", { userId: String(source), online: true });
  }
  return { requester, recipient };
};

export const sendRequest = asyncHandler(async (req, res) => {
  const { userId } = req.body || {};
  validateId(userId);
  if (String(userId).toLowerCase() === String(req.user._id)) throw new HttpError(400, "You cannot add yourself");
  const target = await User.findById(userId);
  if (!target) throw new HttpError(404, "User not found");
  if (target.isBot) throw new HttpError(400, "Buddy does not accept friend requests");
  if (await isBlocked(req.user._id, target._id)) throw new HttpError(403, "This request is unavailable");
  const key = pairKey(req.user._id, target._id);
  let record = await Friendship.findOne({ pairKey: key });
  if (!record) {
    try {
      record = await Friendship.create({ requester: req.user._id, recipient: target._id, pairKey: key });
      if (await isBlocked(req.user._id, target._id)) { await Friendship.deleteOne({ _id: record._id }); throw new HttpError(403, "This request is unavailable"); }
      getIO()?.to(`user:${target._id}`).emit("friend:request", {
        requestId: String(record._id), from: { _id: String(req.user._id), name: req.user.name },
      });
      return res.status(201).json({ success: true, status: "pending", requestId: record._id });
    } catch (error) {
      if (error.code !== 11000) throw error;
      record = await Friendship.findOne({ pairKey: key });
    }
  }
  if (record?.status === "pending" && record.recipient.equals(req.user._id)) {
    const accepted = await Friendship.findOneAndUpdate({ _id: record._id, status: "pending", recipient: req.user._id },
      { status: "accepted" }, { returnDocument: "after" });
    if (accepted) {
      if (await isBlocked(accepted.requester, accepted.recipient)) { await Friendship.deleteOne({ _id: accepted._id }); throw new HttpError(403, "This request is unavailable"); }
      await publishAcceptance(accepted);
      return res.json({ success: true, status: "accepted", user: publicFriend(target) });
    }
  }
  throw new HttpError(409, record?.status === "accepted" ? "Already friends" : "Friend request already pending");
});

export const listRequests = asyncHandler(async (req, res) => {
  const records = await Friendship.find({ status: "pending", $or: [{ requester: req.user._id }, { recipient: req.user._id }] })
    .populate("requester recipient", "name").sort({ createdAt: -1 });
  const incoming = [], outgoing = [];
  for (const record of records) {
    if (!record.requester || !record.recipient) continue;
    const received = record.recipient._id.equals(req.user._id);
    const user = received ? record.requester : record.recipient;
    (received ? incoming : outgoing).push({ _id: record._id, user: { _id: user._id, name: user.name }, createdAt: record.createdAt });
  }
  res.json({ success: true, incoming, outgoing });
});

export const acceptRequest = asyncHandler(async (req, res) => {
  validateId(req.params.id);
  const record = await Friendship.findById(req.params.id);
  if (!record) throw new HttpError(404, "Request not found");
  if (!record.recipient.equals(req.user._id)) throw new HttpError(403, "Only the recipient can accept this request");
  if (await isBlocked(record.requester, record.recipient)) throw new HttpError(403, "This request is unavailable");
  const accepted = await Friendship.findOneAndUpdate({ _id: record._id, status: "pending", recipient: req.user._id },
    { status: "accepted" }, { returnDocument: "after" });
  if (!accepted) throw new HttpError(409, "Request is no longer pending");
  if (await isBlocked(accepted.requester, accepted.recipient)) { await Friendship.deleteOne({ _id: accepted._id }); throw new HttpError(403, "This request is unavailable"); }
  const { requester } = await publishAcceptance(accepted);
  res.json({ success: true, status: "accepted", user: publicFriend(requester) });
});

const removeRequest = (role) => asyncHandler(async (req, res) => {
  validateId(req.params.id);
  const record = await Friendship.findById(req.params.id);
  if (!record) throw new HttpError(404, "Request not found");
  if (!record[role].equals(req.user._id)) throw new HttpError(403, "You cannot remove this request");
  if (record.status !== "pending") throw new HttpError(409, "Request is no longer pending");
  const removed = await Friendship.deleteOne({ _id: record._id, status: "pending", [role]: req.user._id });
  if (!removed.deletedCount) throw new HttpError(409, "Request is no longer pending");
  const other = role === "recipient" ? record.requester : record.recipient;
  getIO()?.to(`user:${other}`).emit("friend:request:removed", { requestId: String(record._id) });
  res.json({ success: true });
});
export const declineRequest = removeRequest("recipient");
export const cancelRequest = removeRequest("requester");

export const listFriends = asyncHandler(async (req, res) => {
  const ids = await getFriendIds(req.user._id);
  const friends = await User.find({ _id: { $in: ids }, isBot: { $ne: true } }).select("name email avatar about lastSeenAt").sort({ name: 1 });
  res.json({ success: true, friends });
});

export const unfriend = asyncHandler(async (req, res) => {
  validateId(req.params.userId);
  const target = await User.findById(req.params.userId);
  if (!target) throw new HttpError(404, "User not found");
  if (target.isBot) throw new HttpError(400, "Buddy cannot be unfriended");
  const removed = await Friendship.findOneAndDelete({ pairKey: pairKey(req.user._id, target._id), status: "accepted" });
  if (!removed) throw new HttpError(404, "Friendship not found");
  const io = getIO();
  if (io) io.friendshipRevision++;
  getIO()?.to(`user:${target._id}`).emit("friend:removed", { userId: String(req.user._id) });
  // Synchronize the caller's other tabs, too.
  getIO()?.to(`user:${req.user._id}`).emit("friend:removed", { userId: String(target._id) });
  res.json({ success: true });
});
