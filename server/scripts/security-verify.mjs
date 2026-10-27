// Development-only harness: secrets stay in child-process environments. A
// temporary encryption key is for disposable test accounts, never a migration.
import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { removeDisposableUsers } from "./security-fixtures.mjs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.env.NODE_ENV === "production") throw new Error("This harness is for a dedicated development database only");
const serverDir = fileURLToPath(new URL("../", import.meta.url));
const clientDir = fileURLToPath(new URL("../../client/", import.meta.url));
const env = { ...process.env, NODE_ENV: "development", PORT: "5001", PUBLIC_API_URL: "http://localhost:5001", CLIENT_URL: "http://localhost:5174,http://localhost:5300", STORAGE_DRIVER: "local",
  SECURITY_RUN_ID: randomUUID(),
  MESSAGE_ENC_KEY: process.env.MESSAGE_ENC_KEY || randomBytes(32).toString("base64"), BASE_URL: "http://localhost:5001", E2E_BASE_URL: "http://localhost:5174", VITE_API_URL: "http://localhost:5001/api", VITE_SOCKET_URL: "http://localhost:5001" };
const occupied = await fetch(`${env.BASE_URL}/api/health`, { signal: AbortSignal.timeout(1000) }).then(() => true).catch(() => false);
if (occupied) throw new Error("Stop the existing local server on port 5001 before running isolated security verification");
const server = spawn(process.execPath, ["src/server.js"], { cwd: serverDir, env, stdio: "inherit", windowsHide: true });
let closed = false;
server.once("exit", () => { closed = true; });
const run = (command, cwd) => new Promise((resolve, reject) => {
  const commandEnv = command === "npm run build" ? { ...env, NODE_ENV: "production" } : env;
  const child = process.platform === "win32" ? spawn("cmd.exe", ["/d", "/s", "/c", command], { cwd, env: commandEnv, stdio: "inherit", windowsHide: true }) : spawn("sh", ["-c", command], { cwd, env: commandEnv, stdio: "inherit" });
  child.once("error", reject); child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Check failed: ${command}`)));
});
try {
  let ready = false;
  for (let i = 0; i < 100 && !closed; i++) {
    await new Promise(resolve => setTimeout(resolve, 250));
    try { if ((await fetch(`${env.BASE_URL}/api/health`)).ok) { ready = true; break; } } catch {}
  }
  if (!ready || closed) throw new Error("Could not start isolated local backend; stop any existing server on port 5001");
  await run("npm run verify", serverDir);
  await run("npm run build", clientDir);
  if (process.argv.includes("--browser")) {
    await run("npm run e2e", clientDir); await run("npm run test:media", clientDir);
    await run("npm run test:security", clientDir);
  }
  console.log("All isolated security verification checks passed");
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  if (!closed) await new Promise(resolve => { server.once("exit", resolve); server.kill(); });
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    const users = await db.collection("users").find({ email: { $regex: env.SECURITY_RUN_ID } }).toArray();
    console.log(`Removed ${await removeDisposableUsers(db, users)} disposable security test accounts and their data`);
  } catch { console.error("Disposable security fixture cleanup failed; inspect the dedicated test database privately"); process.exitCode = 1; }
  finally { await mongoose.disconnect(); }
}
