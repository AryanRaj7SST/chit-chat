import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium, expect as playwrightExpect } from "@playwright/test";

const base = process.env.E2E_BASE_URL || "http://localhost:5173";
const run = randomUUID();
const nameA = `E2E A ${run.slice(0, 8)}`;
const nameB = `E2E B ${run.slice(0, 8)}`;
const browser = await chromium.launch();
const contextA = await browser.newContext();
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
  const firstBubble = messages(pageA, "Hello from A").locator("..");
  await expect(firstBubble.getByLabel("Sending", { exact: true })).toBeVisible();
  await expect(pageB.getByLabel("1 unread messages", { exact: true })).toBeVisible();
  await expect(firstBubble.getByLabel("Sent", { exact: true })).toHaveCount(0);
  holdSendAck = false;
  for (const release of heldAcknowledgements.splice(0)) release();
  await expect(firstBubble.getByLabel("Sent", { exact: true })).toBeVisible();
  await pageB.reload();
  await expect(pageB.getByLabel("1 unread messages", { exact: true })).toBeVisible();
  check("unread badge persists across reload; sent check waits for the acknowledgement");
  await openChat(pageB, nameA);
  await expect(messages(pageB, "Hello from A")).toHaveCount(1);
  await expect(firstBubble.getByLabel("Read", { exact: true })).toBeVisible();
  await expect(pageB.getByLabel("1 unread messages", { exact: true })).toHaveCount(0);
  await send(pageA, "Live delivery");
  await expect(messages(pageB, "Live delivery")).toHaveCount(1);
  await expect(messages(pageA, "Live delivery").locator("..").getByLabel("Read", { exact: true })).toBeVisible();
  check("opening and receiving in an open chat clear unread counts and update read receipts");
  check("A starts chat; B receives messages without refresh");
  await send(pageB, "Reply from B");
  await expect(messages(pageA, "Reply from B")).toHaveCount(1);
  await pageA.reload();
  await openChat(pageA, nameB);
  for (const text of ["Hello from A", "Live delivery", "Reply from B"])
    await expect(messages(pageA, text)).toHaveCount(1);
  await expect(messages(pageA, "Hello from A").locator("..").getByLabel("Read", { exact: true })).toBeVisible();
  check("reply and reload retain each saved message exactly once");

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
  await pageA.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(pageA.locator("html")).toHaveClass("dark");
  await expect.poll(() => pageA.locator("section").evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(lightBackground);
  const darkBackground = await pageA.locator("section").evaluate((element) => getComputedStyle(element).backgroundColor);
  await expect.poll(() => pageA.getByPlaceholder("Search people by name or email").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(darkBackground);
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
  await openChat(pageA, "Buddy AI");
  await expect(pageA.getByLabel("Friend options")).toHaveCount(0);
  const botMessages = pageA.locator('[data-message-id]');
  const beforeBot = await botMessages.count();
  await send(pageA, "hello Buddy");
  await expect(botMessages).toHaveCount(beforeBot + 2);
  await expect(pageA.locator("section header").getByText("Always online - automated replies", { exact: true })).toBeVisible();
  check("Buddy is pinned, replies in chat, and has no unfriend menu");
  expect(errors).toEqual([]);
  process.stdout.write("All browser checks passed\n");
} catch (error) {
  // Do not dump pages, storage, requests, or JWTs on failure.
  console.error("FAIL -", error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
