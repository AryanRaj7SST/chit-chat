import { io } from "socket.io-client";

export const createSocket = (token) =>
  io(import.meta.env.VITE_SOCKET_URL, {
    autoConnect: false,
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
