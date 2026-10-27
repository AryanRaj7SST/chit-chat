import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function encryptionKey() {
  const value = process.env.MESSAGE_ENC_KEY;
  if (!value) {
    if (process.env.NODE_ENV === "production") throw new Error("MESSAGE_ENC_KEY is required in production");
    return null;
  }
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value) || Buffer.from(value, "base64").length !== 32) throw new Error("MESSAGE_ENC_KEY must be 32 bytes encoded as base64");
  return Buffer.from(value, "base64");
}
export function encrypt(value) {
  if (typeof value !== "string" || !value) return value;
  const key = encryptionKey(); if (!key) return value;
  // Always encrypt input, even strings resembling an envelope: accepting client
  // ciphertext here would turn the API into a decryption oracle for leaked dumps.
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ciphertext.toString("base64")}`;
}
export function decrypt(value) {
  if (typeof value !== "string" || !value.startsWith("v1:")) return value;
  try {
    const key = encryptionKey(); if (!key) throw new Error();
    const parts = value.split(":"); if (parts.length !== 4) throw new Error();
    const iv = Buffer.from(parts[1], "base64"), tag = Buffer.from(parts[2], "base64");
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key, iv); decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64")), decipher.final()]).toString("utf8");
  } catch { throw new Error("Unable to decrypt protected field"); }
}
export const protectedString = { type: String, set: encrypt, get: decrypt };
