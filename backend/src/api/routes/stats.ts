/** /api/v1/stats — protocol-level aggregates (TVL, volume, counts). */
import { Router } from 'express';
import { query } from '../../db/client.js';
import { asyncHandler, ok } from '../response.js';

export const statsRouter = Router();

statsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [markets, tvl, volume, traders] = await Promise.all([
      query<{ total: string; open: string }>(
        `SELECT COUNT(*)::text AS total,
                COUNT(*) FILTER (WHERE status='OPEN')::text AS open
         FROM markets`,
      ),
      query<{ tvl: string }>(
        `SELECT COALESCE(SUM(usdc_reserve),0)::text AS tvl FROM market_amm_state`,
      ),
      query<{ volume: string }>(
        `SELECT COALESCE(SUM(total_volume),0)::text AS volume FROM market_amm_state`,
      ),
      query<{ count: string }>(
        `SELECT COUNT(DISTINCT trader_address)::text AS count FROM trades`,
      ),
    ]);

    ok(res, {
      total_markets: Number(markets.rows[0]?.total ?? 0),
      open_markets: Number(markets.rows[0]?.open ?? 0),
      tvl: tvl.rows[0]?.tvl ?? '0',
      total_volume: volume.rows[0]?.volume ?? '0',
      total_traders: Number(traders.rows[0]?.count ?? 0),
    });
  }),
);
