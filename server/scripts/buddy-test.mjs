import assert from "node:assert/strict";
import test from "node:test";
import { getBuddyReply, JOKES } from "../src/bot/buddy.js";

test("Buddy rules have no network dependency and support deterministic context", () => {
  const context = { now: new Date("2026-10-27T10:00:00Z"), variant: 0, jokeIndex: 0 };
  for (const text of ["HELLO", "how are you", "who are you", "your name", "help", "what can you do", "what time", "date", "thanks", "bye", "friend", "add", "love", "sad", "bored", "unknown?", "other"]) {
    const reply = getBuddyReply(text, context);
    assert.equal(typeof reply, "string");
    assert.ok(reply.length);
    assert.equal(reply, getBuddyReply(text, context));
  }
  assert.match(getBuddyReply("what time", context), /server time/);
  assert.match(getBuddyReply("random", context), /help/);
  assert.notEqual(getBuddyReply("hello", context), getBuddyReply("hello", { ...context, variant: 1 }));
  assert.equal(new Set(JOKES).size, 8);
  assert.deepEqual(Array.from({ length: 8 }, (_, jokeIndex) => getBuddyReply("joke", { ...context, jokeIndex })), JOKES);
  assert.equal(getBuddyReply("joke", { ...context, jokeIndex: 8 }), JOKES[0]);
});
