import assert from "node:assert/strict";
import test from "node:test";
import { stripJpegExif } from "../src/utils/jpegPrivacy.js";
import { passwordError } from "../src/utils/passwords.js";

const segment = (marker, data) => [255, marker, (data.length + 2) >> 8, (data.length + 2) & 255, ...data];
const exif = segment(225, [69,120,105,102,0,0,71,80,83]);
test("removing APP1 Exif preserves every compressed-image and non-Exif byte", () => {
  const xmp = segment(225, [88,77,80,32,100,97,116,97]);
  const scan = [...segment(218, [1,2]), 11,22,255,0,33,255,208,44,255,217];
  const original = new Uint8Array([255,216,...xmp,...scan]);
  const withExif = new Uint8Array([255,216,...exif,...xmp,...scan]);
  const result = stripJpegExif(withExif);
  assert.equal(result.valid, true); assert.equal(result.removed, true);
  assert.deepEqual(result.bytes, original); // Includes byte-identical compressed pixel data.
  assert.deepEqual(withExif.subarray(2, 2 + exif.length), new Uint8Array(exif)); // Input is not mutated.
  const progressive = new Uint8Array([255,216,...segment(218,[1]),1,2,...exif,...segment(218,[2]),3,255,0,4,255,217]);
  assert.deepEqual(stripJpegExif(progressive).bytes, new Uint8Array([255,216,...segment(218,[1]),1,2,...segment(218,[2]),3,255,0,4,255,217]));
});
test("malformed JPEGs are returned untouched and password rules match the server", () => {
  for (const input of [new Uint8Array([255,216,255,225,255,255]), new Uint8Array([1,2,3]), new Uint8Array([255,216,...exif])]) {
    const result = stripJpegExif(input); assert.equal(result.valid, false); assert.deepEqual(result.bytes, input);
  }
  assert.ok(passwordError("password123")); assert.ok(passwordError("short")); assert.equal(passwordError("Test-Uncommon-42!"), null);
});
