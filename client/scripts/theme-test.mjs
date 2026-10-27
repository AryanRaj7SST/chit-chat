import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { chromium, expect as baseExpect } from "@playwright/test";

const base = process.env.E2E_BASE_URL || "http://localhost:5173";
const expect = baseExpect.configure({ timeout: 10000 });
const browser = await chromium.launch();
const context = await browser.newContext({ colorScheme: "dark", viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const otherContext = await browser.newContext({ colorScheme: "light", viewport: { width: 1280, height: 900 } });
const other = await otherContext.newPage();
const screenshots = new URL("../../docs/screenshots/", import.meta.url);
await mkdir(screenshots, { recursive: true });
const pairs = new Map();
const run = randomUUID();
const email = `theme-${run}@example.com`;
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const pass = (message) => process.stdout.write(`PASS - ${message}\n`);

async function theme(mode) {
  const dark = await page.locator("html").evaluate((element) => element.classList.contains("dark"));
  if (dark !== (mode === "dark")) await page.getByRole("button", { name: `Switch to ${mode} mode`, exact: true }).click();
  await expect(page.locator("html")).toHaveClass(mode === "dark" ? "dark" : "");
  await page.waitForTimeout(180); // Only allow the declared 150ms hover/focus transitions to settle.
}
async function audit(mode, state) {
  const result = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const rgba = (value) => {
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1);
      const pixel = [...ctx.getImageData(0, 0, 1, 1).data]; pixel[3] /= 255; return pixel;
    };
    const token = (name) => {
      const probe = document.createElement("span"); probe.style.color = `var(--${name})`;
      document.body.append(probe); const value = rgba(getComputedStyle(probe).color); probe.remove(); return value;
    };
    const blend = (foreground, background) => foreground.slice(0, 3).map((v, i) => v * foreground[3] + background[i] * (1 - foreground[3])).concat(1);
    const luminance = (color) => color.slice(0, 3).map((v) => v / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
    const hex = (color) => "#" + color.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    const backgrounds = (element) => {
      const chain = []; for (let node = element; node; node = node.parentElement) chain.unshift(node);
      let colors = [token("bg")];
      for (const node of chain) {
        const style = getComputedStyle(node);
        if (node.classList.contains("brand-gradient") && !node.matches(":disabled") || node.classList.contains("sent-bubble")) {
          const hover = node.tagName === "BUTTON" && node.matches(":hover");
          colors = [token(hover ? "action-hover-start" : "action-start"), token(hover ? "action-hover-end" : "action-end")];
        } else colors = colors.map((color) => blend(rgba(style.backgroundColor), color));
      }
      return colors;
    };
    const results = [];
    for (const element of document.body.querySelectorAll("*")) {
      if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || element.getBoundingClientRect().width === 0) continue;
      const style = getComputedStyle(element);
      const icon = element.tagName.toLowerCase() === "svg";
      const directText = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      const field = ["INPUT", "TEXTAREA"].includes(element.tagName);
      if (!icon && !directText && !field) continue;
      const large = parseFloat(style.fontSize) >= 24 || parseFloat(style.fontSize) >= 18.66 && parseInt(style.fontWeight, 10) >= 700;
      const threshold = icon || large ? 3 : 4.5;
      for (const background of backgrounds(element)) {
        const foreground = blend(rgba(style.color), background);
        results.push({ foreground: hex(foreground), background: hex(background), ratio: ratio(foreground, background), threshold,
          sample: `${element.tagName.toLowerCase()}.${String(element.getAttribute("class") || "").slice(0, 65)}` });
        if (field && element.hasAttribute("placeholder")) {
          const placeholder = blend(rgba(getComputedStyle(element, "::placeholder").color), background);
          results.push({ foreground: hex(placeholder), background: hex(background), ratio: ratio(placeholder, background), threshold: 4.5, sample: "input placeholder" });
        }
      }
    }
    for (const [foreground, background, threshold, sample] of [["online", "surface", 3, "online status dot"], ["primary", "input", 3, "focus indicator"], ["surface", "primary-ink", 4.5, "text selection"]]) {
      const fg = token(foreground), bg = token(background);
      results.push({ foreground: hex(fg), background: hex(bg), ratio: ratio(fg, bg), threshold, sample });
    }
    const computed = getComputedStyle(document.documentElement);
    return { pairs: results, palette: Object.fromEntries(["bg", "surface", "surface-2", "border", "text", "muted", "primary", "primary-hover", "online", "danger"].map((key) => [key, computed.getPropertyValue(`--${key}`).trim()])) };
  });
  for (const pair of result.pairs) {
    const key = `${mode}:${pair.foreground}:${pair.background}:${pair.threshold}`;
    if (!pairs.has(key) || pairs.get(key).ratio > pair.ratio) pairs.set(key, { ...pair, mode, state });
    assert.ok(pair.ratio >= pair.threshold, `${mode}/${state} contrast ${pair.ratio.toFixed(2)} < ${pair.threshold}: ${pair.sample}, ${pair.foreground} on ${pair.background}`);
  }
  const palette = mode === "light" ? ["#F5F4FB", "#FFFFFF", "#EFEDF8", "#E3E0F1", "#17151F", "#6A6780", "#6D4AFF", "#5B39E8", "#16A34A", "#DC2626"]
    : ["#0E0E14", "#16161F", "#1F1F2B", "rgba(255,255,255,0.08)", "#F3F3F8", "#9A9AB0", "#7C5CFF", "#8C70FF", "#22C55E", "#F87171"];
  assert.deepEqual(Object.values(result.palette).map((value) => value.toLowerCase().replaceAll(" ", "")), palette.map((value) => value.toLowerCase()));
}
async function capture(name, mode) {
  await theme(mode);
  await audit(mode, name);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: new URL(`${name}-${mode}.png`, screenshots).pathname.replace(/^\/(\w:)/, "$1") });
}
async function register(target, name, address) {
  await target.goto(`${base}/register`);
  await target.getByLabel("Name", { exact: true }).fill(name);
  await target.getByLabel("Email", { exact: true }).fill(address);
  await target.getByLabel("Password", { exact: true }).fill(`Demo-${randomUUID()}`);
  await target.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(target.getByRole("button", { name: "Log out" })).toBeVisible();
  await expect(target.getByText("Connecting to the server...", { exact: true })).toHaveCount(0);
}

