// Remove only APP1 Exif segments. All other bytes, including compressed scan
// data, are copied verbatim. A malformed/unsupported stream is returned intact.
export function stripJpegExif(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const fail = () => ({ bytes, valid: false, removed: false });
  if (bytes[0] !== 255 || bytes[1] !== 216) return fail();
  let position = 2, scan = false, ended = false;
  const ranges = [];
  while (position < bytes.length) {
    if (scan) {
      while (position < bytes.length && bytes[position] !== 255) position++;
      if (position >= bytes.length) return fail();
      let after = position + 1; while (bytes[after] === 255) after++;
      const marker = bytes[after];
      if (marker === 0 || (marker >= 208 && marker <= 215)) { position = after + 1; continue; }
      scan = false;
    }
    const start = position;
    if (bytes[position++] !== 255) return fail();
    while (bytes[position] === 255) position++;
    const marker = bytes[position++];
    if (marker === 217) { ended = true; break; }
    if (marker === undefined || marker === 0 || marker === 216) return fail();
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    if (position + 2 > bytes.length) return fail();
    const length = bytes[position] * 256 + bytes[position + 1], end = position + length;
    if (length < 2 || end > bytes.length) return fail();
    if (marker === 225 && length >= 8 && [69,120,105,102,0,0].every((value, i) => bytes[position + 2 + i] === value)) ranges.push([start, end]);
    position = end; if (marker === 218) scan = true;
  }
  if (!ended) return fail();
  if (!ranges.length) return { bytes, valid: true, removed: false };
  const result = new Uint8Array(bytes.length - ranges.reduce((sum, [start, end]) => sum + end - start, 0));
  let from = 0, written = 0;
  for (const [start, end] of ranges) { result.set(bytes.subarray(from, start), written); written += start - from; from = end; }
  result.set(bytes.subarray(from), written);
  return { bytes: result, valid: true, removed: true };
}
