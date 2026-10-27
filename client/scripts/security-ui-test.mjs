import assert from "node:assert/strict";
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { chromium, expect as pwExpect } from "@playwright/test";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
const api = new URL(process.env.VITE_API_URL || "http://localhost:5001/api").origin;
const socket = new URL(process.env.VITE_SOCKET_URL || "http://localhost:5001").origin;
const replacements = { "https://api.example.invalid": api, "https://socket.example.invalid": socket, "wss://socket.example.invalid": socket.replace(/^http/, "ws"), "https://r2.example.invalid": api };
const headers = Object.fromEntries(config.headers[0].headers.map(({ key, value }) => [key, Object.entries(replacements).reduce((text, [from, to]) => text.replaceAll(from, to), value)]));
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    let target = path.resolve(root, `.${pathname}`);
    if (!target.startsWith(path.resolve(root) + path.sep)) target = path.join(root, "index.html");
    try { if (!(await stat(target)).isFile()) target = path.join(root, "index.html"); } catch { target = path.join(root, "index.html"); }
    res.writeHead(200, { ...headers, "Content-Type": mime[path.extname(target)] || "application/octet-stream" }); res.end(await readFile(target));
  } catch { res.writeHead(500); res.end(); }
});
await new Promise(resolve => server.listen(5300, "localhost", resolve));
const browser = await chromium.launch();
const a = await browser.newContext(), b = await browser.newContext();
const page = await a.newPage(), other = await b.newPage();
const violations = [], errors = [];
for (const tab of [page, other]) {
  await tab.addInitScript(() => { window.__cspViolations = []; document.addEventListener("securitypolicyviolation", e => window.__cspViolations.push(e.effectiveDirective)); });
  tab.on("pageerror", error => errors.push(error.message));
}
const expect = pwExpect.configure({ timeout: 15000 });
const email = `csp-${process.env.SECURITY_RUN_ID || randomUUID()}@example.com`, password = `Test-${randomUUID()}`;
try {
  const response = await page.goto("http://localhost:5300/register");
  assert.equal(response.headers()["referrer-policy"], "no-referrer");
  await page.getByLabel("Name", { exact: true }).fill("CSP Browser Test"); await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password); await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page.getByRole("button", { name: "Log out", exact: true })).toBeVisible();
  await other.goto("http://localhost:5300/login"); await other.getByLabel("Email", { exact: true }).fill(email); await other.getByLabel("Password", { exact: true }).fill(password);
  await other.getByRole("button", { name: "Log in", exact: true }).or(other.getByRole("button", { name: "Sign in", exact: true })).first().click();
  await expect(other.getByRole("button", { name: "Log out", exact: true })).toBeVisible();
  await page.locator("aside").getByRole("button").filter({ hasText: "Buddy AI" }).click();
  await page.getByRole("button", { name: "Choose emoji", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Emoji picker" })).toBeVisible(); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Remove location data from photos", exact: true })).toBeChecked();
  const png = Buffer.from(await page.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 600; canvas.height = 600; canvas.getContext("2d").fillRect(0, 0, 600, 600); return canvas.toDataURL("image/png").split(",")[1]; }), "base64");
  await page.getByLabel("Avatar photo", { exact: true }).setInputFiles({ name: "csp-photo.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByAltText("Avatar of CSP Browser Test")).toBeVisible();
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page.getByRole("button", { name: "Log out of all devices", exact: true }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible(); await expect(other.getByLabel("Email", { exact: true })).toBeVisible();
  violations.push(...await page.evaluate(() => window.__cspViolations), ...await other.evaluate(() => window.__cspViolations));
  assert.deepEqual(violations, []); assert.deepEqual(errors, []);
  console.log("PASS - production build boots and lazy-loads emoji under script-src self without CSP violations");
  console.log("PASS - explicit logout-all returns both browser contexts to login; photo privacy defaults ON");
  console.log("All security browser checks passed");
} catch (error) { console.error("FAIL -", error.message); process.exitCode = 1; }
finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
