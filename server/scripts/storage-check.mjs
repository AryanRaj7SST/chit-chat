import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { getStorage } from "../src/storage/index.js";

const origin = "http://localhost:5173";
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const key = `c/507f1f77bcf86cd799439011/${randomUUID()}.png`;
const storage = getStorage();
let failed = 0;
const check = (name, ok) => {
  process.stdout.write(`${ok ? "PASS" : "FAIL"} - ${name}\n`);
  if (!ok) failed++;
};
const header = (response, name) => response.headers.get(name) || "(missing)";
const includesToken = (value, token) => value.split(",").map(item => item.trim().toLowerCase()).includes(token.toLowerCase());

if (process.env.STORAGE_DRIVER === "local" || !["r2", "s3"].includes(process.env.STORAGE_DRIVER)) {
  throw new Error("storage:check requires STORAGE_DRIVER=r2 or STORAGE_DRIVER=s3; local storage has no browser-presigned S3 URL");
}

let upload;
try {
  upload = await storage.createUploadUrl({ key, mime: "image/png", size: png.length });
  const requestedHeaders = Object.keys(upload.headers).join(", ");
  const preflight = await fetch(upload.url, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": requestedHeaders,
    },
  });
  process.stdout.write(`CORS Access-Control-Allow-Origin: ${header(preflight, "Access-Control-Allow-Origin")}\n`);
  process.stdout.write(`CORS Access-Control-Allow-Methods: ${header(preflight, "Access-Control-Allow-Methods")}\n`);
  process.stdout.write(`CORS Access-Control-Allow-Headers: ${header(preflight, "Access-Control-Allow-Headers")}\n`);
  const allowedOrigin = header(preflight, "Access-Control-Allow-Origin");
  const corsOk = (allowedOrigin === origin || allowedOrigin === "*")
    && includesToken(header(preflight, "Access-Control-Allow-Methods"), "PUT")
    && Object.keys(upload.headers).every(name => includesToken(header(preflight, "Access-Control-Allow-Headers"), name));
  check("storage CORS allows the browser origin, PUT, and signed headers", corsOk);
  if (!corsOk) process.stdout.write("CORS blocks direct browser uploads for this origin; configure storage CORS or choose server proxying / MEDIA_ENABLED=false.\n");

  const put = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: png });
  check("presigned PUT uploads the PNG", [200, 201, 204].includes(put.status));
  const info = await storage.head(key);
  check("head() returns the uploaded size and MIME type", info?.size === png.length && info.mime === "image/png");
  const range = await storage.getRange(key, 0, 3);
  check("getRange() returns the first bytes", range.equals(png.subarray(0, 4)));
  const download = await storage.createDownloadUrl(key, 60);
  const downloaded = Buffer.from(await (await fetch(download)).arrayBuffer());
  check("download URL returns matching SHA-256 bytes", createHash("sha256").update(downloaded).digest("hex") === createHash("sha256").update(png).digest("hex"));
} finally {
  await storage.remove(key).catch(error => {
    process.stdout.write(`FAIL - remove() cleanup (${error.message})\n`);
    failed++;
  });
}

check("remove() deletes the object", !(await storage.head(key)));
process.exitCode = failed ? 1 : 0;
