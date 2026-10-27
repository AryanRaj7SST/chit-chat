import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import Message from "../src/models/Message.js";
import { imageMime, parseKey } from "../src/storage/policy.js";
import { characterCount } from "../src/utils/validators.js";

test("image magic checks reject masquerading HTML and distinguish supported headers", () => {
  assert.equal(imageMime(Buffer.from([255,216,255,0])), "image/jpeg");
  assert.equal(imageMime(Buffer.from([137,80,78,71,13,10,26,10])), "image/png");
  assert.equal(imageMime(Buffer.from("GIF89a")), "image/gif");
  assert.equal(imageMime(Buffer.from("RIFF0000WEBP")), "image/webp");
  for (const bad of ["<svg></svg>", "<html>", "RIFF0000WAVE", "GIF8", ""]) assert.equal(imageMime(Buffer.from(bad)), null);
  assert.equal(parseKey("../../.env"), null);
  assert.equal(parseKey("c/507f1f77bcf86cd799439011/../x.png"), null);
});
test("image-only content is optional for documents and atomic upserts; text is still required", async () => {
  const base = { conversation: "507f1f77bcf86cd799439011", sender: "507f1f77bcf86cd799439012" };
  await new Message({ ...base, type: "image", content: "" }).validate();
  await assert.rejects(new Message({ ...base, content: "" }).validate());
  const required = Message.schema.path("content").options.required;
  assert.equal(required.call({ getUpdate: () => ({ $setOnInsert: { type: "image" } }) }), false);
  assert.equal(required.call({ getUpdate: () => ({ $setOnInsert: { type: "text" } }) }), true);
  assert.equal(characterCount("👨‍👩‍👧‍👦👍🏽🇮🇳"), 3);
  await new Message({ ...base, content: "😀".repeat(2000) }).validate();
  await assert.rejects(new Message({ ...base, content: "😀".repeat(2001) }).validate());
});
test("local storage cannot start in production", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", "import {getStorage} from './src/storage/index.js'; try { getStorage(); process.exit(1); } catch(e) { process.exit(e.message.includes('disabled in production') ? 0 : 2); }"],
    { env: { ...process.env, NODE_ENV: "production", STORAGE_DRIVER: "local" }, encoding: "utf8" });
  assert.equal(result.status, 0);
});
