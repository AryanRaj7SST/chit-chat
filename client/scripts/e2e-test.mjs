import { randomUUID } from "node:crypto";
import { chromium, expect as playwrightExpect } from "@playwright/test";

const base = process.env.E2E_BASE_URL || "http://localhost:5173";
const run = randomUUID();
const nameA = `E2E A ${run.slice(0, 8)}`;
const nameB = `E2E B ${run.slice(0, 8)}`;
const browser = await chromium.launch();
const contextA = await browser.newContext();
const contextB = await browser.newContext();
let transportA;
await contextA.routeWebSocket(/\/socket\.io\//, (socket) => {
  transportA = { client: socket, server: socket.connectToServer() };
});
const pageA = await contextA.newPage();
const pageB = await contextB.newPage();
const errors = [];
for (const page of [pageA, pageB]) page.on("pageerror", (error) => errors.push(error.message));
const expect = playwrightExpect.configure({ timeout: 10000 });
const check = (label) => console.log(`PASS - ${label}`);
const messages = (page, text) => page.locator("section").getByText(text, { exact: true });
const register = async (page, name, label) => {
  await page.goto(`${base}/register`);
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(`e2e-${label}-${run}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill(`Test-${randomUUID()}`);
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
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
  await openChat(pageA, nameB);
  await expect(pageA.locator("section header").getByText("Online", { exact: true })).toBeVisible();
  await send(pageA, "Hello from A");
  await openChat(pageB, nameA);
  await expect(messages(pageB, "Hello from A")).toHaveCount(1);
  await send(pageA, "Live delivery");
  await expect(messages(pageB, "Live delivery")).toHaveCount(1);
  check("A starts chat; B receives messages without refresh");
  await send(pageB, "Reply from B");
  await expect(messages(pageA, "Reply from B")).toHaveCount(1);
  await pageA.reload();
  await openChat(pageA, nameB);
  for (const text of ["Hello from A", "Live delivery", "Reply from B"])
    await expect(messages(pageA, text)).toHaveCount(1);
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
  expect(errors).toEqual([]);
  console.log("All browser checks passed");
} catch (error) {
  // Do not dump pages, storage, requests, or JWTs on failure.
  console.error("FAIL -", error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
