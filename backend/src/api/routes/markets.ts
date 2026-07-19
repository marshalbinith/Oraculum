/** /api/v1/markets — listing, detail, trades, AMM state, price history. */
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/client.js';
import { ApiError, asyncHandler, ok, paginate } from '../response.js';
import { commentMessage, verifySep53 } from '../sep53.js';

export const marketsRouter = Router();

const SORT_COLUMNS: Record<string, string> = {
  volume: 'a.total_volume',
  liquidity: 'a.usdc_reserve',
  expiry: 'm.expiry_timestamp',
  new: 'm.created_at',
};

const MARKET_SELECT = `
  SELECT m.market_id, m.market_index, m.contract_address, m.creator_address,
         m.question, m.description, m.expiry_timestamp, m.oracle_feed_id,
         m.comparison, m.threshold, m.resolution_timestamp, m.status,
         m.winning_outcome, m.created_at, m.resolved_at,
         a.yes_reserve, a.no_reserve, a.usdc_reserve, a.total_lp_supply,
         a.fee_pool, a.yes_price, a.no_price, a.total_volume, a.total_trades
  FROM markets m
  LEFT JOIN market_amm_state a ON a.market_id = m.market_id`;

const listQuery = z.object({
  status: z
    .enum(['PENDING', 'OPEN', 'LOCKED', 'RESOLVED_YES', 'RESOLVED_NO', 'INVALID'])
    .optional(),
  sort: z.enum(['volume', 'liquidity', 'expiry', 'new']).default('volume'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).optional(),
  feed_id: z.string().trim().min(1).optional(),
});

marketsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = listQuery.parse(req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.status) {
      params.push(q.status);
      where.push(`m.status = $${params.length}`);
    }
    if (q.search) {
      params.push(`%${q.search}%`);
      where.push(`m.question ILIKE $${params.length}`);
    }
    if (q.feed_id) {
      params.push(q.feed_id);
      where.push(`m.oracle_feed_id = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sortCol = SORT_COLUMNS[q.sort];
    const dir = q.order.toUpperCase();

    const countRes = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM markets m ${whereSql}`,
      params,
    );
    const total = Number(countRes.rows[0]?.count ?? 0);

    params.push(q.limit, q.page * q.limit);
    const rows = await query(
      `${MARKET_SELECT} ${whereSql}
       ORDER BY ${sortCol} ${dir} NULLS LAST
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    ok(res, rows.rows, paginate(q.page, q.limit, total));
  }),
);

async function findMarket(idOrAddress: string) {
  const byAddr = idOrAddress.length === 56 && idOrAddress.startsWith('C');
  const res = await query(
    `${MARKET_SELECT} WHERE ${byAddr ? 'm.contract_address' : 'm.market_id'} = $1`,
    [idOrAddress],
  );
  return res.rows[0];
}

marketsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const market = await findMarket(String(req.params.id));
    if (!market) throw new ApiError('MARKET_NOT_FOUND', 'Market not found', 404);
    ok(res, market);
  }),
);

marketsRouter.get(
  '/:id/amm',
  asyncHandler(async (req, res) => {
    const market = (await findMarket(String(req.params.id))) as { market_id?: string } | undefined;
    if (!market?.market_id) throw new ApiError('MARKET_NOT_FOUND', 'Market not found', 404);
    const amm = await query(`SELECT * FROM market_amm_state WHERE market_id = $1`, [
      market.market_id,
    ]);
    ok(res, amm.rows[0] ?? null);
  }),
);

const tradesQuery = z.object({
  page: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

marketsRouter.get(
  '/:id/trades',
  asyncHandler(async (req, res) => {
    const market = (await findMarket(String(req.params.id))) as { market_id?: string } | undefined;
    if (!market?.market_id) throw new ApiError('MARKET_NOT_FOUND', 'Market not found', 404);
    const q = tradesQuery.parse(req.query);
    const rows = await query(
      `SELECT * FROM trades WHERE market_id = $1
       ORDER BY timestamp DESC LIMIT $2 OFFSET $3`,
      [market.market_id, q.limit, q.page * q.limit],
    );
    ok(res, rows.rows);
  }),
);

marketsRouter.get(
  '/:id/price-history',
  asyncHandler(async (req, res) => {
    const market = (await findMarket(String(req.params.id))) as { market_id?: string } | undefined;
    if (!market?.market_id) throw new ApiError('MARKET_NOT_FOUND', 'Market not found', 404);
    const limit = z.coerce.number().int().min(1).max(1000).default(500).parse(req.query.limit);
    const rows = await query(
      `SELECT yes_price, volume, timestamp FROM price_points
       WHERE market_id = $1 ORDER BY timestamp ASC LIMIT $2`,
      [market.market_id, limit],
    );
    ok(res, rows.rows);
  }),
);

// ── Activity (unified timeline: trades + liquidity + claims) ───────────────
marketsRouter.get(
  '/:id/activity',
  asyncHandler(async (req, res) => {
    const market = (await findMarket(String(req.params.id))) as { market_id?: string } | undefined;
    if (!market?.market_id) throw new ApiError('MARKET_NOT_FOUND', 'Market not found', 404);
    const limit = z.coerce.number().int().min(1).max(200).default(50).parse(req.query.limit);
    const rows = await query(
      `SELECT type, actor, action, usdc::text AS usdc, tx, timestamp FROM (
         SELECT 'TRADE' AS type, trader_address AS actor, direction AS action,
                usdc_amount AS usdc, transaction_hash AS tx, timestamp
           FROM trades WHERE market_id = $1
         UNION ALL
         SELECT 'LIQUIDITY', provider_address, event_type, usdc_amount, transaction_hash, timestamp
           FROM liquidity_events WHERE market_id = $1
         UNION ALL
         SELECT 'CLAIM', claimer_address, 'CLAIM', usdc_received, transaction_hash, timestamp
           FROM reward_claims WHERE market_id = $1
       ) t ORDER BY timestamp DESC LIMIT $2`,
      [market.market_id, limit],
    );
    ok(res, rows.rows);
  }),
);

// ── Comments ──────────────────────────────────────────────────────────────
marketsRouter.get(
  '/:id/comments',
  asyncHandler(async (req, res) => {
    const market = (await findMarket(String(req.params.id))) as { market_id?: string } | undefined;
    if (!market?.market_id) throw new ApiError('MARKET_NOT_FOUND', 'Market not found', 404);
    const rows = await query(
      `SELECT comment_id, author_address, body, created_at FROM comments
       WHERE market_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [market.market_id],
    );
    ok(res, rows.rows);
  }),
);

