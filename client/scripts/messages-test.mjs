import assert from "node:assert/strict";
import test from "node:test";
import { latestReadAt, mergeMessages } from "../src/utils/messages.js";
import { formatMessageDate, sameMessageGroup } from "../src/utils/format.js";

const optimistic = { _id: "tmp-1", tempId: "tmp-1", sender: "a", content: "hello", createdAt: "2026-01-01T00:00:00Z", status: "sending" };
const saved = { ...optimistic, _id: "saved-1", status: undefined };
const reply = { _id: "saved-2", sender: "b", content: "reply", createdAt: "2026-01-01T00:00:01Z" };

test("history before ack reconciles the optimistic message without duplicates", () => {
  const history = mergeMessages([optimistic], [saved]);
  assert.equal(history[0].status, "sending");
  const ack = mergeMessages(history, [{ ...saved, status: "sent" }]);
  assert.equal(ack.length, 1);
  assert.equal(ack[0]._id, saved._id);
  assert.equal(ack[0].status, "sent");
});

test("read receipts stay monotonic when history and live events arrive out of order", () => {
  const before = "2026-01-01T00:00:00Z";
  const after = "2026-01-01T00:01:00Z";
  assert.equal(latestReadAt(after, before), after);
  assert.equal(latestReadAt(before, after), after);
  assert.equal(latestReadAt(null, after), after);
});

test("date labels and sender groups respect calendar boundaries", () => {
  const today = new Date(2026, 9, 27, 12);
  assert.equal(formatMessageDate(new Date(2026, 9, 27, 1), today), "Today");
  assert.equal(formatMessageDate(new Date(2026, 9, 26, 23), today), "Yesterday");
  assert.equal(sameMessageGroup(saved, reply), false);
  assert.equal(sameMessageGroup(saved, { ...reply, sender: "a" }), true);
  assert.equal(sameMessageGroup(saved, { ...saved, createdAt: "2026-01-02T00:00:00Z" }), false);
});

test("stale history preserves a newer socket event", () => {
  assert.deepEqual(mergeMessages([saved, reply], [saved]), [saved, reply]);
});

test("replayed socket events and reconnect snapshots remain unique", () => {
  assert.equal(mergeMessages(mergeMessages([saved], [saved, reply]), [saved, reply]).length, 2);
});

test("a persisted message stays unique without claiming sent before the acknowledgement", () => {
  const messages = mergeMessages([{ ...optimistic, status: "failed" }], [saved]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].status, "failed");
});
