import { readFile, appendFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const target = fileURLToPath(new URL("../.env", import.meta.url));
if (process.env.NODE_ENV === "production") throw new Error("Configure production secrets privately through the hosting dashboard");
if (spawnSync("git", ["check-ignore", "--quiet", target], { windowsHide: true }).status !== 0) throw new Error("Refusing to write a key unless server/.env is ignored and untracked");
let text = ""; try { text = await readFile(target, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
if (parse(text).MESSAGE_ENC_KEY || process.env.MESSAGE_ENC_KEY) throw new Error("MESSAGE_ENC_KEY already exists; refusing accidental key rotation");
await appendFile(target, `\nMESSAGE_ENC_KEY=${randomBytes(32).toString("base64")}\n`, { mode: 0o600 });
console.log("Created MESSAGE_ENC_KEY in ignored server/.env without displaying it. Back it up securely before using real data.");
