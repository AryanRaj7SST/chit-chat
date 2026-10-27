import { createContext, useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { createSocket } from "../services/socket";

export const SocketContext = createContext({ socket: null, connected: false, onlineIds: new Set() });

export function SocketProvider({ children }) {
  const { token, user } = useAuth();
  const userId = user?._id;
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [onlineIds, setOnlineIds] = useState(() => new Set());

  useEffect(() => {
    if (!token || !userId) return;

    const s = createSocket(token);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => {
      setConnected(false);
      setOnlineIds(new Set());
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
      if (err.message === "Authentication error") {
        s.disconnect();
        window.dispatchEvent(new Event("auth:logout"));
      }
    };

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("presence:list", onList);
    s.on("user:status", onStatus);
    s.on("connect_error", onError);
    setSocket(s);
    s.connect();

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("presence:list", onList);
      s.off("user:status", onStatus);
      s.off("connect_error", onError);
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
