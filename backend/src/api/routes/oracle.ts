/** /api/v1/oracle — available feeds and latest prices. */
import { Router } from 'express';
import { ORACLE_FEEDS } from '../../config/constants.js';
import { query } from '../../db/client.js';
import { asyncHandler, ok } from '../response.js';

export const oracleRouter = Router();

oracleRouter.get(
  '/feeds',
  asyncHandler(async (_req, res) => {
    // Latest price per known feed (if any has been indexed).
    const rows = await query<{ feed_id: string; price: string; timestamp: string }>(
      `SELECT DISTINCT ON (feed_id) feed_id, price, timestamp
       FROM oracle_prices ORDER BY feed_id, timestamp DESC`,
    );
    const latest = new Map(rows.rows.map((r) => [r.feed_id, r]));
    const feeds = ORACLE_FEEDS.map((id) => ({
      feed_id: id,
      latest: latest.get(id) ?? null,
    }));
    ok(res, feeds);
  }),
);

oracleRouter.get(
  '/feeds/:feed_id/price',
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT feed_id, price, confidence, timestamp
       FROM oracle_prices WHERE feed_id = $1 ORDER BY timestamp DESC LIMIT 1`,
      [req.params.feed_id],
    );
    ok(res, rows.rows[0] ?? null);
  }),
);
