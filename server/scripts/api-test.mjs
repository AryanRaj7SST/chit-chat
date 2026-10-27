import { io } from "socket.io-client";

const BASE = process.env.BASE_URL || "http://localhost:5000";
const API = `${BASE}/api`;
const run = Date.now();
let failed = 0;

const check = (name, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}`);
  if (!ok) failed++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const call = async (method, path, body, token) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
};

const connect = (token) =>
  new Promise((resolve, reject) => {
    const s = io(BASE, { auth: { token }, reconnection: false });
    s.on("connect", () => resolve(s));
    s.on("connect_error", reject);
  });

const waitFor = (socket, event, ms = 2000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    socket.once(event, (d) => { clearTimeout(t); resolve(d); });
  });

const emitAck = (socket, event, payload) => new Promise((res) => socket.emit(event, payload, res));

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

  check("empty message rejected", (await emitAck(sockA, "message:send", { conversationId: convId, content: "   " })).success === false);
  check("overlong message rejected",
    (await emitAck(sockA, "message:send", { conversationId: convId, content: "x".repeat(2001) })).success === false);
  check("outsider C cannot send into the conversation",
    (await emitAck(sockC, "message:send", { conversationId: convId, content: "hi" })).success === false);

  const typing = waitFor(sockB, "typing:update");
  sockA.emit("typing:start", { conversationId: convId });
  const t = await typing;
  check("B receives typing indicator from A", t.userId === idA && t.isTyping === true && t.conversationId === convId);

  let leaked = false;
  sockB.once("typing:update", () => { leaked = true; });
  sockC.emit("typing:start", { conversationId: convId });
  await sleep(300);
  check("outsider typing events are not relayed", leaked === false);

  const hist = await call("GET", `/conversations/${convId}/messages`, null, tokenB);
  check("history returns the saved message (only 1)", hist.data.messages?.length === 1 && hist.data.messages[0].content === "hello B");

  const list = await call("GET", "/conversations", null, tokenA);
  check("conversation list shows lastMessage", list.data.conversations?.[0]?.lastMessage?.content === "hello B");

  sockB.disconnect();
  await sleep(300);
  check("A is told B went offline", statusEvents.some((e) => e.userId === idB && e.online === false));

  sockA.disconnect();
  sockC.disconnect();
}

main()
  .catch((err) => { console.error("Script error:", err.message); failed++; })
  .finally(() => {
    console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
    process.exit(failed ? 1 : 0);
  });
