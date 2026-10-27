import axios from "axios";
import api from "./api";

const cache = new Map();
export const clearMediaCache = () => cache.clear();
export async function mediaUrl(key, fresh = false) {
  const saved = cache.get(key);
  if (!fresh && saved && saved.until > Date.now()) return saved.promise;
  const promise = api.get("/media", { params: { key } }).then(({ data }) => data.url);
  cache.set(key, { promise, until: Date.now() + 50000 });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  try { return await promise; } catch (error) { cache.delete(key); throw error; }
}
export function sniffImage(bytes) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if ([137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v)) return "image/png";
  const ascii = (a, b) => String.fromCharCode(...bytes.slice(a, b));
  if (["GIF87a", "GIF89a"].includes(ascii(0, 6))) return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}
export const allowedImages = "image/jpeg,image/png,image/webp,image/gif";
export async function prepareImage(file) {
  if (file.size > 25 * 1024 * 1024) throw new Error("Photos must be 25 MB or smaller.");
  const mime = sniffImage(new Uint8Array(await file.slice(0, 32).arrayBuffer()));
  if (!mime) throw new Error("Choose a JPEG, PNG, WebP, or GIF with valid image bytes. SVG and HEIC are not supported.");
  // The original File is kept untouched, regardless of its name or browser MIME.
  let thumb, width, height, bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    width = bitmap.width; height = bitmap.height;
    const scale = Math.min(1, 480 / width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    thumb = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (thumb?.size > 400 * 1024) thumb = null;
  } catch { /* A valid original can be sent even if thumbnail decoding fails. */ }
  finally { bitmap?.close(); }
  return { file, mime, thumb, width, height };
}
export async function uploadImage(blob, mime, conversationId, kind, dimensions, signal, progress) {
  const { data } = await api.post("/uploads/sign", { conversationId, kind, mime, size: blob.size, ...dimensions }, { signal });
  // A separate axios instance sends no application JWT to an R2 host.
  const local = new URL(data.upload.url).pathname.startsWith("/api/uploads/local/");
  const headers = { ...data.upload.headers };
  if (local) headers.Authorization = api.defaults.headers.common.Authorization || `Bearer ${localStorage.getItem("chat_token") || ""}`;
  await axios.request({ url: data.upload.url, method: data.upload.method, headers, data: blob, signal,
    onUploadProgress: event => progress?.(Math.round((event.loaded / (event.total || blob.size)) * 100)) });
  return data.key;
}
