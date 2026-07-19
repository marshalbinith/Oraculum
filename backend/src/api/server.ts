/** StellarPredict REST API + WebSocket server entrypoint. */
import http from 'node:http';
import express from 'express';
import { getEnv } from '../config/env.js';
import { closePool } from '../db/client.js';
import { closeRedis } from '../cache/redis.js';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { marketsRouter } from './routes/markets.js';
import { portfolioRouter } from './routes/portfolio.js';
import { oracleRouter } from './routes/oracle.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { statsRouter } from './routes/stats.js';
import { attachWebSocket } from '../ws/server.js';

export function createApp(): express.Express {
  const app = express();
  app.use(corsMiddleware);
  app.use(express.json());
  app.use(rateLimiter);

  app.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));

  const v1 = express.Router();
  v1.use('/markets', marketsRouter);
  v1.use('/portfolio', portfolioRouter);
  v1.use('/oracle', oracleRouter);
  v1.use('/leaderboard', leaderboardRouter);
  v1.use('/stats', statsRouter);
  app.use('/api/v1', v1);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

const env = getEnv();
const app = createApp();
const server = http.createServer(app);
attachWebSocket(server);

server.listen(env.PORT, () => {
  process.stdout.write(`▶ API + WS listening on :${env.PORT}\n`);
});

async function shutdown(): Promise<void> {
  server.close();
  await closePool();
  await closeRedis();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
