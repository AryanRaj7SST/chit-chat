import { mkdir, open, stat, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import jwt from "jsonwebtoken";
import { MIME_EXT, isStorageKey } from "./policy.js";

const root = fileURLToPath(new URL("../../.uploads/", import.meta.url));
const base = () => (process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/+$/, "");
const file = key => {
  if (!isStorageKey(key)) throw new Error("Invalid storage key");
  const target = path.resolve(root, key);
  if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error("Invalid storage path");
  return target;
};
const token = (claims, expiresIn) => jwt.sign(claims, process.env.JWT_SECRET, { algorithm: "HS256", audience: "local-media", expiresIn });
export const verifyLocalToken = (value, purpose) => {
  const claims = jwt.verify(value, process.env.JWT_SECRET, { algorithms: ["HS256"], audience: "local-media" });
  if (claims.purpose !== purpose || !isStorageKey(claims.key)) throw new Error("Invalid media token");
  return claims;
};
export const local = {
  async createUploadUrl({ key, mime, size }) {
    return { url: `${base()}/api/uploads/local/${token({ purpose: "upload", key, mime, size }, 600)}`, method: "PUT", headers: { "Content-Type": mime, "If-None-Match": "*" } };
  },
  async createDownloadUrl(key, ttlSeconds) { return `${base()}/api/uploads/local/${token({ purpose: "download", key }, ttlSeconds)}`; },
  async head(key) {
    try { const info = await stat(file(key)); return { size: info.size, mime: Object.entries(MIME_EXT).find(([, ext]) => key.endsWith(`.${ext}`))?.[0] }; }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  },
  async getRange(key, start, end) {
    const handle = await open(file(key), "r");
    try { const buffer = Buffer.alloc(end - start + 1); const { bytesRead } = await handle.read(buffer, 0, buffer.length, start); return buffer.subarray(0, bytesRead); }
    finally { await handle.close(); }
  },
  async remove(key) { await unlink(file(key)).catch(error => { if (error.code !== "ENOENT") throw error; }); },
  async put(key, bytes) { const target = file(key); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes, { flag: "wx" }); },
  path: file,
};