try {
  // Block the React entry to establish that the inline head script alone sets the first paint.
  await page.route("**/src/main.jsx*", (route) => route.abort());
  await page.goto(`${base}/login`);
  await expect(page.locator("html")).toHaveClass("dark");
  assert.equal(await page.locator("html").evaluate((element) => element.style.colorScheme), "dark");
  await page.unrouteAll({ behavior: "wait" });
  await page.goto(`${base}/login`);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).not.toHaveClass("dark");
  await theme("dark");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveClass("dark");
  await page.reload();
  await expect(page.locator("html")).toHaveClass("dark");
  pass("pre-React system theme, live OS changes, explicit override and persistence");
  await capture("login", "light"); await capture("login", "dark");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await audit("dark", "login-error"); await theme("light"); await audit("light", "login-error");
  await page.goto(`${base}/register`);
  await capture("register", "light"); await capture("register", "dark");
  await theme("light");
  await register(page, "Alex Morgan", email);
  await page.locator("aside").getByRole("button").filter({ hasText: "Buddy AI" }).click();
  await expect(page.locator("section header").getByText("Always online - automated replies", { exact: true })).toBeVisible();
  await page.getByPlaceholder("Type a message...").fill("hii");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator("[data-message-id]")).toHaveCount(3);
  await expect(page.locator("[data-message-id]").last().locator("p")).toContainText(/Hello|Hey|Hi!/);
  await expect(page.locator("section header").getByText("typing...", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Account created!", { exact: true })).toHaveCount(0);
  await capture("buddy", "light"); await capture("buddy", "dark");
  await register(other, "Casey Hart", `theme-other-${run}@example.com`);
  await other.getByPlaceholder("Search people by name or email").fill(email);
  await other.getByRole("listitem").filter({ hasText: "Alex Morgan" }).getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Casey Hart sent you a friend request", { exact: true })).toBeVisible();
  await audit("dark", "notification-toast");
  await expect(page.getByText("Casey Hart sent you a friend request", { exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: /Requests/ }).click();
  await expect(page.getByRole("region", { name: "Incoming requests" }).getByText("Casey Hart")).toBeVisible();
  await capture("requests", "light"); await capture("requests", "dark");
  await page.getByRole("tab", { name: "Chats", exact: true }).click();
  await page.locator("aside").getByRole("button").filter({ hasText: "Buddy AI" }).click();
  await expect(page.locator("[data-message-id]")).toHaveCount(3);
  // Switch while the footer remains visible, then enter the mobile chat layout.
  await theme("light");
  await page.setViewportSize({ width: 375, height: 812 });
  await audit("light", "mobile-buddy");
  await page.screenshot({ path: new URL("mobile-buddy-light.png", screenshots).pathname.replace(/^\/(\w:)/, "$1") });
  await page.getByRole("button", { name: "Back to conversations" }).click();
  await theme("dark");
  await page.locator("aside").getByRole("button").filter({ hasText: "Buddy AI" }).click();
  await expect(page.locator("[data-message-id]")).toHaveCount(3);
  await audit("dark", "mobile-buddy");
  await page.screenshot({ path: new URL("mobile-buddy-dark.png", screenshots).pathname.replace(/^\/(\w:)/, "$1") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator("aside")).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route("**/api/conversations/*/messages*", (route) => route.abort());
  await page.reload();
  await page.locator("aside").getByRole("button").filter({ hasText: "Buddy AI" }).click();
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
  await audit("dark", "history-error"); await theme("light"); await audit("light", "history-error");
  await page.unrouteAll({ behavior: "wait" });
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  assert.deepEqual(errors, []);
  const rows = [...pairs.values()].sort((a,b) => a.mode.localeCompare(b.mode) || a.ratio-b.ratio);
  await writeFile(new URL("../../docs/screenshots/contrast-results.json", import.meta.url), JSON.stringify(rows, null, 2) + "\n");
  const auditFile = new URL("../../docs/THEME_AUDIT.md", import.meta.url);
  const introduction = (await readFile(auditFile, "utf8")).split("\n## Rendered contrast measurements")[0];
  await writeFile(auditFile, introduction + "\n## Rendered contrast measurements\n\nCalculated from Chromium's computed foreground/background colors using sRGB relative luminance. Transparent layers are composited; gradient surfaces are checked at both endpoint colors, including hovered buttons. Body text and placeholders require 4.5:1; large text, SVG icons, online dots and focus indicators require 3:1. Decorative borders/skeletons are not text. This section is regenerated by the theme check.\n\n| Theme | Foreground | Background | Ratio | Required | State |\n| --- | --- | --- | --- | --- | --- |\n" + rows.map((row) => `| ${row.mode} | ${row.foreground} | ${row.background} | ${row.ratio.toFixed(2)}:1 | ${row.threshold}:1 | ${row.state} |`).join("\n") + "\n");
  pass(`all ${rows.length} rendered text/icon color pairs meet their AA thresholds`);
  pass("ten light/dark screenshots saved under docs/screenshots");
  process.stdout.write("All theme checks passed\n");
} catch (error) {
  console.error("FAIL -", error.message);
  process.exitCode = 1;
} finally { await browser.close(); }
