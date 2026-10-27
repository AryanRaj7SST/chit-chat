import HttpError from "../utils/HttpError.js";

const buckets = new Map();
export const friendRateLimit = (req, res, next) => {
  const now = Date.now();
  for (const [key, value] of buckets) if (value.until <= now) buckets.delete(key);
  const key = String(req.user._id);
  const bucket = buckets.get(key) || { count: 0, until: now + 3600000 };
  if (bucket.count >= 20) {
    res.set("Retry-After", String(Math.ceil((bucket.until - now) / 1000)));
    return next(new HttpError(429, "You can send at most 20 friend requests per hour"));
  }
  bucket.count++;
  buckets.set(key, bucket);
  next();
};
