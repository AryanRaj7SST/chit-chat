import { createS3 } from "./s3.js";

export function createR2() {
  return createS3({
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: "auto",
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
  });
}
