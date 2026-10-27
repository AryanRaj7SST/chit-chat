import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { encrypt, decrypt } from "../src/security/encryption.js";
import { passwordError } from "../src/security/passwords.js";
import { createLimiter } from "../src/security/rateLimit.js";
import { validPayload } from "../src/security/socketPolicy.js";
import Message from "../src/models/Message.js";
import User from "../src/models/User.js";

test("AES-GCM round trips, randomizes IVs, rejects tampering, and encrypts envelope-like user input", async () => {
  const previous = process.env.MESSAGE_ENC_KEY;
  process.env.MESSAGE_ENC_KEY = randomBytes(32).toString("base64");
  try {
    const a = encrypt("Private message 😀"), b = encrypt("Private message 😀");
    assert.notEqual(a, b); assert.equal(decrypt(a), "Private message 😀");
    assert.equal(decrypt("Legacy plaintext"), "Legacy plaintext");
    const parts = a.split(":"); const badTag = Buffer.from(parts[2], "base64"); badTag[0] ^= 1; parts[2] = badTag.toString("base64");
    assert.throws(() => decrypt(parts.join(":")), /Unable to decrypt/);
    const message = new Message({ conversation: "507f1f77bcf86cd799439011", sender: "507f1f77bcf86cd799439012", content: "v1:not:an:envelope", caption: "Secret caption" });
    await message.validate();
    assert.match(message.$__getValue("content"), /^v1:/);
    assert.notEqual(message.$__getValue("content"), "v1:not:an:envelope");
    assert.equal(message.toObject().content, "v1:not:an:envelope");
    assert.equal(message.toJSON().caption, "Secret caption");
    const user = new User({ name: "Example", email: "example@example.com", password: "Test-Safe-123!", about: "Private about" });
    await user.validate(); assert.notEqual(user.$__getValue("about"), "Private about"); assert.equal(user.toPublic().about, "Private about");
    assert.equal(user.toObject().about, "Private about"); assert.equal(user.toJSON().about, "Private about");
  } finally { if (previous === undefined) delete process.env.MESSAGE_ENC_KEY; else process.env.MESSAGE_ENC_KEY = previous; }
});
test("production fails closed without an encryption key", () => {
  const env = { ...process.env, NODE_ENV: "production" }; delete env.MESSAGE_ENC_KEY;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", "import {encryptionKey} from './src/security/encryption.js'; try { encryptionKey(); process.exit(1); } catch { process.exit(0); }"], { env });
  assert.equal(result.status, 0);
});
test("password policy, limiter windows, and socket payload allowlists", () => {
  assert.ok(passwordError("short")); assert.ok(passwordError("password123")); assert.ok(passwordError("😀".repeat(19))); assert.equal(passwordError("Test-Uncommon-42!"), null);
  let now = 0; const limit = createLimiter(2, 1000, () => now);
  assert.ok(limit("one").allowed); assert.ok(limit("one").allowed); assert.equal(limit("one").allowed, false); assert.ok(limit("two").allowed); now = 1001; assert.ok(limit("one").allowed);
  assert.ok(validPayload("message:send", { conversationId: "id", content: "text", tempId: "tmp" }));
  assert.equal(validPayload("message:send", { conversationId: "id", sender: "spoof", content: "text" }), false);
  assert.equal(validPayload("message:send", { conversationId: "id", attachments: [{ key: "x", mime: "client-value" }] }), false);
  assert.equal(validPayload("message:read", { conversationId: "id", at: "forged" }), false);
  assert.equal(validPayload("unknown:event", {}), false);
});
