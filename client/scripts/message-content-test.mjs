import assert from "node:assert/strict";
import test from "node:test";
import { splitMessageContent } from "../src/utils/messageContent.js";

test("fenced code stays separate from surrounding text without HTML interpretation", () => {
  assert.deepEqual(splitMessageContent('Before\n```js\nconst tag = "<img onerror=evil()>";\n```\nAfter'), [
    { type: "text", text: "Before\n" },
    { type: "code", language: "js", text: 'const tag = "<img onerror=evil()>";' },
    { type: "text", text: "\nAfter" },
  ]);
});
test("multiple blocks, CRLF, missing language and unfinished fences preserve content", () => {
  assert.deepEqual(splitMessageContent("```\r\na\r\n```\n```js\nb\n```"), [
    { type: "code", language: "text", text: "a" }, { type: "text", text: "\n" },
    { type: "code", language: "js", text: "b" },
  ]);
  assert.deepEqual(splitMessageContent("unfinished ```js\n<hello>"), [{ type: "text", text: "unfinished ```js\n<hello>" }]);
});
