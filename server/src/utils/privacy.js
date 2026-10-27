import User from "../models/User.js";
import { getFriendIds, isBlocked } from "./friendship.js";
export async function canSeePresence(subject, viewerId) {
  if (subject.deleting) return false;
  if (subject.isBot) return true;
  if (String(subject._id) === String(viewerId)) return true;
  if (await isBlocked(subject._id, viewerId)) return false;
  const visibility = subject.settings?.presence || "friends";
  return visibility === "everyone" || (visibility === "friends" && (await getFriendIds(subject._id)).some(id => String(id) === String(viewerId)));
}
export async function privateProfile(user, viewerId) {
  const profile = user.toObject ? user.toObject() : { ...user };
  if (!(await canSeePresence(user, viewerId))) profile.lastSeenAt = null;
  delete profile.settings; delete profile.deleting; delete profile.password; delete profile.tokenVersion;
  return profile;
}
export async function visibleRecipients(userId, viewerIds) {
  const subject = await User.findById(userId);
  if (!subject) return [];
  const allowed = await Promise.all(viewerIds.map(async id => await canSeePresence(subject, id) ? id : null));
  return allowed.filter(Boolean);
}
