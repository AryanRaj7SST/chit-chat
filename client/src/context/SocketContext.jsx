import { createContext, useEffect, useRef, useState } from "react";
import api from "../services/api";
import toast from "react-hot-toast";
import { useAuth } from "../hooks/useAuth";
import { createSocket } from "../services/socket";

export const SocketContext = createContext({ socket: null, connected: false, onlineIds: new Set() });

export function SocketProvider({ children }) {
  const { token, user } = useAuth();
  const userId = user?._id;
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [onlineIds, setOnlineIds] = useState(() => new Set());

  useEffect(() => {
    if (!token || !userId) return;

    const s = createSocket(token);
    let canceled = false;
    const notified = new Set();

    const onConnect = () => setConnected(true);
    const onMessage = async message => {
      if (message.sender === userId) return;
      if (!message.deliveredAt) s.timeout(10000).emit("message:delivered", { messageId: message._id }, () => {});
      if (!document.hidden || !("Notification" in window) || Notification.permission !== "granted" || notified.has(message._id) || message.deletedAt || (message.expireAt && new Date(message.expireAt) <= new Date())) return;
      notified.add(message._id); if (notified.size > 1000) notified.delete(notified.values().next().value);
      try {
        const { data } = await api.get("/conversations");
        const conversation = data.conversations.find(item => item._id === message.conversation);
        if (canceled || !s.connected || !document.hidden || !conversation || conversation.settings?.muted || (conversation.lastReadAt?.[userId] && new Date(conversation.lastReadAt[userId]) >= new Date(message.createdAt))) return;
        const hide = userRef.current?.settings?.hidePreviews !== false;
        new Notification("MERN Chat", { body: hide ? "You have a new message." : message.type === "image" ? "Photo" : message.content.slice(0, 120), tag: message.conversation });
      } catch { /* Unsupported/denied notifications never interrupt messaging. */ }
    };
    const onDisconnect = reason => {
      setConnected(false);
      setOnlineIds(new Set());
      if (reason === "io server disconnect") window.dispatchEvent(new Event("auth:logout"));
    };
    const onList = (ids) => setOnlineIds(new Set(ids));
    const onStatus = ({ userId: id, online }) =>
      setOnlineIds((prev) => {
        const next = new Set(prev);
        if (online) next.add(id);
        else next.delete(id);
        return next;
      });
    const onError = (err) => {
      if (err.message === "Too many active devices") toast.error("Too many active devices. Close another tab or log out of all devices from your profile.");
      if (err.message === "Authentication error") {
        s.disconnect();
        window.dispatchEvent(new Event("auth:logout"));
      }
    };
    const onRemoved = ({ userId: id }) => setOnlineIds((previous) => {
      const next = new Set(previous);
      next.delete(id);
      return next;
    });

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("presence:list", onList);
    s.on("user:status", onStatus);
    s.on("connect_error", onError);
    s.on("friend:removed", onRemoved);
    s.on("message:new", onMessage);
    setSocket(s);
    s.connect();

    return () => {
      canceled = true;
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("presence:list", onList);
      s.off("user:status", onStatus);
      s.off("connect_error", onError);
      s.off("friend:removed", onRemoved);
      s.off("message:new", onMessage);
      s.disconnect();
      setSocket(null);
      setConnected(false);
      setOnlineIds(new Set());
    };
  }, [token, userId]);

  return (
    <SocketContext.Provider value={{ socket, connected, onlineIds }}>
      {children}
    </SocketContext.Provider>
  );
}
