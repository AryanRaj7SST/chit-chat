import "dotenv/config";
import jwt from "jsonwebtoken";
import { io } from "socket.io-client";
import { getBuddyReply } from "../src/bot/buddy.js";
import { createHash } from "node:crypto";

const BASE = (process.env.BASE_URL || "http://localhost:5000").trim().replace(/\/+$/, "");
const baseUrl = new URL(BASE);
if (!["http:", "https:"].includes(baseUrl.protocol) || baseUrl.pathname !== "/" || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash)
  throw new Error("BASE_URL must be the backend HTTP(S) origin, without /api or credentials");
const API = `${BASE}/api`;
const run = process.env.SECURITY_RUN_ID || Date.now();
let failed = 0;

const check = (name, ok) => {
  process.stdout.write(`${ok ? "PASS" : "FAIL"} - ${name}\n`);
  if (!ok) failed++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const call = async (method, path, body, token, headers = {}) => {
  const res = await fetch(`${API}${path}`, {
    signal: AbortSignal.timeout(10000),
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
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
  const stretchedGreeting = getBuddyReply("hii", "api-direct", { variant: 0 });
  check("Buddy recognizes hii instead of the generic fallback", /^hello|^hey|^hi!/i.test(stretchedGreeting) && stretchedGreeting !== getBuddyReply("unmatched words", "api-direct", { variant: 0 }));
  const reg = (label) =>
    call("POST", "/auth/register", { name: `Test ${label}`, email: `${label}${run}@test.com`, password: "Test-Password-42!" }, null,
      ["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname) ? { "X-Forwarded-For": `2001:db8:${createHash("sha256").update(label + run).digest("hex").slice(0, 4)}::1` } : {});

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
    (await call("POST", "/auth/login", { email: `a${run}@test.com`, password: "Test-Password-42!" })).status === 200);
  check("/auth/me returns the user", (await call("GET", "/auth/me", null, tokenA)).data.user?._id === idA);
  check("users route requires auth", (await call("GET", "/users")).status === 401);

  const search = await call("GET", `/users?q=b${run}@test`, null, tokenA);
  check("search finds B and excludes self",
    search.data.users?.some((u) => u._id === idB) && !search.data.users.some((u) => u._id === idA));
  check("search needs at least two characters", (await call("GET", "/users?q=a", null, tokenA)).data.users.length === 0 && (await call("GET", "/users", null, tokenA)).data.users.length === 0);
  check("search masks non-friend emails", search.data.users.every((u) => !u.email && u.maskedEmail && u.relationship === "none"));
  check("bot is excluded from search", (await call("GET", "/users?q=Buddy", null, tokenA)).data.users.length === 0);
  check("non-friends cannot create a conversation", (await call("POST", "/conversations", { userId: idB }, tokenA)).status === 403);

  const botList = await call("GET", "/conversations", null, tokenA);
  const buddyConversation = botList.data.conversations.find((conversation) => conversation.participants.some((u) => u.isBot));
  const buddyId = buddyConversation?.participants.find((u) => u.isBot)?._id;
  check("new users have Buddy and a welcome message", !!buddyId && !!buddyConversation.lastMessage?.content);
  const earlyA = await connect(tokenA);
  const earlyB = await connect(tokenB);
  const earlyC = await connect(tokenC);
  const strangers = [];
  earlyC.on("user:status", (event) => strangers.push(event));
  const strangerUser = rc;
  const strangerProbe = await connect(strangerUser.data.token);
  strangerProbe.disconnect();
  await sleep(150);
  check("strangers do not receive presence", strangers.length === 0);
  // Reconnect to obtain a fresh snapshot even if the initial snapshot arrived before this test.
  const botProbe = await connect(tokenA);
  const botPresence = await waitFor(botProbe, "presence:list");
  check("Buddy is always present online", botPresence.includes(buddyId));
  botProbe.disconnect();
  const requestEvent = waitFor(earlyB, "friend:request");
  const invitation = await call("POST", "/friends/requests", { userId: idB }, tokenA);
  check("friend request created and delivered", invitation.status === 201 && (await requestEvent).from._id === idA);
  check("duplicate friend request returns 409", (await call("POST", "/friends/requests", { userId: idB }, tokenA)).status === 409);
  check("incoming request is listed", (await call("GET", "/friends/requests", null, tokenB)).data.incoming.some((r) => r._id === invitation.data.requestId));
  const sentSearch = (await call("GET", `/users?q=b${run}`, null, tokenA)).data.users.find((u) => u._id === idB);
  const receivedSearch = (await call("GET", `/users?q=a${run}`, null, tokenB)).data.users.find((u) => u._id === idA);
  check("search reports pending direction without exposing emails", sentSearch.relationship === "request_sent" && receivedSearch.relationship === "request_received" && !sentSearch.email && !receivedSearch.email && sentSearch.requestId === invitation.data.requestId);
  check("third user cannot accept a request", (await call("POST", `/friends/requests/${invitation.data.requestId}/accept`, {}, tokenC)).status === 403);
  const acceptedEvent = waitFor(earlyA, "friend:accepted");
  const acceptedPresenceA = waitFor(earlyA, "user:status");
  const acceptedPresenceB = waitFor(earlyB, "user:status");
  const accepted = await call("POST", `/friends/requests/${invitation.data.requestId}/accept`, {}, tokenB);
  check("recipient accepts and requester gets friend event", accepted.status === 200 && (await acceptedEvent).user._id === idB);
  check("new friends see online dots without reconnecting", (await acceptedPresenceA).userId === idB && (await acceptedPresenceB).userId === idA);
  check("both users list each other as friends", (await call("GET", "/friends", null, tokenA)).data.friends.some((u) => u._id === idB) && (await call("GET", "/friends", null, tokenB)).data.friends.some((u) => u._id === idA));
  check("accepted friends can see full email in search", (await call("GET", `/users?q=b${run}`, null, tokenA)).data.users.find((u) => u._id === idB)?.email === `b${run}@test.com`);
  check("bot cannot receive requests or be unfriended", (await call("POST", "/friends/requests", { userId: buddyId }, tokenA)).status === 400 && (await call("DELETE", `/friends/${buddyId}`, null, tokenA)).status === 400);
  check("friend routes require authentication", (await call("GET", "/friends")).status === 401);
  check("invalid friend ids are rejected", (await call("POST", "/friends/requests", { userId: "invalid" }, tokenA)).status === 400);
  check("self requests are rejected", (await call("POST", "/friends/requests", { userId: idA }, tokenA)).status === 400);
  check("unknown friend target returns 404", (await call("POST", "/friends/requests", { userId: "000000000000000000000001" }, tokenA)).status === 404);
  for (const socket of [earlyA, earlyB, earlyC]) socket.disconnect();
  await sleep(200);

  const c1 = await call("POST", "/conversations", { userId: idB }, tokenA);
  const c2 = await call("POST", "/conversations", { userId: idA }, tokenB);
  check("conversation created", c1.status === 200 && !!c1.data.conversation?._id);
  check("empty friend conversations are listed", (await call("GET", "/conversations", null, tokenA)).data.conversations.some((c) => c._id === c1.data.conversation._id && c.lastMessage === null));
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
  check("unknown read payload fields are rejected", !(await emitAck(sockB, "message:read", { conversationId: convId, userId: idA, at: "2099-01-01T00:00:00Z" })).success);
  const readAck = await emitAck(sockB, "message:read", { conversationId: convId });
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

  const returningB = await connect(tokenB);
  await sleep(200);
  const removedEvent = waitFor(returningB, "friend:removed");
  check("unfriend succeeds", (await call("DELETE", `/friends/${idB}`, null, tokenA)).status === 200);
  check("unfriend notifies the other user", (await removedEvent).userId === idA);
  check("unfriended conversation disappears", !(await call("GET", "/conversations", null, tokenA)).data.conversations.some((c) => c._id === convId));
  const deniedSend = await emitAck(sockA, "message:send", { conversationId: convId, content: "not allowed", tempId: "denied" });
  check("membership alone no longer permits sending", !deniedSend.success && deniedSend.message === "You are no longer friends");
  check("a former friend cannot sign an upload", (await call("POST", "/uploads/sign", { conversationId: convId, kind: "original", mime: "image/png", size: 10 }, tokenA)).status === 403);
  check("old history remains membership-readable", (await call("GET", `/conversations/${convId}/messages`, null, tokenA)).status === 200);
  let typingAfterRemoval = false;
  returningB.on("typing:update", () => { typingAfterRemoval = true; });
  sockA.emit("typing:start", { conversationId: convId });
  const statusesAfterRemoval = statusEvents.length;
  returningB.disconnect();
  await sleep(300);
  check("typing and presence stop after unfriend", !typingAfterRemoval && statusEvents.length === statusesAfterRemoval);
  const again = await call("POST", "/friends/requests", { userId: idB }, tokenA);
  await call("POST", `/friends/requests/${again.data.requestId}/accept`, {}, tokenB);
  check("re-friending restores the same history", (await call("GET", "/conversations", null, tokenA)).data.conversations.some((c) => c._id === convId));
  const idC = rc.data.user._id;
  const cross = await Promise.all([
    call("POST", "/friends/requests", { userId: idC }, tokenA),
    call("POST", "/friends/requests", { userId: idA }, tokenC),
  ]);
  check("mutual requests auto-accept despite insert races", cross.every((response) => [200, 201].includes(response.status)) && (await call("GET", "/friends", null, tokenC)).data.friends.some((u) => u._id === idA));
  const decline = await call("POST", "/friends/requests", { userId: idC }, tokenB);
  const eventB = await connect(tokenB);
  const declinedEvent = waitFor(eventB, "friend:request:removed");
  check("requester cannot decline", (await call("POST", `/friends/requests/${decline.data.requestId}/decline`, {}, tokenB)).status === 403);
  check("recipient can decline", (await call("POST", `/friends/requests/${decline.data.requestId}/decline`, {}, tokenC)).status === 200);
  check("decline notifies the requester", (await declinedEvent).requestId === decline.data.requestId);
  const retryInvitation = await call("POST", "/friends/requests", { userId: idC }, tokenB);
  check("decline permits a later request", retryInvitation.status === 201);
  check("recipient cannot cancel", (await call("DELETE", `/friends/requests/${retryInvitation.data.requestId}`, null, tokenC)).status === 403);
  const cancelledEvent = waitFor(sockC, "friend:request:removed");
  check("requester can cancel", (await call("DELETE", `/friends/requests/${retryInvitation.data.requestId}`, null, tokenB)).status === 200);
  check("cancel notifies the recipient", (await cancelledEvent).requestId === retryInvitation.data.requestId);
  eventB.disconnect();

  const botMessage = waitFor(sockA, "message:new", 3000);
  const botAck = await emitAck(sockA, "message:send", { conversationId: buddyConversation._id, content: "hii", tempId: "bot-hello" });
  const hello = await botMessage;
  check("Buddy replies after a successful ack", botAck.success && hello.sender === buddyId && !!hello.content);
  check("Buddy delivery is recorded before its read receipt", !!botAck.message.deliveredAt);
  check("Buddy greets hii over the socket", /^(Hello|Hey|Hi!)/.test(hello.content));
  const jokeMessage = waitFor(sockA, "message:new", 3000);
  await emitAck(sockA, "message:send", { conversationId: buddyConversation._id, content: "joke", tempId: "bot-joke" });
  check("Buddy joke differs from greeting", (await jokeMessage).content !== hello.content);
  const botHistory = await call("GET", `/conversations/${buddyConversation._id}/messages`, null, tokenA);
  check("welcome is created only once", botHistory.data.messages.filter((m) => m.sender === buddyId).length === 3);
  const repeatedBotAck = await emitAck(sockA, "message:send", { conversationId: buddyConversation._id, content: "hii", tempId: "bot-hello" });
  await sleep(1700);
  const repeatedBotHistory = await call("GET", `/conversations/${buddyConversation._id}/messages`, null, tokenA);
  check("retrying a bot send does not schedule a duplicate reply", repeatedBotAck.message._id === botAck.message._id && repeatedBotHistory.data.messages.length === botHistory.data.messages.length);

  const askBuddy = async (content, suffix) => {
    const response = waitFor(sockA, "message:new", 4000);
    const ack = await emitAck(sockA, "message:send", { conversationId: buddyConversation._id, content, tempId: `bot-kb-${suffix}` });
    check(`Buddy acknowledges ${content}`, ack.success);
    const reply = await response;
    check(`Buddy is the sender for ${content}`, reply.sender === buddyId);
    return reply.content;
  };
  check("Buddy explains binary search complexity", (await askBuddy("binary search", "search")).includes("O(log n)"));
  check("Buddy dsa command returns concepts", /Big O.*Arrays[\s\S]*Type any concept name/.test(await askBuddy("dsa", "list")));
  check("Buddy starts a quiz", /^What is .+\?/.test(await askBuddy("quiz me", "quiz")));
  const revealed = await askBuddy("answer", "answer");
  check("Buddy reveals the pending quiz answer", revealed.length > 20 && !revealed.startsWith("Type quiz me"));

  const sign = (changes = {}, token = tokenA) => call("POST", "/uploads/sign", { conversationId: convId, kind: "original", mime: "image/png", size: 68, ...changes }, token);
  check("upload signing requires authentication", (await sign({}, null)).status === 401);
  check("upload signing rejects SVG", (await sign({ mime: "image/svg+xml" })).status === 400);
  check("upload signing rejects oversized originals", (await sign({ size: 25 * 1024 * 1024 + 1 })).status === 400);
  check("upload signing rejects oversized thumbnails", (await sign({ kind: "thumb", size: 400 * 1024 + 1 })).status === 400);
  check("upload signing rejects non-members", (await sign({}, tokenC)).status === 403);
  const botUpload = await sign({ conversationId: buddyConversation._id });
  check("Buddy refuses image uploads politely", botUpload.status === 400 && botUpload.data.message === "Buddy can't see images yet");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6gAAAABJRU5ErkJggg==", "base64");
  const original = await sign({ size: png.length, width: 1, height: 1, filename: "ignored-dangerous.svg" });
  check("upload uses a server-generated PNG key", original.status === 200 && /^c\/[a-f0-9]{24}\/[a-f0-9-]{36}\.png$/.test(original.data.key));
  const put = async (signed, bytes, token = tokenA) => {
    const local = new URL(signed.upload.url).pathname.startsWith("/api/uploads/local/");
    return fetch(signed.upload.url, { method: signed.upload.method, headers: { ...signed.upload.headers, ...(local ? { Authorization: `Bearer ${token}` } : {}) }, body: bytes });
  };
  const localDriver = new URL(original.data.upload.url).pathname.startsWith("/api/uploads/local/");
  if (localDriver) check("local PUT also requires the owning user's JWT", (await put(original.data, png, tokenC)).status === 403);
  check("original bytes upload successfully", [200, 201, 204].includes((await put(original.data, png)).status));
  check("upload links cannot overwrite an existing object", (await put(original.data, png)).status === 412);
  const imageAck = await emitAck(sockA, "message:send", { conversationId: convId, tempId: "photo-roundtrip", caption: "Original test photo", attachments: [{ key: original.data.key, width: 1, height: 1 }] });
  check("image persists with trusted metadata and empty text", imageAck.success && imageAck.message.type === "image" && imageAck.message.content === "" && imageAck.message.attachments[0].size === png.length && imageAck.message.attachments[0].mime === "image/png");
  const againPhoto = await emitAck(sockA, "message:send", { conversationId: convId, tempId: "photo-roundtrip", attachments: [{ key: original.data.key }] });
  check("image retries reuse the acknowledged message", againPhoto.success && againPhoto.message._id === imageAck.message._id);
  const download = await call("GET", `/media?key=${encodeURIComponent(original.data.key)}`, null, tokenB);
  check("member receives a signed original URL", download.status === 200 && !!download.data.url);
  const downloaded = Buffer.from(await (await fetch(download.data.url)).arrayBuffer());
  const sha = data => createHash("sha256").update(data).digest("hex");
  check("original upload/download is byte-for-byte identical (SHA-256)", sha(png) === sha(downloaded));
  check("media denies non-members", (await call("GET", `/media?key=${encodeURIComponent(original.data.key)}`, null, tokenC)).status === 403);
  check("media rejects path traversal", (await call("GET", "/media?key=../../.env", null, tokenA)).status === 400);
  const wrong = Buffer.from("<html>not an image</html>");
  const fake = await sign({ size: wrong.length });
  await put(fake.data, wrong);
  const fakeAck = await emitAck(sockA, "message:send", { conversationId: convId, tempId: "fake-photo", attachments: [{ key: fake.data.key }] });
  check("wrong magic bytes behind a PNG extension are rejected", !fakeAck.success);
  if (localDriver && ["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname)) {
    const { local } = await import("../src/storage/local.js");
    check("invalid image object is removed from local storage", await local.head(fake.data.key) === null);
  } else {
    check("invalid image is not exposed by media API", (await call("GET", `/media?key=${encodeURIComponent(fake.data.key)}`, null, tokenA)).status === 404);
    process.stdout.write("SKIP - physical object deletion requires storage access on the target host\n");
  }
  const otherConversation = await call("POST", "/conversations", { userId: idC }, tokenA);
  const foreign = await sign({ conversationId: otherConversation.data.conversation._id, size: png.length });
  check("keys from another conversation cannot be attached", !(await emitAck(sockA, "message:send", { conversationId: convId, tempId: "foreign-photo", attachments: [{ key: foreign.data.key }] })).success);
  check("image sends to Buddy are refused even without signing", (await emitAck(sockA, "message:send", { conversationId: buddyConversation._id, type: "image", attachments: [{ key: original.data.key }] })).message === "Buddy can't see images yet");
  check("text limit counts emoji graphemes instead of UTF-16 units", (await emitAck(sockA, "message:send", { conversationId: convId, content: "😀".repeat(2000), tempId: "emoji-limit" })).success);

  const featureB = await connect(tokenB);
  const baseFeature = (await emitAck(sockA, "message:send", { conversationId: convId, content: "Feature search [literal] original", tempId: "feature-base" })).message;
  check("sender cannot forge delivery", !(await emitAck(sockA, "message:delivered", { messageId: baseFeature._id })).success);
  check("outsider cannot acknowledge delivery", !(await emitAck(sockC, "message:delivered", { messageId: baseFeature._id })).success);
  check("recipient can acknowledge delivery", (await emitAck(featureB, "message:delivered", { messageId: baseFeature._id })).success);
  check("delivery persists independently of read", !!(await call("GET", `/conversations/${convId}/messages`, null, tokenA)).data.messages.find(message => message._id === baseFeature._id)?.deliveredAt);
  const replyFeature = await emitAck(sockA, "message:send", { conversationId: convId, content: "Reply test", replyTo: baseFeature._id, tempId: "feature-reply" });
  check("reply includes a validated quote", replyFeature.success && replyFeature.message.replyTo._id === baseFeature._id && replyFeature.message.replyTo.preview.includes("original"));
  check("cross-conversation reply is rejected", !(await emitAck(sockA, "message:send", { conversationId: convId, content: "Forbidden reply", replyTo: hello._id, tempId: "feature-foreign-reply" })).success);
  check("outsider cannot react", !(await emitAck(sockC, "message:react", { messageId: baseFeature._id, emoji: "👍" })).success);
  check("reaction allowlist is enforced", !(await emitAck(featureB, "message:react", { messageId: baseFeature._id, emoji: "anything" })).success);
  check("member can react", (await emitAck(featureB, "message:react", { messageId: baseFeature._id, emoji: "👍" })).success);
  await Promise.all([emitAck(featureB, "message:react", { messageId: baseFeature._id, emoji: "😂" }), emitAck(featureB, "message:react", { messageId: baseFeature._id, emoji: "❤️" })]);
  const reacted = (await call("GET", `/conversations/${convId}/messages`, null, tokenA)).data.messages.find(message => message._id === baseFeature._id);
  check("concurrent reactions keep one per user", reacted.reactions.filter(reaction => reaction.user === idB).length === 1);
  check("reaction can be removed", (await emitAck(featureB, "message:react", { messageId: baseFeature._id, emoji: null })).success);
  check("non-sender cannot edit", !(await emitAck(featureB, "message:edit", { messageId: baseFeature._id, content: "Hacked" })).success);
  check("sender can edit recent text", (await emitAck(sockA, "message:edit", { messageId: baseFeature._id, content: "Edited feature [literal]" })).success);
  const edited = (await call("GET", `/conversations/${convId}/messages?q=${encodeURIComponent("[literal]")}`, null, tokenA)).data.messages;
  check("search is literal and includes edited text", edited.some(message => message._id === baseFeature._id && message.editedAt));
  check("search denies outsiders", (await call("GET", `/conversations/${convId}/messages?q=feature`, null, tokenC)).status === 403);
  check("non-sender cannot delete for everyone", !(await emitAck(featureB, "message:delete", { messageId: baseFeature._id, forEveryone: true })).success);
  check("recipient can hide their own view", (await emitAck(featureB, "message:delete", { messageId: baseFeature._id, forEveryone: false })).success);
  check("hidden messages stay out of the recipient's history", !(await call("GET", `/conversations/${convId}/messages`, null, tokenB)).data.messages.some(message => message._id === baseFeature._id));
  check("hiding does not delete the sender's view", (await call("GET", `/conversations/${convId}/messages`, null, tokenA)).data.messages.some(message => message._id === baseFeature._id));
  for (const event of ["message:react", "message:edit", "message:delete"]) check(`Buddy rejects ${event}`, !(await emitAck(sockA, event, { messageId: hello._id, emoji: "👍", content: "edit", forEveryone: true })).success);
  if (["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname)) {
    const mongoose = (await import("mongoose")).default;
    const Message = (await import("../src/models/Message.js")).default;
    const User = (await import("../src/models/User.js")).default;
    await mongoose.connect(process.env.MONGO_URI);
    try {
      await Message.collection.updateOne({ _id: new mongoose.Types.ObjectId(baseFeature._id), sender: new mongoose.Types.ObjectId(idA) }, { $set: { createdAt: new Date(Date.now() - 16 * 60000) } });
      check("edit after fifteen minutes is rejected", !(await emitAck(sockA, "message:edit", { messageId: baseFeature._id, content: "Too late" })).success);
      await Message.collection.updateOne({ _id: new mongoose.Types.ObjectId(baseFeature._id), sender: new mongoose.Types.ObjectId(idA) }, { $set: { createdAt: new Date(Date.now() - 49 * 3600000) } });
      check("delete after forty-eight hours is rejected", !(await emitAck(sockA, "message:delete", { messageId: baseFeature._id, forEveryone: true })).success);
      await User.updateOne({ _id: idB }, { "settings.readReceipts": false });
      let privateReadLeak = false;
      const privateReadListener = update => { if (update.conversationId === convId && update.userId === idB) privateReadLeak = true; };
      sockA.on("message:read:update", privateReadListener);
      await emitAck(featureB, "message:read", { conversationId: convId });
      await sleep(150); sockA.off("message:read:update", privateReadListener);
      check("private read updates are not emitted to the other participant", !privateReadLeak);
      const privateReads = (await call("GET", `/conversations/${convId}/messages`, null, tokenA)).data.lastReadAt;
      check("private read positions are omitted from history", !privateReads[idB]);
      check("private read positions are omitted from conversation lists", !(await call("GET", "/conversations", null, tokenA)).data.conversations.find(c => c._id === convId).lastReadAt[idB]);
      await User.updateOne({ _id: idB }, { "settings.readReceipts": true });
      const tieTime = new Date(Date.now() - 5000);
      const tied = await Message.insertMany([0, 1, 2].map(index => ({ conversation: convId, sender: idA, content: `Cursor tie fixture ${index}`, createdAt: tieTime })));
      const beforeTie = (await call("GET", `/conversations/${convId}/messages?limit=1&before=${encodeURIComponent(`${tieTime.toISOString()}|${tied[2]._id}`)}`, null, tokenA)).data.messages;
      check("history cursor preserves messages with equal timestamps", beforeTie[0]?._id === String(tied[1]._id));
      check("around cursor always includes the exact target", (await call("GET", `/conversations/${convId}/messages?around=${tied[0]._id}`, null, tokenA)).data.messages.some(message => message._id === String(tied[0]._id)));
    } finally { await mongoose.disconnect(); }
  } else process.stdout.write("SKIP - message time travel and privacy fixture mutation are local-only\n");
  check("sender can delete image for everyone", (await emitAck(sockA, "message:delete", { messageId: imageAck.message._id, forEveryone: true })).success);
  check("Buddy accepts replies in its own conversation", (await emitAck(sockA, "message:send", { conversationId: buddyConversation._id, replyTo: hello._id, content: "hii", tempId: "buddy-reply" })).success);
  check("deleted image media URL is denied", (await call("GET", `/media?key=${encodeURIComponent(original.data.key)}`, null, tokenA)).status === 404);
  if (localDriver) { const { local } = await import("../src/storage/local.js"); check("delete-for-everyone removes image bytes", await local.head(original.data.key) === null); }
  check("outsider cannot change chat settings", (await call("PATCH", `/conversations/${convId}/settings`, { pinned: true }, tokenC)).status === 403);
  for (const id of [convId, otherConversation.data.conversation._id, buddyConversation._id]) check("member can pin a chat", (await call("PATCH", `/conversations/${id}/settings`, { pinned: true }, tokenA)).status === 200);
  const rd = await reg("pin-extra");
  const invitationD = await call("POST", "/friends/requests", { userId: rd.data.user._id }, tokenA);
  await call("POST", `/friends/requests/${invitationD.data.requestId}/accept`, {}, rd.data.token);
  const extraChat = await call("POST", "/conversations", { userId: rd.data.user._id }, tokenA);
  check("fourth pinned chat is rejected", (await call("PATCH", `/conversations/${extraChat.data.conversation._id}/settings`, { pinned: true }, tokenA)).status === 400);
  await call("PATCH", `/conversations/${convId}/settings`, { muted: true, archived: true }, tokenA);
  const settingsA = (await call("GET", "/conversations", null, tokenA)).data.conversations.find(c => c._id === convId).settings;
  const settingsB = (await call("GET", "/conversations", null, tokenB)).data.conversations.find(c => c._id === convId).settings;
  check("mute/archive/pin persist per user", settingsA.pinned && settingsA.muted && settingsA.archived && !settingsB.pinned && !settingsB.muted && !settingsB.archived);
  await call("PATCH", `/conversations/${convId}/settings`, { muted: false, archived: false }, tokenA);
  check("profile rejects overlong About", (await call("PATCH", "/users/me", { about: "x".repeat(141) }, tokenA)).status === 400);
  check("profile name/About update is authenticated", (await call("PATCH", "/users/me", { name: "Feature Alice", about: "Local integration profile" }, tokenA)).data.user?.name === "Feature Alice");
  const avatar = await sign({ kind: "avatar-original", size: png.length, width: 1, height: 1 });
  const avatarThumb = await sign({ kind: "avatar-thumb", size: png.length, width: 1, height: 1 });
  await put(avatar.data, png); await put(avatarThumb.data, png);
  check("avatar keys use the authenticated owner namespace", avatar.data.key.startsWith(`u/${idA}/`));
  check("another user cannot claim an avatar upload", (await call("PATCH", "/users/me", { avatar: { key: avatar.data.key, thumbKey: avatarThumb.data.key } }, tokenB)).status === 403);
  check("own validated avatar can be saved", (await call("PATCH", "/users/me", { avatar: { key: avatar.data.key, thumbKey: avatarThumb.data.key } }, tokenA)).data.user?.avatar?.thumbKey === avatarThumb.data.key);
  check("avatar thumb can be requested through authenticated media", (await call("GET", `/media?key=${encodeURIComponent(avatarThumb.data.key)}`, null, tokenB)).status === 200);
  check("outsider cannot set a disappearing timer", !(await emitAck(sockC, "conversation:timer", { conversationId: convId, seconds: 86400 })).success);
  check("Buddy refuses disappearing timers", !(await emitAck(sockA, "conversation:timer", { conversationId: buddyConversation._id, seconds: 3600 })).success);
  check("invalid timer options are rejected", !(await emitAck(sockA, "conversation:timer", { conversationId: convId, seconds: 15 })).success);
  check("either member can set a timer", (await emitAck(featureB, "conversation:timer", { conversationId: convId, seconds: 86400 })).success);
  const timed = await emitAck(sockA, "message:send", { conversationId: convId, content: "Timed feature message", tempId: "feature-timed" });
  check("new messages use the conversation timer", timed.success && Math.abs(new Date(timed.message.expireAt) - new Date(timed.message.createdAt) - 86400000) < 3000);
  check("timer change creates a system message", (await call("GET", `/conversations/${convId}/messages?q=${encodeURIComponent("set disappearing messages")}`, null, tokenA)).data.messages.some(message => message.type === "system"));
  if (["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname)) {
    const mongoose = (await import("mongoose")).default;
    const Message = (await import("../src/models/Message.js")).default;
    const { sweepExpired } = await import("../src/services/expiry.js");
    const expiresPhoto = await sign({ size: png.length }); await put(expiresPhoto.data, png);
    const expiresAck = await emitAck(sockA, "message:send", { conversationId: convId, tempId: "expires-photo", attachments: [{ key: expiresPhoto.data.key }] });
    check("timed media is protected from automatic TTL deletion", expiresAck.success && expiresAck.message.hasMedia && !!expiresAck.message.expireAt);
    await mongoose.connect(process.env.MONGO_URI);
    try {
      const indexes = await Message.collection.indexes();
      check("TTL index excludes media documents", indexes.some(index => index.key.expireAt === 1 && index.expireAfterSeconds === 0 && index.partialFilterExpression?.hasMedia === false));
      await Message.updateOne({ _id: expiresAck.message._id }, { expireAt: new Date(Date.now() - 1000) });
      check("expired media URLs are denied before sweeping", (await call("GET", `/media?key=${encodeURIComponent(expiresPhoto.data.key)}`, null, tokenA)).status === 404);
      if (localDriver) {
        const { getStorage } = await import("../src/storage/index.js");
        const storage = getStorage(), remove = storage.remove;
        storage.remove = async key => { if (key === expiresPhoto.data.key) throw new Error("Simulated storage outage"); return remove(key); };
        try {
          const failedSweep = await sweepExpired({ onlyIds: [expiresAck.message._id] });
          check("failed media cleanup preserves the expired document for retry", failedSweep.failed === 1 && !!(await Message.exists({ _id: expiresAck.message._id })) && !!(await storage.head(expiresPhoto.data.key)));
        } finally { storage.remove = remove; }
      }
      const swept = await sweepExpired({ onlyIds: [expiresAck.message._id] });
      check("sweeper removes expired documents after media cleanup", swept.removed === 1 && !(await Message.exists({ _id: expiresAck.message._id })));
      if (localDriver) { const { local } = await import("../src/storage/local.js"); check("expired media bytes are physically removed", await local.head(expiresPhoto.data.key) === null); }
    } finally { await mongoose.disconnect(); }
  } else process.stdout.write("SKIP - expiry time-travel/storage inspection is local-only\n");
  await emitAck(sockA, "conversation:timer", { conversationId: convId, seconds: 0 });
  check("turning timers Off leaves new messages without expiry", !(await emitAck(sockA, "message:send", { conversationId: convId, content: "Timer off", tempId: "timer-off" })).message.expireAt);
  check("block succeeds", (await call("POST", `/users/${idB}/block`, {}, tokenA)).status === 200);
  check("blocking removes friendship", !(await call("GET", "/friends", null, tokenA)).data.friends.some(user => user._id === idB));
  check("blocked users are hidden from both searches", !(await call("GET", `/users?q=b${run}@test`, null, tokenA)).data.users.some(user => user._id === idB) && !(await call("GET", "/users?q=Feature%20Alice", null, tokenB)).data.users.some(user => user._id === idA));
  check("blocked user cannot send messages", !(await emitAck(featureB, "message:send", { conversationId: convId, content: "Blocked", tempId: "blocked-send" })).success);
  check("blocked user cannot react or edit", !(await emitAck(featureB, "message:react", { messageId: timed.message._id, emoji: "👍" })).success && !(await emitAck(sockA, "message:edit", { messageId: timed.message._id, content: "Blocked edit" })).success);
  check("blocked users cannot sign uploads", (await sign()).status === 403);
  check("blocked users cannot request avatars", (await call("GET", `/media?key=${encodeURIComponent(avatarThumb.data.key)}`, null, tokenB)).status === 403);
  check("blocked friend requests fail both ways", (await call("POST", "/friends/requests", { userId: idA }, tokenB)).status === 403 && (await call("POST", "/friends/requests", { userId: idB }, tokenA)).status === 403);
  check("self and Buddy cannot be blocked", (await call("POST", `/users/${idA}/block`, {}, tokenA)).status === 400 && (await call("POST", `/users/${buddyId}/block`, {}, tokenA)).status === 400);
  check("only the block owner sees and removes their block", (await call("GET", "/users/blocked", null, tokenA)).data.users.some(user => user._id === idB) && !(await call("GET", "/users/blocked", null, tokenB)).data.users.some(user => user._id === idA));
  await call("DELETE", `/users/${idB}/block`, null, tokenA);
  check("unblocking does not recreate friendship", !(await call("GET", "/friends", null, tokenA)).data.friends.some(user => user._id === idB));
  const previousSeen = (await call("GET", "/auth/me", null, tokenB)).data.user.lastSeenAt;
  featureB.disconnect();
  let newSeen;
  for (let i = 0; i < 20; i++) { await sleep(100); newSeen = (await call("GET", "/auth/me", null, tokenB)).data.user.lastSeenAt; if (newSeen && newSeen !== previousSeen) break; }
  check("last-seen timestamp persists after the final socket disconnects", newSeen && new Date(newSeen) > new Date(previousSeen || 0));

  const limited = rd;
  for (let i = 0; i < 30; i++) await sign({}, limited.data.token);
  check("upload signing is limited to thirty attempts per ten minutes", (await sign({}, limited.data.token)).status === 429);
  for (let i = 0; i < 20; i++) await call("POST", "/friends/requests", { userId: idA }, limited.data.token);
  check("friend requests are rate-limited per user", (await call("POST", "/friends/requests", { userId: idA }, limited.data.token)).status === 429);

  const health = await fetch(`${API}/health`);
  check("Helmet sets nosniff and no-referrer and removes x-powered-by", health.headers.get("x-content-type-options") === "nosniff" && health.headers.get("referrer-policy") === "no-referrer" && !health.headers.has("x-powered-by"));
  check("JSON requests over 100kb are rejected", (await call("POST", "/auth/login", { email: "x".repeat(110000), password: "Oversized-request" })).status === 413);
  check("JWT lasts twenty-four hours and includes a version", jwt.decode(tokenA).exp - jwt.decode(tokenA).iat === 86400 && Number.isInteger(jwt.decode(tokenA).tokenVersion));
  const loginIp = { "X-Forwarded-For": `2001:db8:ffff:${createHash("sha256").update(String(run)).digest("hex").slice(0, 4)}::1` };
  let lastLogin;
  for (let i = 0; i < 11; i++) lastLogin = await call("POST", "/auth/login", { email: `rate-${run}@example.com`, password: "Incorrect-Password-42!" }, null, loginIp);
  check("login limit returns 429 after ten attempts", lastLogin.status === 429);
  const flood = await connect(tokenA);
  try {
    const responses = await Promise.all(Array.from({ length: 25 }, (_, index) => emitAck(flood, "message:send", { conversationId: "invalid", content: `flood ${index}` })));
    check("socket send flood receives Slow down", responses.some(response => response.message === "Slow down"));
  } finally { flood.disconnect(); }
  const devices = [];
  try {
    const attempts = await Promise.allSettled(Array.from({ length: 12 }, () => connect(rd.data.token)));
    devices.push(...attempts.filter(result => result.status === "fulfilled").map(result => result.value));
    check("concurrent handshakes never exceed ten sockets", devices.length === 10 && attempts.filter(result => result.status === "rejected").length === 2);
    let capped = false; try { const extra = await connect(rd.data.token); extra.disconnect(); } catch (error) { capped = error.message === "Too many active devices"; }
    check("eleventh active socket is refused", capped);
  } finally { for (const device of devices) device.disconnect(); }
  if (["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname)) {
    const mongoose = (await import("mongoose")).default;
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    const fixtureMessage = new mongoose.Types.ObjectId(), fixtureUser = new mongoose.Types.ObjectId();
    try {
      const raw = await db.collection("messages").findOne({ _id: new mongoose.Types.ObjectId(baseFeature._id) });
      const rawUser = await db.collection("users").findOne({ _id: new mongoose.Types.ObjectId(idA) });
      check("native collection stores encrypted message text and About", raw.content.startsWith("v1:") && raw.content !== "Edited feature [literal]" && rawUser.about.startsWith("v1:"));
      const profiles = (await call("GET", "/conversations", null, tokenA)).data.conversations.flatMap(conversation => conversation.participants);
      check("populated conversation profiles decrypt About", profiles.some(user => String(user._id) === String(idA) && user.about === "Local integration profile"));
      const literal = await emitAck(sockA, "message:send", { conversationId: otherConversation.data.conversation._id, content: raw.content, tempId: "ciphertext-literal" });
      check("client ciphertext cannot become a decryption oracle", literal.success && literal.message.content === raw.content);
      check("serialisation decrypts protected text", (await call("GET", `/conversations/${convId}/messages?around=${baseFeature._id}`, null, tokenA)).data.messages.some(message => message.content === "Edited feature [literal]"));
      const captionUpload = await sign({ conversationId: otherConversation.data.conversation._id, size: png.length }); await put(captionUpload.data, png);
      const captionMessage = await emitAck(sockA, "message:send", { conversationId: otherConversation.data.conversation._id, caption: "Encrypted caption fixture", attachments: [{ key: captionUpload.data.key }], tempId: "encrypted-caption" });
      const rawCaption = await db.collection("messages").findOne({ _id: new mongoose.Types.ObjectId(captionMessage.message._id) });
      check("native collection stores encrypted captions", rawCaption.caption.startsWith("v1:") && captionMessage.message.caption === "Encrypted caption fixture");
      check("new password hashes use bcrypt cost twelve", rawUser.password.startsWith("$2b$12$") || rawUser.password.startsWith("$2a$12$"));
      if (process.env.MESSAGE_ENC_KEY) {
        await db.collection("messages").insertOne({ _id: fixtureMessage, conversation: new mongoose.Types.ObjectId(), sender: new mongoose.Types.ObjectId(idA), type: "text", content: "Migration plaintext fixture", caption: "Migration caption fixture", createdAt: new Date() });
        await db.collection("users").insertOne({ _id: fixtureUser, email: `migration-${run}@example.invalid`, isBot: true, about: "Migration about fixture" });
        const { migrateEncryption } = await import("./migrate-encryption.mjs");
        const scope = { apply: true, messageFilter: { _id: fixtureMessage }, userFilter: { _id: fixtureUser } };
        const first = await migrateEncryption(db, scope), saved = await db.collection("messages").findOne({ _id: fixtureMessage });
        const second = await migrateEncryption(db, scope), repeated = await db.collection("messages").findOne({ _id: fixtureMessage });
        check("migration encrypts plaintext and is idempotent", first.changed === 2 && second.changed === 0 && saved.content.startsWith("v1:") && saved.content === repeated.content);
        const { encrypt } = await import("../src/security/encryption.js");
        const fixtures = Array.from({ length: 501 }, (_, index) => ({ _id: new mongoose.Types.ObjectId(), conversation: new mongoose.Types.ObjectId(otherConversation.data.conversation._id), sender: new mongoose.Types.ObjectId(idA), content: encrypt(index === 0 ? "outside-search-window" : index === 500 ? "inside-search-window" : "window filler"), caption: "", type: "text", createdAt: new Date(Date.now() - 501 + index), hiddenFor: [], expireAt: null, hasMedia: false }));
        await db.collection("messages").insertMany(fixtures);
        try {
          check("encrypted search excludes matches outside the last 500 messages", (await call("GET", `/conversations/${otherConversation.data.conversation._id}/messages?q=outside-search-window`, null, tokenA)).data.messages.length === 0);
          check("encrypted search finds decrypted text within its window", (await call("GET", `/conversations/${otherConversation.data.conversation._id}/messages?q=inside-search-window`, null, tokenA)).data.messages.length === 1);
        } finally { await db.collection("messages").deleteMany({ _id: { $in: fixtures.map(row => row._id) } }); }
      } else process.stdout.write("SKIP - migration integration requires the matching MESSAGE_ENC_KEY in the test process\n");
    } finally { await db.collection("messages").deleteOne({ _id: fixtureMessage }); await db.collection("users").deleteOne({ _id: fixtureUser }); await mongoose.disconnect(); }
  } else process.stdout.write("SKIP - native collection and migration checks are local-only\n");
  const revokedSocket = await connect(tokenA);
  const revokedDisconnect = waitFor(revokedSocket, "disconnect");
  check("logout-all succeeds", (await call("POST", "/auth/logout-all", {}, tokenA)).status === 200);
  check("logout-all disconnects connected devices", (await revokedDisconnect) === "io server disconnect");
  check("logout-all invalidates the old REST token", (await call("GET", "/auth/me", null, tokenA)).status === 401);
  let oldRejected = false; try { const old = await connect(tokenA); old.disconnect(); } catch { oldRejected = true; }
  check("logout-all invalidates the old socket token", oldRejected);
  check("password change requires the current password", (await call("POST", "/auth/change-password", { currentPassword: "Wrong-Password-1!", newPassword: "Updated-Test-Password-42!" }, tokenC)).status === 400);
  check("password change rejects common passwords", (await call("POST", "/auth/change-password", { currentPassword: "Test-Password-42!", newPassword: "password123" }, tokenC)).status === 400);
  check("password change succeeds", (await call("POST", "/auth/change-password", { currentPassword: "Test-Password-42!", newPassword: "Updated-Test-Password-42!" }, tokenC)).status === 200);
  check("password change revokes previous tokens", (await call("GET", "/auth/me", null, tokenC)).status === 401);
  check("updated password can log in", (await call("POST", "/auth/login", { email: `c${run}@test.com`, password: "Updated-Test-Password-42!" })).status === 200);

  sockA.disconnect();
  sockC.disconnect();
}

main()
  .catch((err) => { console.error("Script error:", err.message); failed++; })
  .finally(() => {
    process.stdout.write(failed ? `\n${failed} check(s) FAILED\n` : "\nAll checks passed\n");
    process.exit(failed ? 1 : 0);
  });
