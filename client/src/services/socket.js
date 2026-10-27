import { io } from "socket.io-client";
import { socketUrl } from "./config";

export const createSocket = (token) =>
  io(socketUrl, {
    autoConnect: false,
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
