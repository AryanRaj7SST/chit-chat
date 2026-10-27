import User from "../models/User.js";
import Upload from "../models/Upload.js";
import { getStorage } from "../storage/index.js";
import { imageMime, parseAvatarKey } from "../storage/policy.js";
import { cleanMessageContent, characterCount } from "../utils/validators.js";
import asyncHandler from "../utils/asyncHandler.js";
import HttpError from "../utils/HttpError.js";

export const updateProfile = asyncHandler(async (req, res) => {
  const patch = {}, id = String(req.user._id), storage = getStorage();
  if (req.body?.name !== undefined) {
    const name = cleanMessageContent(req.body.name);
    if (name.length < 2 || name.length > 50) throw new HttpError(400, "Name must be 2–50 characters");
    patch.name = name;
  }
  if (req.body?.about !== undefined) {
    if (typeof req.body.about !== "string") throw new HttpError(400, "About must be text");
    patch.about = cleanMessageContent(req.body.about);
    if (characterCount(patch.about) > 140 || Buffer.byteLength(patch.about) > 4000) throw new HttpError(400, "About is limited to 140 characters");
  }
  if (req.body?.avatar) {
    const keys = req.body.avatar;
    for (const [field, kind] of [["key", "avatar-original"], ["thumbKey", "avatar-thumb"]]) {
      const key = keys[field], parsed = parseAvatarKey(key);
      if (!parsed || parsed[1] !== id) throw new HttpError(403, "Avatar belongs to another user");
      const upload = await Upload.findOne({ key, user: id, kind, expiresAt: { $gt: new Date() } });
      const head = upload && await storage.head(key);
      if (!head || head.size !== upload.size || head.mime !== upload.mime || imageMime(await storage.getRange(key, 0, 31)) !== head.mime) {
        if (upload && !upload.claim) { await storage.remove(key); await Upload.deleteOne({ _id: upload._id }); }
        throw new HttpError(400, "Avatar upload is invalid or expired");
      }
      if (field === "key") patch.avatar = { key, mime: head.mime, size: head.size, width: upload.width, height: upload.height };
      else patch.avatar.thumbKey = key;
    }
  }
  if (!Object.keys(patch).length) throw new HttpError(400, "No profile fields supplied");
  const user = await User.findByIdAndUpdate(id, { $set: patch }, { returnDocument: "after", runValidators: true });
  if (patch.avatar) {
    await Upload.updateMany({ user: id, key: { $in: [patch.avatar.key, patch.avatar.thumbKey] } }, { $set: { claim: id } });
    await Promise.allSettled([req.user.avatar?.key, req.user.avatar?.thumbKey].filter(key => key && ![patch.avatar.key, patch.avatar.thumbKey].includes(key)).map(key => storage.remove(key)));
  }
  res.json({ success: true, user: user.toPublic() });
});
