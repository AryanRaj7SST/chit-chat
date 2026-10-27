import { readFile, writeFile } from "node:fs/promises";
import { loadEnv } from "vite";
const env = { ...loadEnv("production", process.cwd(), ""), ...process.env };
const origin = (value, name) => {
  if (!value) throw new Error(`Set ${name} before generating CSP`);
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error(`Invalid ${name}`);
  return url.origin;
};
const api = origin(env.VITE_API_URL, "VITE_API_URL"), socket = origin(env.VITE_SOCKET_URL, "VITE_SOCKET_URL");
const storage = origin(env.CSP_S3_ORIGIN || env.CSP_R2_ORIGIN, env.CSP_S3_ORIGIN ? "CSP_S3_ORIGIN" : "CSP_R2_ORIGIN");
const supabase = env.CSP_SUPABASE_ORIGIN ? origin(env.CSP_SUPABASE_ORIGIN, "CSP_SUPABASE_ORIGIN") : null;
const ws = socket.replace(/^http/, "ws");
const config = JSON.parse(await readFile("vercel.json", "utf8"));
const csp = config.headers[0].headers.find(header => header.key === "Content-Security-Policy");
csp.value = `default-src 'self'; connect-src 'self' ${[...new Set([api, socket, ws, supabase, storage].filter(Boolean))].join(" ")}; img-src 'self' blob: data: ${[...new Set([api, supabase, storage].filter(Boolean))].join(" ")}; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`;
await writeFile("vercel.json", JSON.stringify(config, null, 2) + "\n");
console.log("CSP origins written to vercel.json. Review this public configuration before deploying.");
