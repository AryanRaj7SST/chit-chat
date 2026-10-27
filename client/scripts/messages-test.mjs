import assert from "node:assert/strict";
import test from "node:test";
import { mergeMessages } from "../src/utils/messages.js";

const optimistic = { _id: "tmp-1", tempId: "tmp-1", sender: "a", content: "hello", createdAt: "2026-01-01T00:00:00Z", status: "sending" };
const saved = { ...optimistic, _id: "saved-1", status: undefined };
const reply = { _id: "saved-2", sender: "b", content: "reply", createdAt: "2026-01-01T00:00:01Z" };

test("history before ack reconciles the optimistic message without duplicates", () => {
  const history = mergeMessages([optimistic], [saved]);
  const ack = mergeMessages(history, [{ ...saved, status: "sent" }]);
  assert.equal(ack.length, 1);
  assert.equal(ack[0]._id, saved._id);
  assert.equal(ack[0].status, "sent");
});

test("stale history preserves a newer socket event", () => {
  assert.deepEqual(mergeMessages([saved, reply], [saved]), [saved, reply]);
});

test("replayed socket events and reconnect snapshots remain unique", () => {
  assert.equal(mergeMessages(mergeMessages([saved], [saved, reply]), [saved, reply]).length, 2);
});

test("a persisted message reconciles a failed acknowledgement", () => {
  const messages = mergeMessages([{ ...optimistic, status: "failed" }], [saved]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].status, "sent");
});
