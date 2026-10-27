import { local } from "./local.js";
import { createR2 } from "./r2.js";
import { createS3 } from "./s3.js";

let driver;
const requireStorageEnv = (keys) => {
  for (const key of keys) if (!process.env[key]) throw new Error(`Missing ${key} for STORAGE_DRIVER=${process.env.STORAGE_DRIVER}`);
};

export function getStorage() {
  if (driver) return driver;
  const kind = process.env.STORAGE_DRIVER || "local";
  if (kind === "local") {
    if (process.env.NODE_ENV === "production") throw new Error("Local uploads are disabled in production; configure private R2 storage");
    driver = local;
  } else if (kind === "r2") {
    requireStorageEnv(["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]);
    driver = createR2();
  } else if (kind === "s3") {
    requireStorageEnv(["S3_ENDPOINT", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_BUCKET"]);
    driver = createS3({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION,
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      bucket: process.env.S3_BUCKET,
    });
  } else throw new Error(`STORAGE_DRIVER must be one of: local, r2, s3 (received ${kind})`);
  return driver;
}
