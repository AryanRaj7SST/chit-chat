import "dotenv/config";
import jwt from "jsonwebtoken";
import { io } from "socket.io-client";

const BASE = (process.env.BASE_URL || "http://localhost:5000").trim().replace(/\/+$/, "");
const baseUrl = new URL(BASE);
if (!["http:", "https:"].includes(baseUrl.protocol) || baseUrl.pathname !== "/" || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash)
  throw new Error("BASE_URL must be the backend HTTP(S) origin, without /api or credentials");
const API = `${BASE}/api`;
const run = Date.now();
let failed = 0;

const check = (name, ok) => {
  process.stdout.write(`${ok ? "PASS" : "FAIL"} - ${name}\n`);
  if (!ok) failed++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const call = async (method, path, body, token) => {
  const res = await fetch(`${API}${path}`, {
    signal: AbortSignal.timeout(10000),
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
};

const connect = (token, options = {}) =>
  new Promise((resolve, reject) => {
    const s = io(BASE, { auth: { token }, reconnection: false, ...options });
    s.once("connect", () => resolve(s));
    s.once("connect_error", (error) => { s.disconnect(); reject(error); });
  });

const waitFor = (socket, event, ms = 2000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    socket.once(event, (d) => { clearTimeout(t); resolve(d); });
  });

const emitAck = (socket, event, payload) => socket.timeout(10000).emitWithAck(event, payload);

async function main() {
  const reg = (label) =>
    call("POST", "/auth/register", { name: `Test ${label}`, email: `${label}${run}@test.com`, password: "secret123" });

  const ra = await reg("a");
  const rb = await reg("b");
  const rc = await reg("c");
  check("register returns 201 and a token", ra.status === 201 && !!ra.data.token);
  const [tokenA, tokenB, tokenC] = [ra.data.token, rb.data.token, rc.data.token];
  const [idA, idB] = [ra.data.user._id, rb.data.user._id];

  check("duplicate email returns 409", (await reg("a")).status === 409);
  check("bad password returns 401",
    (await call("POST", "/auth/login", { email: `a${run}@test.com`, password: "wrong" })).status === 401);
  check("login returns 200",
    (await call("POST", "/auth/login", { email: `a${run}@test.com`, password: "secret123" })).status === 200);
  check("/auth/me returns the user", (await call("GET", "/auth/me", null, tokenA)).data.user?._id === idA);
  check("users route requires auth", (await call("GET", "/users")).status === 401);

  const search = await call("GET", `/users?q=b${run}@test`, null, tokenA);
  check("search finds B and excludes self",
    search.data.users?.some((u) => u._id === idB) && !search.data.users.some((u) => u._id === idA));

  const c1 = await call("POST", "/conversations", { userId: idB }, tokenA);
  const c2 = await call("POST", "/conversations", { userId: idA }, tokenB);
  check("conversation created", c1.status === 200 && !!c1.data.conversation?._id);
  check("no duplicate conversation (A->B and B->A same id)", c1.data.conversation._id === c2.data.conversation._id);
  check("cannot chat with yourself", (await call("POST", "/conversations", { userId: idA }, tokenA)).status === 400);
  const convId = c1.data.conversation._id;

  check("outsider C cannot read messages (403)",
    (await call("GET", `/conversations/${convId}/messages`, null, tokenC)).status === 403);

  let badTokenRejected = false;
  try { await connect("garbage"); } catch { badTokenRejected = true; }
  check("socket with bad token is rejected", badTokenRejected);

  let canSignExpiredToken = false;
  if (process.env.JWT_SECRET) {
    try {
      jwt.verify(tokenA, process.env.JWT_SECRET);
      canSignExpiredToken = true;
    } catch { /* A local development secret may differ from the remote server. */ }
  }
  if (canSignExpiredToken) {
    const expiredToken = jwt.sign({ id: idA }, process.env.JWT_SECRET, { expiresIn: -1 });
    let expiredRejected = false;
    try { await connect(expiredToken); } catch { expiredRejected = true; }
    check("socket with expired token is rejected", expiredRejected);
  } else {
    process.stdout.write("SKIP - expired-token signing check (matching JWT_SECRET unavailable; production secret is not required)\n");
  }

  const websocket = await connect(tokenA, { transports: ["websocket"] });
  check("WebSocket transport connects with JWT", websocket.io.engine.transport.name === "websocket");
  websocket.disconnect();

  const reconnectSocket = await connect(tokenA);
  reconnectSocket.disconnect();
  reconnectSocket.auth = { token: "garbage" };
  const rejectedReconnect = waitFor(reconnectSocket, "connect_error");
  reconnectSocket.connect();
  check("reconnect revalidates the handshake token", (await rejectedReconnect).message === "Authentication error");
  reconnectSocket.disconnect();

  const sockA = await connect(tokenA);
  const statusEvents = [];
  sockA.on("user:status", (e) => statusEvents.push(e));
  const sockB = await connect(tokenB);
  const sockC = await connect(tokenC);
  await sleep(300);
  check("A is told B came online", statusEvents.some((e) => e.userId === idB && e.online === true));

  const sockB2 = await connect(tokenB);
  sockB2.disconnect();
  await sleep(300);
  check("B stays online when only one of two sockets closes",
    !statusEvents.some((e) => e.userId === idB && e.online === false));

  const incoming = waitFor(sockB, "message:new");
  const ack = await emitAck(sockA, "message:send", { conversationId: convId, content: "  hello B  ", tempId: "t1" });
  const got = await incoming;
  check("ack confirms persisted message", ack.success && ack.message._id && ack.tempId === "t1");
  check("B receives message:new instantly", got.content === "hello B" && got.sender === idA);

  const retries = await Promise.all([1, 2].map(() => emitAck(sockA, "message:send", {
    conversationId: convId, content: "hello B", tempId: "t1",
  })));
  check("concurrent retries reuse the persisted message", retries.every((r) => r.success && r.message._id === ack.message._id));
  check("persisted retry identity and timestamp are returned", ack.message.tempId === "t1" && !!ack.message.createdAt);

  check("empty message rejected", (await emitAck(sockA, "message:send", { conversationId: convId, content: "   " })).success === false);
  check("overlong message rejected",
    (await emitAck(sockA, "message:send", { conversationId: convId, content: "x".repeat(2001) })).success === false);
  check("outsider C cannot send into the conversation",
    (await emitAck(sockC, "message:send", { conversationId: convId, content: "hi" })).success === false);

  const typing = waitFor(sockB, "typing:update");
  sockA.emit("typing:start", { conversationId: convId });
  const t = await typing;
  check("B receives typing indicator from A", t.userId === idA && t.isTyping === true && t.conversationId === convId);

  const stoppedTyping = waitFor(sockB, "typing:update");
  sockA.emit("typing:start", { conversationId: convId });
  sockA.emit("typing:stop", { conversationId: convId });
  check("rapid typing updates preserve the newest state", (await stoppedTyping).isTyping === false);

  let leaked = false;
  sockB.once("typing:update", () => { leaked = true; });
  sockC.emit("typing:start", { conversationId: convId });
  await sleep(300);
  check("outsider typing events are not relayed", leaked === false);

  const hist = await call("GET", `/conversations/${convId}/messages`, null, tokenB);
  check("history returns the saved message (only 1)", hist.data.messages?.length === 1 && hist.data.messages[0].content === "hello B");

  const list = await call("GET", "/conversations", null, tokenA);
  check("conversation list shows lastMessage", list.data.conversations?.[0]?.lastMessage?.content === "hello B");

  const firstSends = await Promise.all([1, 2].map(() => emitAck(sockA, "message:send", {
    conversationId: convId, content: "newest message", tempId: "t2",
  })));
  check("concurrent first sends persist one message", firstSends.every((r) => r.success && r.message._id === firstSends[0].message._id));
  await emitAck(sockA, "message:send", { conversationId: convId, content: "hello B", tempId: "t1" });
  const afterRetry = await call("GET", "/conversations", null, tokenA);
  check("retrying an old message preserves the newest preview", afterRetry.data.conversations?.[0]?.lastMessage?.content === "newest message");
  const retryHistory = await call("GET", `/conversations/${convId}/messages`, null, tokenA);
  check("history contains exactly two messages after concurrent sends and retries", retryHistory.data.messages?.length === 2);

  const unreadB = await call("GET", "/conversations", null, tokenB);
  check("server counts two unread messages from the other participant", unreadB.data.conversations?.[0]?.unreadCount === 2);
  check("own messages do not count as unread", afterRetry.data.conversations?.[0]?.unreadCount === 0);
  let readLeaked = false;
  sockC.on("message:read:update", () => { readLeaked = true; });
  check("outsider cannot mark a conversation read", !(await emitAck(sockC, "message:read", { conversationId: convId })).success);
  check("invalid conversation id cannot be marked read", !(await emitAck(sockB, "message:read", { conversationId: "invalid" })).success);
  const otherTabB = await connect(tokenB);
  const readUpdate = waitFor(sockA, "message:read:update");
  const tabReadUpdate = waitFor(otherTabB, "message:read:update");
  const readAck = await emitAck(sockB, "message:read", {
    conversationId: convId, userId: idA, at: "2099-01-01T00:00:00Z",
  });
  const readEvent = await readUpdate;
  check("read update goes to the other participant with server identity and time",
    readAck.success && readEvent.conversationId === convId && readEvent.userId === idB &&
    Math.abs(Date.now() - new Date(readEvent.at).getTime()) < 10000);
  check("read update also synchronizes the reader's other tabs", (await tabReadUpdate).at === readAck.at);
  otherTabB.disconnect();
  const readList = await call("GET", "/conversations", null, tokenB);
  check("marking read clears the persistent unread count", readList.data.conversations?.[0]?.unreadCount === 0);
  check("per-participant read timestamp persists in REST responses", readList.data.conversations?.[0]?.lastReadAt?.[idB] === readAck.at);
  check("read updates do not reorder conversations", readList.data.conversations?.[0]?.updatedAt === afterRetry.data.conversations?.[0]?.updatedAt);
  const repeatRead = await emitAck(sockB, "message:read", { conversationId: convId });
  check("repeated read timestamps do not move backwards", new Date(repeatRead.at) >= new Date(readAck.at));
  await emitAck(sockA, "message:send", { conversationId: convId, content: "after read", tempId: "t3" });
  await emitAck(sockB, "message:send", { conversationId: convId, content: "reply", tempId: "t4" });
  const latestB = await call("GET", "/conversations", null, tokenB);
  const latestA = await call("GET", "/conversations", null, tokenA);
  check("only new messages after lastReadAt are unread", latestB.data.conversations?.[0]?.unreadCount === 1);
  check("unread counts are independent for each participant", latestA.data.conversations?.[0]?.unreadCount === 1);
  check("read receipts do not leak to outsiders", !readLeaked);

  sockB.disconnect();
  await sleep(300);
  check("A is told B went offline", statusEvents.some((e) => e.userId === idB && e.online === false));
  const persisted = await call("GET", "/conversations", null, tokenB);
  check("unread count survives socket disconnect", persisted.data.conversations?.[0]?.unreadCount === 1);

  sockA.disconnect();
  sockC.disconnect();
}

main()
  .catch((err) => { console.error("Script error:", err.message); failed++; })
  .finally(() => {
    process.stdout.write(failed ? `\n${failed} check(s) FAILED\n` : "\nAll checks passed\n");
    process.exit(failed ? 1 : 0);
  });
