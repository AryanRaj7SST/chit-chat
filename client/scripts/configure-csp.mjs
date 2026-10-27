import { readFile, writeFile } from "node:fs/promises";
import { loadEnv } from "vite";
const env = { ...loadEnv("production", process.cwd(), ""), ...process.env };
const origin = (value, name) => {
  if (!value) throw new Error(`Set ${name} before generating CSP`);
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error(`Invalid ${name}`);
  return url.origin;
};
const api = origin(env.VITE_API_URL, "VITE_API_URL"), socket = origin(env.VITE_SOCKET_URL, "VITE_SOCKET_URL"), r2 = origin(env.CSP_R2_ORIGIN, "CSP_R2_ORIGIN");
const ws = socket.replace(/^http/, "ws");
const config = JSON.parse(await readFile("vercel.json", "utf8"));
const csp = config.headers[0].headers.find(header => header.key === "Content-Security-Policy");
csp.value = `default-src 'self'; connect-src 'self' ${[...new Set([api, socket, ws, r2])].join(" ")}; img-src 'self' blob: data: ${[...new Set([api, r2])].join(" ")}; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`;
await writeFile("vercel.json", JSON.stringify(config, null, 2) + "\n");
console.log("CSP origins written to vercel.json. Review this public configuration before deploying.");
