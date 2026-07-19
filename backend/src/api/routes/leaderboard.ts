/** /api/v1/leaderboard — top traders, LPs, and market creators. */
import { Router } from 'express';
import { query } from '../../db/client.js';
import { asyncHandler, ok } from '../response.js';

export const leaderboardRouter = Router();

leaderboardRouter.get(
  '/traders',
  asyncHandler(async (_req, res) => {
    // Realized PnL proxy: USDC received from claims minus USDC net spent on buys
    // plus USDC received from sells. Computed from indexed flows.
    const rows = await query(
      `WITH flows AS (
         SELECT trader_address AS addr,
                SUM(CASE WHEN direction LIKE 'BUY%' THEN -usdc_amount ELSE usdc_amount END) AS trade_net,
                COUNT(*) AS trades
         FROM trades GROUP BY trader_address
       ), claims AS (
         SELECT claimer_address AS addr, SUM(usdc_received) AS claimed
         FROM reward_claims GROUP BY claimer_address
       )
       SELECT f.addr AS address,
              (f.trade_net + COALESCE(c.claimed,0))::text AS pnl,
              f.trades::text AS trade_count
       FROM flows f LEFT JOIN claims c ON c.addr = f.addr
       ORDER BY (f.trade_net + COALESCE(c.claimed,0)) DESC
       LIMIT 50`,
    );
    ok(res, rows.rows);
  }),
);

leaderboardRouter.get(
  '/lps',
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `SELECT provider_address AS address,
              COALESCE(SUM(fees_amount),0)::text AS fees_earned,
              COUNT(*) FILTER (WHERE event_type='ADD')::text AS positions
       FROM liquidity_events
       GROUP BY provider_address
       ORDER BY SUM(fees_amount) DESC NULLS LAST
       LIMIT 50`,
    );
    ok(res, rows.rows);
  }),
);

leaderboardRouter.get(
  '/creators',
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `SELECT m.creator_address AS address,
              COUNT(*)::text AS markets_created,
              COALESCE(SUM(a.total_volume),0)::text AS volume_generated
       FROM markets m LEFT JOIN market_amm_state a ON a.market_id = m.market_id
       GROUP BY m.creator_address
       ORDER BY SUM(a.total_volume) DESC NULLS LAST
       LIMIT 50`,
    );
    ok(res, rows.rows);
  }),
);
