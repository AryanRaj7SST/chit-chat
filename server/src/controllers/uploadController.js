import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Upload from "../models/Upload.js";
import User from "../models/User.js";
import { notExpired } from "../utils/messageView.js";
import { canMessage, isBlocked } from "../utils/friendship.js";
import HttpError from "../utils/HttpError.js";
import { getStorage } from "../storage/index.js";
import { local, verifyLocalToken } from "../storage/local.js";
import { MAX_ORIGINAL, MAX_THUMB, MIME_EXT, imageMime, parseKey, parseAvatarKey } from "../storage/policy.js";

const limits = new Map();
export const validDimension = value => Number.isInteger(value) && value > 0 && value <= 100000;
export async function requireImageConversation(id, user) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, "Invalid conversation");
  const conversation = await Conversation.findOne({ _id: id, participants: user });
  if (!conversation) throw new HttpError(403, "Conversation access denied");
  const other = conversation.participants.find(id => String(id) !== String(user));
  if ((await User.findById(other).select("isBot"))?.isBot) throw new HttpError(400, "Buddy can't see images yet");
  if (!(await canMessage(user, other))) throw new HttpError(403, "You are no longer friends");
  return conversation;
}
export async function signUpload(req, res) {
  const now = Date.now();
  for (const [key, value] of limits) if (value.until <= now) limits.delete(key);
  const user = String(req.user._id);
  const count = limits.get(user) || { attempts: 0, until: now + 600000 };
  if (++count.attempts > 30) throw new HttpError(429, "Too many uploads. Try again in ten minutes.");
  limits.set(user, count);
  const { conversationId, kind, mime, size, width, height } = req.body || {};
  const avatar = ["avatar-original", "avatar-thumb"].includes(kind);
  if (!avatar) await requireImageConversation(conversationId, user);
  if (!["original", "thumb", "avatar-original", "avatar-thumb"].includes(kind) || !Object.hasOwn(MIME_EXT, mime || "")) throw new HttpError(400, "Only JPEG, PNG, WebP, and GIF images are supported");
  if (!Number.isInteger(size) || size <= 0 || size > (kind.endsWith("thumb") ? MAX_THUMB : MAX_ORIGINAL)) throw new HttpError(400, "Image exceeds the upload size limit");
  if ([width, height].some(value => value !== undefined && !validDimension(value))) throw new HttpError(400, "Invalid image dimensions");
  if (kind === "avatar-thumb" && (!validDimension(width) || !validDimension(height) || width > 512 || height > 512)) throw new HttpError(400, "Avatar thumbnails must fit within 512px");
  const key = `${avatar ? `u/${user}` : `c/${String(conversationId).toLowerCase()}`}/${randomUUID()}.${MIME_EXT[mime]}`;
  await Upload.create({ key, user, ...(!avatar ? { conversation: conversationId } : {}), kind, mime, size, width, height, expiresAt: new Date(now + 3600000) });
  const upload = await getStorage().createUploadUrl({ key, mime, size });
  res.json({ key, upload });
}
export async function localPut(req, res) {
  if (getStorage() !== local) throw new HttpError(404, "Local uploads are disabled");
  let claims;
  try { claims = verifyLocalToken(req.params.token, "upload"); } catch { throw new HttpError(401, "Upload link expired or invalid"); }
  const signed = await Upload.findOne({ key: claims.key, user: req.user._id, claim: { $exists: false }, expiresAt: { $gt: new Date() } });
  if (!signed) throw new HttpError(403, "Upload access denied");
  if (signed.conversation) await requireImageConversation(signed.conversation, req.user._id);
  if (!Buffer.isBuffer(req.body) || req.body.length !== claims.size || req.get("Content-Type") !== claims.mime) throw new HttpError(400, "Upload size or type does not match");
  try { await local.put(claims.key, req.body); }
  catch (error) { if (error.code === "EEXIST") throw new HttpError(412, "Upload already exists; request a fresh upload link to retry"); throw new HttpError(500, "Upload failed"); }
  res.status(201).end();
}
export async function localGet(req, res) {
  if (getStorage() !== local) throw new HttpError(404, "Local downloads are disabled");
  let claims;
  try { claims = verifyLocalToken(req.params.token, "download"); } catch { throw new HttpError(401, "Download link expired or invalid"); }
  const info = await local.head(claims.key);
  if (!info) throw new HttpError(404, "Photo not found");
  res.set({ "Content-Type": info.mime, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "Content-Disposition": 'inline; filename="photo"' });
  res.sendFile(local.path(claims.key));
}
export async function mediaUrl(req, res) {
  const key = req.query.key, parsed = parseKey(key);
  const avatar = parseAvatarKey(key);
  if (avatar) {
    if (await isBlocked(req.user._id, avatar[1])) throw new HttpError(403, "Profile access denied");
    if (!(await User.exists({ _id: avatar[1], $or: [{ "avatar.key": key }, { "avatar.thumbKey": key }] }))) throw new HttpError(404, "Photo not found");
    return res.set("Cache-Control", "private, no-store").json({ url: await getStorage().createDownloadUrl(key, 60) });
  }
  if (!parsed) throw new HttpError(400, "Invalid media key");
  if (!(await Conversation.exists({ _id: parsed[1], participants: req.user._id }))) throw new HttpError(403, "Conversation access denied");
  // Unvalidated, pending uploads must never become downloadable chat media.
  if (!(await Message.exists({ conversation: parsed[1], deletedAt: null, $and: [notExpired()], $or: [{ "attachments.key": key }, { "attachments.thumbKey": key }] }))) throw new HttpError(404, "Photo not found");
  res.set("Cache-Control", "private, no-store").json({ url: await getStorage().createDownloadUrl(key, 60) });
}

export async function validateAttachments(items, conversationId, userId) {
  if (!Array.isArray(items) || !items.length || items.length > 10) throw new HttpError(400, "Choose between one and ten images");
  const storage = getStorage(), seen = new Set();
  const check = async (key, kind) => {
    if (!parseKey(key) || !key.startsWith(`c/${conversationId}/`) || seen.has(key)) throw new HttpError(400, "Invalid attachment key");
    seen.add(key);
    const signed = await Upload.findOne({ key, conversation: conversationId, user: userId, kind });
    if (!signed || signed.expiresAt <= new Date()) throw new HttpError(400, "Upload missing or expired; please upload again");
    // Never delete another user's object on a failed validation attempt.
    const info = await storage.head(key);
    const bytes = info ? await storage.getRange(key, 0, 31) : null;
    if (!info || info.size !== signed.size || info.mime !== signed.mime || imageMime(bytes) !== signed.mime) {
      if (!signed.claim) { await storage.remove(key); await Upload.deleteOne({ _id: signed._id }); }
      throw new HttpError(400, "Photo content does not match the signed image type or size");
    }
    return { signed, info };
  };
  const output = [];
  for (const item of items) {
    if (!item || typeof item !== "object") throw new HttpError(400, "Invalid attachment");
    const { signed, info } = await check(item.key, "original");
    if ([item.width, item.height].some(value => value !== undefined && !validDimension(value))) throw new HttpError(400, "Invalid image dimensions");
    if (item.thumbKey) await check(item.thumbKey, "thumb");
    output.push({ key: item.key, ...(item.thumbKey ? { thumbKey: item.thumbKey } : {}), mime: info.mime, size: info.size,
      width: signed.width || item.width, height: signed.height || item.height });
  }
  return output;
}
