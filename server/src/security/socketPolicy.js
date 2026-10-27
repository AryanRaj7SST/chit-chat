import { createLimiter } from "./rateLimit.js";
import { getUserFromToken } from "../utils/token.js";

const object = value => value && typeof value === "object" && !Array.isArray(value);
const id = value => typeof value === "string" && value.length <= 100;
const shape = (value, required, optional = []) => object(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => [...required, ...optional].includes(key));
export function validPayload(event, payload) {
  if (event === "message:send") return shape(payload, ["conversationId"], ["content", "caption", "type", "tempId", "replyTo", "attachments"]) && id(payload.conversationId)
    && ["content", "caption", "tempId", "replyTo"].every(key => payload[key] === undefined || typeof payload[key] === "string")
    && ["tempId", "replyTo"].every(key => payload[key] === undefined || id(payload[key])) && (payload.content?.length || 0) <= 100000 && (payload.caption?.length || 0) <= 50000
    && (payload.type === undefined || ["text", "image"].includes(payload.type))
    && (payload.attachments === undefined || (Array.isArray(payload.attachments) && payload.attachments.length <= 10 && payload.attachments.every(a => shape(a, ["key"], ["thumbKey", "width", "height"]) && typeof a.key === "string" && (a.thumbKey === undefined || typeof a.thumbKey === "string") && ["width", "height"].every(key => a[key] === undefined || (Number.isInteger(a[key]) && a[key] > 0 && a[key] <= 100000)))));
  if (["message:read", "typing:start", "typing:stop"].includes(event)) return shape(payload, ["conversationId"]) && id(payload.conversationId);
  if (event === "message:delivered") return shape(payload, ["messageId"]) && id(payload.messageId);
  if (event === "message:react") return shape(payload, ["messageId", "emoji"]) && id(payload.messageId) && (payload.emoji === null || (typeof payload.emoji === "string" && payload.emoji.length <= 16));
  if (event === "message:edit") return shape(payload, ["messageId", "content"]) && id(payload.messageId) && typeof payload.content === "string" && payload.content.length <= 100000;
  if (event === "message:delete") return shape(payload, ["messageId", "forEveryone"]) && id(payload.messageId) && typeof payload.forEveryone === "boolean";
  if (event === "conversation:timer") return shape(payload, ["conversationId", "seconds"]) && id(payload.conversationId) && Number.isInteger(payload.seconds);
  return false;
}
export function hardenSocket(socket) {
  socket.data.latestTyping = new Map();
  const messages = createLimiter(20, 10000), typing = createLimiter(60, 10000), actions = createLimiter(180, 10000);
  let queue = Promise.resolve(), pending = 0;
  socket.use(([event, payload, ...rest], next) => {
    const ack = typeof rest.at(-1) === "function" ? rest.at(-1) : () => {};
    const limiter = event === "message:send" ? messages : event.startsWith("typing:") ? typing : actions;
    if (!limiter("socket").allowed) return ack({ success: false, message: "Slow down" });
    if (!validPayload(event, payload)) return ack({ success: false, message: "Invalid event payload" });
    if (pending >= 64) return ack({ success: false, message: "Slow down" });
    if (event.startsWith("typing:")) socket.data.latestTyping.set(payload.conversationId, payload);
    pending++;
    // Preserve packet order while asynchronous authentication checks complete.
    queue = queue.then(async () => {
      const user = await getUserFromToken(socket.handshake.auth?.token);
      if (!user || String(user._id) !== socket.user.id) { ack({ success: false, message: "Authentication error" }); socket.disconnect(true); return; }
      if (socket.connected) next();
    }).catch(() => ack({ success: false, message: "Authentication error" })).finally(() => pending--);
  });
}
