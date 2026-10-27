import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export function createR2() {
  const client = new S3Client({ region: "auto", endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
  const Bucket = process.env.R2_BUCKET;
  return {
    async createUploadUrl({ key, mime, size }) {
      const command = new PutObjectCommand({ Bucket, Key: key, ContentType: mime, ContentLength: size, IfNoneMatch: "*" });
      const url = await getSignedUrl(client, command, { expiresIn: 600, signableHeaders: new Set(["content-type", "if-none-match"]) });
      return { url, method: "PUT", headers: { "Content-Type": mime, "If-None-Match": "*" } };
    },
    async createDownloadUrl(key, ttlSeconds) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket, Key: key, ResponseContentDisposition: 'inline; filename="photo"' }), { expiresIn: ttlSeconds });
    },
    async head(key) {
      try { const data = await client.send(new HeadObjectCommand({ Bucket, Key: key })); return { size: data.ContentLength, mime: data.ContentType }; }
      catch (error) { if (error.$metadata?.httpStatusCode === 404) return null; throw new Error("Storage lookup failed"); }
    },
    async getRange(key, start, end) { const data = await client.send(new GetObjectCommand({ Bucket, Key: key, Range: `bytes=${start}-${end}` })); return Buffer.from(await data.Body.transformToByteArray()); },
    async remove(key) { await client.send(new DeleteObjectCommand({ Bucket, Key: key })); },
  };
}