// Stellar public keys are 56 chars: 'G' + 55 base32 [A-Z2-7]. A comment must be
// signed (SEP-53) by `author` over the canonical message, with a fresh timestamp.
const commentBody = z.object({
  author: z.string().trim().regex(/^G[A-Z2-7]{55}$/, 'invalid Stellar address'),
  body: z.string().trim().min(1).max(500),
  timestamp: z.coerce.number().int().positive(),
  signature: z.string().trim().min(1),
});

const SIGNATURE_WINDOW_SECS = 300; // reject signatures older/newer than 5 min

marketsRouter.post(
  '/:id/comments',
  asyncHandler(async (req, res) => {
    const market = (await findMarket(String(req.params.id))) as { market_id?: string } | undefined;
    if (!market?.market_id) throw new ApiError('MARKET_NOT_FOUND', 'Market not found', 404);
    const b = commentBody.parse(req.body);

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - b.timestamp) > SIGNATURE_WINDOW_SECS) {
      throw new ApiError('STALE_SIGNATURE', 'Signature expired — please retry', 401);
    }
    const message = commentMessage(market.market_id, b.timestamp, b.body);
    if (!verifySep53(b.author, message, b.signature)) {
      throw new ApiError('BAD_SIGNATURE', 'Signature verification failed', 401);
    }

    try {
      const rows = await query(
        `INSERT INTO comments (market_id, author_address, body, signature)
         VALUES ($1, $2, $3, $4)
         RETURNING comment_id, author_address, body, created_at`,
        [market.market_id, b.author, b.body, b.signature],
      );
      ok(res, rows.rows[0]);
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw new ApiError('DUPLICATE', 'This comment was already posted', 409);
      }
      throw e;
    }
  }),
);
