import { local } from "../src/storage/local.js";
import { parseKey, parseAvatarKey } from "../src/storage/policy.js";

export async function removeDisposableUsers(db, users) {
  if (!users.length) return 0;
  if (users.some(user => !/@(?:test\.com|example\.com)$/.test(user.email) || !/^(Test |Feature Alice$|E2E |Media UI Test|Updated Media Profile|CSP Browser Test)/.test(user.name))) throw new Error("Refusing fixture cleanup outside disposable account scope");
  const ids = users.map(user => user._id), owners = new Set(ids.map(String));
  const conversations = await db.collection("conversations").find({ participants: { $in: ids } }, { projection: { _id: 1 } }).toArray();
  const conversationIds = conversations.map(c => c._id), scopes = new Set(conversationIds.map(String));
  const uploads = await db.collection("uploads").find({ user: { $in: ids } }).toArray();
  for (const upload of uploads) {
    const chat = parseKey(upload.key), avatar = parseAvatarKey(upload.key);
    if (!((chat && scopes.has(chat[1])) || (avatar && owners.has(avatar[1])))) throw new Error("Refusing fixture cleanup outside owned storage scopes");
    await local.remove(upload.key);
  }
  await db.collection("messages").deleteMany({ conversation: { $in: conversationIds } });
  await db.collection("uploads").deleteMany({ user: { $in: ids } });
  await db.collection("friendships").deleteMany({ $or: [{ requester: { $in: ids } }, { recipient: { $in: ids } }] });
  await db.collection("blocks").deleteMany({ $or: [{ blocker: { $in: ids } }, { blocked: { $in: ids } }] });
  await db.collection("conversationsettings").deleteMany({ user: { $in: ids } });
  await db.collection("conversations").deleteMany({ _id: { $in: conversationIds } });
  await db.collection("users").deleteMany({ _id: { $in: ids } });
  return ids.length;
}
