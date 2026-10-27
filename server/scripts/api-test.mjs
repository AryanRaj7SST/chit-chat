import "dotenv/config";
import jwt from "jsonwebtoken";
import { io } from "socket.io-client";
import { getBuddyReply } from "../src/bot/buddy.js";

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
  const stretchedGreeting = getBuddyReply("hii", "api-direct", { variant: 0 });
  check("Buddy recognizes hii instead of the generic fallback", /^hello|^hey|^hi!/i.test(stretchedGreeting) && stretchedGreeting !== getBuddyReply("unmatched words", "api-direct", { variant: 0 }));
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
  const strangerUser = await reg("stranger");
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

  const returningB = await connect(tokenB);
  await sleep(200);
  const removedEvent = waitFor(returningB, "friend:removed");
  check("unfriend succeeds", (await call("DELETE", `/friends/${idB}`, null, tokenA)).status === 200);
  check("unfriend notifies the other user", (await removedEvent).userId === idA);
  check("unfriended conversation disappears", !(await call("GET", "/conversations", null, tokenA)).data.conversations.some((c) => c._id === convId));
  const deniedSend = await emitAck(sockA, "message:send", { conversationId: convId, content: "not allowed", tempId: "denied" });
  check("membership alone no longer permits sending", !deniedSend.success && deniedSend.message === "You are no longer friends");
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

  const limited = await reg("limited");
  for (let i = 0; i < 20; i++) await call("POST", "/friends/requests", { userId: idA }, limited.data.token);
  check("friend requests are rate-limited per user", (await call("POST", "/friends/requests", { userId: idA }, limited.data.token)).status === 429);

  sockA.disconnect();
  sockC.disconnect();
}

main()
  .catch((err) => { console.error("Script error:", err.message); failed++; })
  .finally(() => {
    process.stdout.write(failed ? `\n${failed} check(s) FAILED\n` : "\nAll checks passed\n");
    process.exit(failed ? 1 : 0);
  });
