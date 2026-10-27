import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { chromium, expect as playwrightExpect } from "@playwright/test";

const base = process.env.E2E_BASE_URL || "http://localhost:5173";
const run = process.env.SECURITY_RUN_ID || randomUUID();
const nameA = `E2E A ${run.slice(0, 8)}`;
const nameB = `E2E B ${run.slice(0, 8)}`;
const browser = await chromium.launch();
const contextA = await browser.newContext();
await contextA.addInitScript(() => {
  window.__notificationRequests = 0; window.__notifications = [];
  window.Notification = class {
    static permission = "default";
    static async requestPermission() { window.__notificationRequests++; this.permission = "granted"; return "granted"; }
    constructor(title, options) { window.__notifications.push({ title, ...options }); }
  };
});
const contextB = await browser.newContext();
let transportA;
let holdSendAck = false;
const heldAcknowledgements = [];
await contextA.routeWebSocket(/\/socket\.io\//, (socket) => {
  const server = socket.connectToServer();
  transportA = { client: socket, server };
  server.onMessage((message) => {
    if (holdSendAck && typeof message === "string" && /^43\d+\[/.test(message) && message.includes('"tempId":')) {
      heldAcknowledgements.push(() => socket.send(message));
    } else socket.send(message);
  });
});
const pageA = await contextA.newPage();
const pageB = await contextB.newPage();
const errors = [];
for (const page of [pageA, pageB]) page.on("pageerror", (error) => errors.push(error.message));
const expect = playwrightExpect.configure({ timeout: 10000 });
const check = (label) => process.stdout.write(`PASS - ${label}\n`);
const messages = (page, text) => page.locator("section").getByText(text, { exact: true });
const register = async (page, name, label) => {
  let release;
  const loadingGate = new Promise((resolve) => { release = resolve; });
  const holdConversations = async (route) => { await loadingGate; await route.continue(); };
  await page.route("**/api/conversations", holdConversations);
  await page.goto(`${base}/register`);
  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(`e2e-${label}-${run}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill(`Test-${randomUUID()}`);
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading people and conversations" }).first()).toBeVisible();
  release();
  await page.unrouteAll({ behavior: "wait" });
  const buddy = page.locator("aside").getByRole("button").filter({ hasText: "Buddy AI" });
  await expect(buddy).toBeVisible();
  await buddy.click();
  await expect(page.locator("section header").getByText("Always online - automated replies", { exact: true })).toBeVisible();
  await expect(buddy.getByLabel("1 unread messages", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Connecting to the server...", { exact: true })).toHaveCount(0);
};
const openChat = async (page, name) => {
  await page.locator("aside").getByRole("button").filter({ hasText: name }).click();
  await expect(page.getByPlaceholder("Type a message...")).toBeVisible();
  if (name !== "Buddy AI") await expect(page.getByLabel("Buddy quick replies")).toHaveCount(0);
};
const send = async (page, text) => {
  await page.getByPlaceholder("Type a message...").fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
};

try {
  await register(pageA, nameA, "a");
  await register(pageB, nameB, "b");
  check("register two unique users in separate browser contexts");
  await pageA.getByPlaceholder("Search people by name or email").fill(`e2e-b-${run}@example.com`);
  const resultB = pageA.getByRole("listitem").filter({ hasText: nameB });
  await expect(resultB).toBeVisible();
  await expect(resultB.getByText(`e2e-b-${run}@example.com`, { exact: true })).toHaveCount(0);
  await resultB.getByRole("button", { name: "Add", exact: true }).click();
  await expect(resultB.getByRole("button", { name: "Pending", exact: true })).toBeDisabled();
  await resultB.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(resultB.getByRole("button", { name: "Add", exact: true })).toBeVisible();
  await resultB.getByRole("button", { name: "Add", exact: true }).click();
  await pageB.getByRole("tab", { name: /Requests/ }).click();
  await expect(pageB.getByRole("region", { name: "Incoming requests" }).getByText(nameA)).toBeVisible();
  await pageB.getByRole("region", { name: "Incoming requests" }).getByRole("button", { name: "Accept", exact: true }).click();
  await pageB.getByRole("tab", { name: "Chats", exact: true }).click();
  await pageA.getByRole("button", { name: "Clear search" }).click();
  check("masked discovery, request cancellation, live invitation and acceptance work");
  let releaseHistory;
  const historyGate = new Promise((resolve) => { releaseHistory = resolve; });
  const holdHistory = async (route) => { await historyGate; await route.continue(); };
  await pageA.route("**/api/conversations/*/messages*", holdHistory);
  await openChat(pageA, nameB);
  await expect(pageA.getByRole("status", { name: "Loading messages" })).toBeVisible();
  releaseHistory();
  await pageA.unrouteAll({ behavior: "wait" });
  await expect(pageA.getByText(`No messages yet. Say hello to ${nameB}!`)).toBeVisible();
  check("sidebar and message skeletons appear before empty states");
  await expect(pageA.locator("section header").getByText("Online", { exact: true })).toBeVisible();
  holdSendAck = true;
  await send(pageA, "Hello from A");
  const firstBubble = messages(pageA, "Hello from A").locator("xpath=ancestor::*[@data-message-id]");
  await expect(firstBubble.getByLabel("Sending", { exact: true })).toBeVisible();
  await expect(pageB.getByLabel("1 unread messages", { exact: true })).toBeVisible();
  await expect(firstBubble.getByLabel("Sent", { exact: true })).toHaveCount(0);
  holdSendAck = false;
  for (const release of heldAcknowledgements.splice(0)) release();
  await expect(firstBubble.getByLabel("Delivered", { exact: true })).toBeVisible();
  await pageB.reload();
  await expect(pageB.getByLabel("1 unread messages", { exact: true })).toBeVisible();
  check("unread badge persists across reload; sent check waits for the acknowledgement");
  await openChat(pageB, nameA);
  await expect(messages(pageB, "Hello from A")).toHaveCount(1);
  await expect(firstBubble.getByLabel("Read", { exact: true })).toBeVisible();
  await expect(pageB.getByLabel("1 unread messages", { exact: true })).toHaveCount(0);
  await send(pageA, "Live delivery");
  await expect(messages(pageB, "Live delivery")).toHaveCount(1);
  await expect(messages(pageA, "Live delivery").locator("xpath=ancestor::*[@data-message-id]").getByLabel("Read", { exact: true })).toBeVisible();
  check("opening and receiving in an open chat clear unread counts and update read receipts");
  check("A starts chat; B receives messages without refresh");
  await send(pageB, "Reply from B");
  await expect(messages(pageA, "Reply from B")).toHaveCount(1);
  await pageA.reload();
  await openChat(pageA, nameB);
  for (const text of ["Hello from A", "Live delivery", "Reply from B"])
    await expect(messages(pageA, text)).toHaveCount(1);
  await expect(messages(pageA, "Hello from A").locator("xpath=ancestor::*[@data-message-id]").getByLabel("Read", { exact: true })).toBeVisible();
  check("reply and reload retain each saved message exactly once");
  expect(await pageA.evaluate(() => window.__notificationRequests)).toBe(0);
  await pageA.getByRole("button", { name: "Enable notifications", exact: true }).click();
  expect(await pageA.evaluate(() => window.__notificationRequests)).toBe(1);
  await send(pageB, "Visible notification control"); await expect(messages(pageA, "Visible notification control")).toBeVisible();
  expect(await pageA.evaluate(() => window.__notifications.length)).toBe(0);
  await pageA.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await send(pageB, "Secret notification body");
  await expect.poll(() => pageA.evaluate(() => window.__notifications.length)).toBe(1);
  expect(await pageA.evaluate(() => window.__notifications[0].body)).toBe("You have a new message.");
  await pageA.evaluate(async name => { const { default: api } = await import("/src/services/api.js"); const { data } = await api.get("/conversations"); const c = data.conversations.find(item => item.participants.some(user => user.name === name)); await api.patch(`/conversations/${c._id}/settings`, { muted: true }); }, nameB);
  await send(pageB, "Muted notification control"); await expect(messages(pageA, "Muted notification control")).toBeVisible();
  await pageA.waitForTimeout(1000); expect(await pageA.evaluate(() => window.__notifications.length)).toBe(1);
  await pageA.evaluate(async name => { delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event("visibilitychange")); const { default: api } = await import("/src/services/api.js"); const { data } = await api.get("/conversations"); const c = data.conversations.find(item => item.participants.some(user => user.name === name)); await api.patch(`/conversations/${c._id}/settings`, { muted: false }); }, nameB);
  check("simulated Notification API requests permission only on click, suppresses visible/muted alerts, and hides message previews");
  const bubble = (page, text) => messages(page, text).locator("xpath=ancestor::*[@data-message-id]");
  await bubble(pageA, "Reply from B").hover();
  await bubble(pageA, "Reply from B").getByRole("button", { name: "Reply to message" }).click();
  await send(pageA, "Quoted feature reply");
  await expect(bubble(pageB, "Quoted feature reply").getByRole("button", { name: "Jump to replied message" })).toBeVisible();
  await bubble(pageA, "Quoted feature reply").getByRole("button", { name: "Jump to replied message" }).click();
  await expect(bubble(pageA, "Reply from B")).toHaveClass(/message-highlight/);
  await bubble(pageB, "Quoted feature reply").hover();
  await bubble(pageB, "Quoted feature reply").getByRole("button", { name: "Message actions" }).click();
  await bubble(pageB, "Quoted feature reply").getByRole("button", { name: "React 👍", exact: true }).click();
  await expect(bubble(pageA, "Quoted feature reply").getByRole("button", { name: "React 👍", exact: true })).toBeVisible();
  await send(pageA, "Editable feature text");
  await expect(bubble(pageA, "Editable feature text").getByLabel("Read", { exact: true })).toBeVisible();
  await bubble(pageA, "Editable feature text").hover(); await bubble(pageA, "Editable feature text").getByRole("button", { name: "Message actions" }).click();
  await bubble(pageA, "Editable feature text").getByRole("button", { name: "Edit message", exact: true }).click();
  await pageA.getByLabel("Edit message text").fill("Edited feature text"); await pageA.getByRole("button", { name: "Save edit" }).click();
  await expect(bubble(pageB, "Edited feature text").getByText("edited", { exact: true })).toBeVisible();
  await bubble(pageB, "Edited feature text").hover(); await bubble(pageB, "Edited feature text").getByRole("button", { name: "Message actions" }).click();
  await expect(bubble(pageB, "Edited feature text").getByRole("button", { name: "Edit message", exact: true })).toHaveCount(0);
  await bubble(pageB, "Edited feature text").getByRole("button", { name: "Delete for me", exact: true }).click();
  await expect(messages(pageB, "Edited feature text")).toHaveCount(0); await expect(messages(pageA, "Edited feature text")).toHaveCount(1);
  await bubble(pageA, "Edited feature text").hover(); await bubble(pageA, "Edited feature text").getByRole("button", { name: "Message actions" }).click();
  pageA.once("dialog", dialog => dialog.accept()); await bubble(pageA, "Edited feature text").getByRole("button", { name: "Delete for everyone", exact: true }).click();
  await expect(pageA.getByText("This message was deleted", { exact: true })).toBeVisible();
  await pageA.getByRole("button", { name: "Search messages", exact: true }).click(); await pageA.getByLabel("Search in chat").fill("Hello from A");
  await pageA.getByLabel("Message search results").getByRole("button", { name: "Hello from A", exact: true }).click();
  await expect(bubble(pageA, "Hello from A")).toHaveClass(/message-highlight/);
  await pageA.getByRole("button", { name: "Search messages", exact: true }).click();
  check("live replies, quote jump/highlight, reactions, edit marker, sender-only edit controls, per-user hide, tombstone and chat search");

  const png = Buffer.from(await pageA.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 800;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#6D4AFF"; ctx.fillRect(0, 0, 1200, 800);
    ctx.fillStyle = "white"; ctx.fillRect(200, 200, 300, 300);
    return canvas.toDataURL("image/png").split(",")[1];
  }), "base64");
  const photoFile = { name: "original.png", mimeType: "image/png", buffer: png };
  await pageA.getByLabel("Photo files", { exact: true }).setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("<html>not a photo</html>") });
  await expect(pageA.getByRole("alert").filter({ hasText: "valid image bytes" })).toBeVisible();
  await pageA.getByLabel("Photo files", { exact: true }).setInputFiles({ name: "oversized.png", mimeType: "image/png", buffer: Buffer.alloc(25 * 1024 * 1024 + 1) });
  await expect(pageA.getByRole("alert").filter({ hasText: "25 MB or smaller" })).toBeVisible();
  await pageA.evaluate(bytes => {
    const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(bytes)], "pasted.png", { type: "image/png" }));
    document.querySelector("textarea").dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, [...png]);
  await expect(pageA.getByLabel("Photo previews").getByAltText("Selected photo preview")).toHaveCount(1);
  await pageA.evaluate(bytes => {
    const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(bytes)], "dropped.png", { type: "image/png" }));
    document.querySelector("section").dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, [...png]);
  await expect(pageA.getByLabel("Photo previews").getByAltText("Selected photo preview")).toHaveCount(2);
  await pageA.getByRole("button", { name: "Remove photo", exact: true }).first().click();
  await pageA.getByRole("button", { name: "Remove photo", exact: true }).first().click();
  check("client rejects oversized/fake images and accepts image paste/drop with removable previews");
  await pageA.getByLabel("Photo files", { exact: true }).setInputFiles([photoFile, { ...photoFile, name: "second.png" }]);
  await expect(pageA.getByLabel("Photo previews").getByAltText("Selected photo preview")).toHaveCount(2);
  await pageA.getByLabel("Photo caption").fill("Original-quality browser test");
  let releaseUpload;
  const uploadGate = new Promise(resolve => { releaseUpload = resolve; });
  const holdUpload = async route => { await uploadGate; await route.continue().catch(() => {}); };
  await pageA.route("**/api/uploads/local/**", holdUpload);
  await pageA.getByRole("button", { name: "Send message", exact: true }).click();
  const photoBubble = pageA.locator("[data-message-id]").filter({ hasText: "Original-quality browser test" });
  await expect(photoBubble.getByRole("progressbar").first()).toBeVisible();
  await expect(photoBubble.getByLabel("Sent", { exact: true })).toHaveCount(0);
  await photoBubble.getByRole("button", { name: "Cancel upload", exact: true }).click();
  await expect(photoBubble.getByRole("button", { name: "Failed to send. Tap to retry" })).toBeVisible();
  releaseUpload(); await pageA.unroute("**/api/uploads/local/**", holdUpload);
  await photoBubble.getByRole("button", { name: "Failed to send. Tap to retry" }).click();
  await expect(photoBubble.getByLabel("Read", { exact: true })).toBeVisible();
  const receivedPhoto = pageB.locator("[data-message-id]").filter({ hasText: "Original-quality browser test" });
  await expect(receivedPhoto.getByAltText(`Photo from ${nameA}`)).toHaveCount(2);
  await expect.poll(() => receivedPhoto.getByAltText(`Photo from ${nameA}`).first().evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
  for (const width of [320, 375, 768, 1024, 1440]) {
    await pageA.setViewportSize({ width, height: 812 });
    expect(await pageA.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(pageA.getByRole("button", { name: "Send message", exact: true })).toBeVisible();
    const button = await pageA.getByRole("button", { name: "Attach photos" }).boundingBox();
    expect(button.width >= 40 && button.height >= 40).toBe(true);
  }
  await receivedPhoto.getByRole("button", { name: `Open photo 1 from ${nameA}`, exact: true }).click();
  const viewer = pageB.getByRole("dialog", { name: "Photo viewer" });
  await expect(viewer.getByAltText(`Photo from ${nameA}`)).toBeVisible();
  await viewer.getByRole("button", { name: "Zoom in", exact: true }).click();
  const downloadEvent = pageB.waitForEvent("download");
  await viewer.getByRole("button", { name: "Download", exact: true }).click();
  const downloaded = await downloadEvent;
  expect(createHash("sha256").update(await readFile(await downloaded.path())).digest("hex")).toBe(createHash("sha256").update(png).digest("hex"));
  await viewer.getByRole("button", { name: "Next photo" }).click();
  await expect(viewer.getByText("2 / 2 · Original quality", { exact: true })).toBeVisible();
  await pageB.keyboard.press("Escape"); await expect(viewer).toHaveCount(0);
  await pageA.reload(); await openChat(pageA, nameB);
  await expect(pageA.locator("[data-message-id]").filter({ hasText: "Original-quality browser test" })).toHaveCount(1);
  check("multi-photo preview, cancel/retry, live delivery, original SHA-256 download, lightbox, reload and 320/375/768/1024/1440px layout");

  await contextA.setOffline(true);
  // Chromium's offline emulation can leave an existing WebSocket alive.
  // Close the routed transport as well to simulate an actual network loss.
  expect(transportA).toBeTruthy();
  await Promise.all([transportA.client.close(), transportA.server.close()]);
  await expect(pageA.getByText("Connecting to the server...", { exact: true })).toBeVisible();
  await send(pageB, "Sent while A was offline");
  await contextA.setOffline(false);
  await expect(messages(pageA, "Sent while A was offline")).toHaveCount(1);
  await expect(messages(pageA, "Hello from A")).toHaveCount(1);
  check("reconnect loads missed messages without duplicates");

  const inputB = pageB.getByPlaceholder("Type a message...");
  await inputB.fill("Typing test");
  await expect(pageA.locator("section header").getByText("typing...", { exact: true })).toBeVisible();
  await pageB.getByRole("button", { name: "Send message" }).click();
  await expect(pageA.locator("section header").getByText("Online", { exact: true })).toBeVisible();
  check("typing appears and clears after send");
  await inputB.fill("Draft");
  await expect(pageA.locator("section header").getByText("typing...", { exact: true })).toBeVisible();
  await inputB.fill("");
  await expect(pageA.locator("section header").getByText("Online", { exact: true })).toBeVisible();
  check("clearing the draft stops typing");

  await pageB.getByLabel("Friend options").click();
  pageB.once("dialog", (dialog) => dialog.accept());
  await pageB.getByRole("button", { name: "Unfriend", exact: true }).click();
  await expect(pageA.getByPlaceholder("Type a message...")).toHaveCount(0);
  await expect(pageA.locator("aside").getByRole("button").filter({ hasText: nameB })).toHaveCount(0);
  await pageA.getByPlaceholder("Search people by name or email").fill(`e2e-b-${run}@example.com`);
  await pageA.getByRole("listitem").filter({ hasText: nameB }).getByRole("button", { name: "Add", exact: true }).click();
  await pageB.getByRole("tab", { name: /Requests/ }).click();
  await pageB.getByRole("region", { name: "Incoming requests" }).getByRole("button", { name: "Accept", exact: true }).click();
  await pageB.getByRole("tab", { name: "Chats", exact: true }).click();
  await pageA.getByRole("button", { name: "Clear search" }).click();
  await openChat(pageA, nameB);
  await openChat(pageB, nameA);
  await expect(messages(pageA, "Hello from A")).toHaveCount(1);
  check("confirmed unfriend closes the other chat; re-friending restores history");

  const secondTabB = await contextB.newPage();
  await secondTabB.goto(base);
  await expect(secondTabB.getByRole("button", { name: "Log out" })).toBeVisible();
  await expect(secondTabB.getByText("Connecting to the server...", { exact: true })).toHaveCount(0);
  await pageB.close();
  await expect(pageA.locator("section header").getByText("Online", { exact: true })).toBeVisible();
  await openChat(secondTabB, nameA);
  await secondTabB.setViewportSize({ width: 375, height: 812 });
  await secondTabB.getByPlaceholder("Type a message...").fill("Leaving the conversation");
  await expect(pageA.locator("section header").getByText("typing...", { exact: true })).toBeVisible();
  await secondTabB.getByRole("button", { name: "Back to conversations" }).click();
  await expect(pageA.locator("section header").getByText("Online", { exact: true })).toBeVisible();
  check("leaving a conversation stops typing");
  await openChat(secondTabB, nameA);
  await secondTabB.getByPlaceholder("Type a message...").fill("Closing while typing");
  await expect(pageA.locator("section header").getByText("typing...", { exact: true })).toBeVisible();
  await contextB.close();
  await expect(pageA.locator("section header").getByText("Offline", { exact: true })).toBeVisible();
  check("multiple tabs preserve presence; closing B's context clears typing and shows Offline");

  await pageA.setViewportSize({ width: 375, height: 812 });
  await pageA.reload();
  await expect(pageA.locator("aside")).toBeVisible();
  await expect(pageA.getByPlaceholder("Type a message...")).toHaveCount(0);
  await openChat(pageA, nameB);
  await expect(pageA.locator("aside")).toBeHidden();
  await pageA.getByRole("button", { name: "Back to conversations" }).click();
  await expect(pageA.locator("aside")).toBeVisible();
  await expect(pageA.getByPlaceholder("Type a message...")).toHaveCount(0);
  check("375px layout switches between list and chat with working back button");

  await pageA.setViewportSize({ width: 1280, height: 812 });
  await openChat(pageA, nameB);
  await send(pageA, "x".repeat(180));
  await expect(pageA.getByRole("separator", { name: "Today" })).toBeVisible();
  await expect(pageA.locator('[data-grouped="true"]').first()).toBeVisible();
  for (const width of [320, 375, 768, 1280]) {
    await pageA.setViewportSize({ width, height: 812 });
    expect(await pageA.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await pageA.locator("section").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  check("date separators, consecutive groups, and no horizontal overflow at 320/375/768/1280px");

  await pageA.route("**/api/conversations/*/messages*", (route) => route.abort());
  await pageA.reload();
  await openChat(pageA, nameB);
  await expect(pageA.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
  await pageA.unroute("**/api/conversations/*/messages*");
  await pageA.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(messages(pageA, "Hello from A")).toHaveCount(1);
  check("history error state retries successfully");
  await mkdir("test-results", { recursive: true });
  await pageA.screenshot({ path: "test-results/phase-5-light.png" });
  const lightBackground = await pageA.locator("section").evaluate((element) => getComputedStyle(element).backgroundColor);
  const lightInputBackground = await pageA.getByPlaceholder("Search people by name or email").evaluate((element) => getComputedStyle(element).backgroundColor);
  await pageA.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(pageA.locator("html")).toHaveClass("dark");
  await expect.poll(() => pageA.locator("section").evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(lightBackground);
  await expect.poll(() => pageA.getByPlaceholder("Search people by name or email").evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(lightInputBackground);
  const darkText = await pageA.locator("body").evaluate((element) => getComputedStyle(element).color);
  await expect.poll(() => pageA.locator("aside").getByRole("button").filter({ hasText: nameB }).evaluate((element) => getComputedStyle(element).color)).toBe(darkText);
  await pageA.screenshot({ path: "test-results/phase-5-dark.png" });
  await pageA.reload();
  await expect(pageA.locator("html")).toHaveClass("dark");
  await expect(pageA.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
  for (const width of [320, 375, 768, 1280]) {
    await pageA.setViewportSize({ width, height: 812 });
    expect(await pageA.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await pageA.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(pageA.locator("html")).not.toHaveClass("dark");
  check("dark mode changes colors, persists across reload, and toggles back to light");

  await pageA.route("**/api/conversations", (route) => route.abort());
  await pageA.reload();
  await expect(pageA.getByRole("button", { name: "Retry conversations" })).toBeVisible();
  await pageA.unroute("**/api/conversations");
  await pageA.getByRole("button", { name: "Retry conversations" }).click();
  await expect(pageA.locator("aside").getByRole("button").filter({ hasText: nameB })).toBeVisible();
  await pageA.route("**/api/users*", (route) => route.abort());
  await pageA.getByPlaceholder("Search people by name or email").fill(`nobody-${run}`);
  await expect(pageA.getByRole("button", { name: "Retry search" })).toBeVisible();
  await pageA.unroute("**/api/users*");
  await pageA.getByRole("button", { name: "Retry search" }).click();
  await expect(pageA.getByText("No users match your search.")).toBeVisible();
  const toggle = pageA.getByRole("button", { name: "Switch to dark mode" });
  await toggle.focus();
  await pageA.keyboard.press("Tab");
  await expect(pageA.getByRole("button", { name: "Log out" })).toBeFocused();
  expect(await pageA.getByRole("button", { name: "Log out" }).evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
  check("sidebar errors retry successfully and keyboard navigation has a visible focus outline");
  await pageA.getByRole("button", { name: "Clear search" }).click();
  await pageA.evaluate(async () => {
    const { createSocket } = await import("/src/services/socket.js");
    const socket = createSocket(localStorage.getItem("chat_token"));
    await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); socket.connect(); });
    const { apiUrl } = await import("/src/services/config.js");
    const response = await fetch(`${apiUrl}/conversations`, { headers: { Authorization: `Bearer ${localStorage.getItem("chat_token")}` } });
    const data = await response.json();
    const conversation = data.conversations.find(item => !item.participants.some(user => user.isBot));
    try { for (let i = 0; i < 55; i++) { const payload = { conversationId: conversation._id, content: `Older-history fixture ${i}`, tempId: `history-${i}` }; let result = await socket.timeout(10000).emitWithAck("message:send", payload); while (!result.success && result.message === "Slow down") { await new Promise(resolve => setTimeout(resolve, 10000)); result = await socket.timeout(10000).emitWithAck("message:send", payload); } if (!result.success) throw new Error("History fixture send failed"); } }
    finally { socket.disconnect(); }
  });
  await pageA.reload(); await openChat(pageA, nameB);
  await expect(messages(pageA, "Older-history fixture 54")).toBeVisible();
  await pageA.getByLabel("Message history").evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event("scroll", { bubbles: true })); });
  await expect(messages(pageA, "Hello from A")).toHaveCount(1);
  expect(await pageA.getByLabel("Message history").evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  check("older history pages load at the top without duplicates and preserve the viewport anchor");
  const openOptions = async () => { const summary = pageA.getByLabel("Friend options"); if (!(await summary.evaluate(el => el.parentElement.open))) await summary.click(); };
  await openOptions(); await pageA.getByRole("button", { name: "Pin chat", exact: true }).click();
  await expect(pageA.locator("aside").getByText("Pinned", { exact: true })).toBeVisible();
  await openOptions(); await pageA.getByRole("button", { name: "Mute chat", exact: true }).click();
  await expect(pageA.locator("aside").getByText("Pinned Muted", { exact: true })).toBeVisible();
  await openOptions(); await pageA.getByRole("button", { name: "Archive chat", exact: true }).click();
  await pageA.getByRole("button", { name: "Archived (1)", exact: true }).click(); await openChat(pageA, nameB);
  await openOptions(); await pageA.getByRole("button", { name: "Unarchive chat", exact: true }).click();
  await pageA.getByRole("button", { name: "Back to chats", exact: true }).click();
  await openOptions(); await pageA.getByLabel("Disappearing messages", { exact: true }).selectOption("86400");
  await expect(pageA.getByText(`${nameA} set disappearing messages to 24 hours`, { exact: true })).toBeVisible();
  await pageA.getByLabel("Disappearing messages", { exact: true }).selectOption("0");
  await openOptions(); pageA.once("dialog", dialog => dialog.accept()); await pageA.getByRole("button", { name: "Block user", exact: true }).click();
  await expect(pageA.getByPlaceholder("Type a message...")).toHaveCount(0);
  await pageA.getByRole("button", { name: "Blocked people", exact: true }).click(); await expect(pageA.getByRole("button", { name: "Unblock", exact: true })).toBeVisible();
  await pageA.getByRole("button", { name: "Unblock", exact: true }).click(); await pageA.getByRole("button", { name: "Close blocked list", exact: true }).click();
  check("pin/mute/archive controls, archived row, timer system notices, and block/unblock UI work");
  await openChat(pageA, "Buddy AI");
  await expect(pageA.getByLabel("Friend options")).toHaveCount(0);
  const botMessages = pageA.locator('[data-message-id]');
  await expect(botMessages.getByText("Hi! I'm Buddy AI", { exact: false })).toBeVisible();
  await expect(botMessages).toHaveCount(1);
  const beforeBot = await botMessages.count();
  await send(pageA, "hello Buddy");
  await expect(botMessages).toHaveCount(beforeBot + 2);
  await expect(pageA.locator("section header").getByText("Always online - automated replies", { exact: true })).toBeVisible();
  check("Buddy is pinned, replies in chat, and has no unfriend menu");
  const chips = pageA.getByLabel("Buddy quick replies");
  await expect(chips.getByRole("button")).toHaveCount(5);
  const beforeTopics = await botMessages.count();
  await chips.getByRole("button", { name: "topics", exact: true }).click();
  await expect(botMessages).toHaveCount(beforeTopics + 2);
  await expect(pageA.locator("section").getByText("I can explain these areas:", { exact: false })).toBeVisible();
  await send(pageA, "binary search");
  const code = pageA.locator("section pre code").last();
  await expect(code).toContainText("function binarySearch");
  await expect(pageA.locator("section").getByText("Time O(log n)", { exact: false })).toBeVisible();
  await contextA.grantPermissions(["clipboard-read", "clipboard-write"]);
  await pageA.locator('[data-message-id]').filter({ hasText: "function binarySearch" }).getByRole("button", { name: "Copy", exact: true }).click();
  await expect(pageA.getByText("Copied", { exact: true })).toBeVisible();
  expect(await pageA.evaluate(() => navigator.clipboard.readText())).toContain("function binarySearch");
  // Exercise the denied-clipboard path without permissions or browser-specific dialogs.
  await pageA.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error("denied"); }; });
  await pageA.locator('[data-message-id]').filter({ hasText: "function binarySearch" }).getByRole("button", { name: "Copy", exact: true }).click();
  await expect(pageA.getByText("Could not copy. Select the code to copy it manually.", { exact: true })).toBeVisible();
  for (const width of [320, 375, 768, 1280]) {
    await pageA.setViewportSize({ width, height: 812 });
    expect(await pageA.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(code).toBeVisible();
  }
  expect(await pageA.locator("section pre").last().evaluate(el => getComputedStyle(el).overflowX)).toBe("auto");
  await send(pageA, '<img src=x onerror="window.__unsafe=true">');
  await expect(pageA.locator("section").getByText('<img src=x onerror="window.__unsafe=true">', { exact: true })).toBeVisible();
  expect(await pageA.evaluate(() => window.__unsafe)).toBeUndefined();
  // Wait for the prior fallback before checking the next exchange's count.
  await expect(botMessages).toHaveCount(beforeTopics + 6);
  await chips.getByRole("button", { name: "quiz me", exact: true }).click();
  await expect(botMessages).toHaveCount(beforeTopics + 8);
  await expect(botMessages.last()).toContainText("Think of an explanation");
  await send(pageA, "answer");
  await expect(botMessages).toHaveCount(beforeTopics + 10);
  expect(await botMessages.last().innerText()).not.toContain("Type quiz me");
  check("Buddy chips, knowledge replies, quiz, escaped text, code copy success/failure and no page overflow at 320/375/768/1280px");
  expect(errors).toEqual([]);
  process.stdout.write("All browser checks passed\n");
} catch (error) {
  // Do not dump pages, storage, requests, or JWTs on failure.
  console.error("FAIL -", error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
