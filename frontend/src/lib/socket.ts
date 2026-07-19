import { io, type Socket } from 'socket.io-client';
import { env } from './env';

let socket: Socket | null = null;

/** Lazily-created shared socket.io connection to the API/WS server. */
export function getSocket(): Socket {
  if (!socket) {
    // socket.io speaks http(s); our wsUrl is ws(s)://…
    const url = env.wsUrl.replace(/^ws/, 'http');
    socket = io(url, { transports: ['websocket'], autoConnect: true });
  }
  return socket;
}
