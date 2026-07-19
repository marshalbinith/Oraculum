/**
 * Socket.io WebSocket server. Clients subscribe to per-market or per-portfolio
 * channels; the indexer's Redis bus events are fanned out to subscribers.
 */
import type http from 'node:http';
import { Server as IOServer } from 'socket.io';
import { subscribe, type BusEvent } from '../events/bus.js';
import { getEnv } from '../config/env.js';

interface SubscribeMsg {
  channel: 'market' | 'markets' | 'portfolio';
  market_id?: string;
  address?: string;
}

// Room every market event is also fanned out to, for the markets list / dashboard.
const ALL_MARKETS = 'markets:all';

export function attachWebSocket(httpServer: http.Server): IOServer {
  const origins = getEnv()
    .CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const io = new IOServer(httpServer, {
    cors: { origin: origins, methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket) => {
    socket.on('subscribe', (msg: SubscribeMsg) => {
      if (msg.channel === 'market' && msg.market_id) {
        void socket.join(`market:${msg.market_id}`);
      } else if (msg.channel === 'markets') {
        void socket.join(ALL_MARKETS);
      } else if (msg.channel === 'portfolio' && msg.address) {
        void socket.join(`portfolio:${msg.address}`);
      }
    });
    socket.on('unsubscribe', (msg: SubscribeMsg) => {
      if (msg.channel === 'market' && msg.market_id) {
        void socket.leave(`market:${msg.market_id}`);
      } else if (msg.channel === 'markets') {
        void socket.leave(ALL_MARKETS);
      }
    });
  });

  // Fan out bus events: to the specific market room AND the global list room.
  // (No client joins both, so list/detail subscribers don't double-receive.)
  subscribe((e: BusEvent) => {
    if ('market_id' in e && e.market_id) {
      io.to(`market:${e.market_id}`).emit(e.type, e);
    }
    io.to(ALL_MARKETS).emit(e.type, e);
  });

  return io;
}
