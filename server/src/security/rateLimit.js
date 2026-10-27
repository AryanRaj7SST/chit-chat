import { createHash } from "node:crypto";

export function createLimiter(limit, windowMs, clock = Date.now) {
  const records = new Map();
  return key => {
    const now = clock();
    for (const [id, record] of records) if (record.until <= now) records.delete(id);
    if (!records.has(key) && records.size >= 50000) return { allowed: false, retryAfter: Math.ceil(windowMs / 1000) };
    const record = records.get(key) || { count: 0, until: now + windowMs };
    record.count++; records.set(key, record);
    return { allowed: record.count <= limit, retryAfter: Math.max(1, Math.ceil((record.until - now) / 1000)) };
  };
}
export const loginLimit = createLimiter(10, 15 * 60000);
export const registerLimit = createLimiter(5, 3600000);
export const apiLimit = createLimiter(300, 60000);
const emailHash = value => createHash("sha256").update(typeof value === "string" ? value.trim().toLowerCase().slice(0, 254) : "").digest("hex");
export const limitRoute = (limiter, key) => (req, res, next) => {
  const result = limiter(key(req));
  if (!result.allowed) return res.set("Retry-After", String(result.retryAfter)).status(429).json({ success: false, message: "Too many requests. Try again later." });
  next();
};
export const limitLogin = limitRoute(loginLimit, req => `${req.ip}:${emailHash(req.body?.email)}`);
export const limitRegister = limitRoute(registerLimit, req => req.ip);
