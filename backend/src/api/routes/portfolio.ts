/** /api/v1/portfolio — a user's positions and history across markets. */
import { Router } from 'express';
import { query } from '../../db/client.js';
import { readView, scAddress } from '../../indexer/soroban.js';
import { asyncHandler, ok } from '../response.js';

export const portfolioRouter = Router();

interface UserPositionView {
  yes_balance: bigint;
  no_balance: bigint;
  lp_balance: bigint;
  claimed: boolean;
}

const s = (v: bigint | number): string => String(v);

portfolioRouter.get(
  '/:address',
  asyncHandler(async (req, res) => {
    const address = req.params.address ?? "";

    // Markets where the user has any activity, with invested/received from flows.
    const involved = await query<{
      market_id: string;
      contract_address: string;
      question: string;
      status: string;
      yes_price: string | null;
      total_lp_supply: string | null;
      usdc_reserve: string | null;
      fee_pool: string | null;
      invested: string;
      received: string;
    }>(
      `WITH activity AS (
         SELECT market_id FROM trades WHERE trader_address = $1
         UNION SELECT market_id FROM liquidity_events WHERE provider_address = $1
         UNION SELECT market_id FROM reward_claims WHERE claimer_address = $1
       )
       SELECT m.market_id, m.contract_address, m.question, m.status, a.yes_price,
         a.total_lp_supply, a.usdc_reserve, a.fee_pool,
         COALESCE((SELECT SUM(usdc_amount) FROM trades t
                   WHERE t.market_id=m.market_id AND t.trader_address=$1
                     AND t.direction LIKE 'BUY%'),0)::text AS invested,
         COALESCE((SELECT SUM(usdc_received) FROM reward_claims rc
                   WHERE rc.market_id=m.market_id AND rc.claimer_address=$1),0)::text AS received
       FROM markets m
       JOIN activity ac ON ac.market_id = m.market_id
       LEFT JOIN market_amm_state a ON a.market_id = m.market_id`,
      [address],
    );

    let totalValue = 0n;
    let totalInvested = 0n;
    let totalLpValue = 0n;
    const markets = await Promise.all(
      involved.rows.map(async (m) => {
        let pos: UserPositionView = {
          yes_balance: 0n,
          no_balance: 0n,
          lp_balance: 0n,
          claimed: false,
        };
        try {
          pos = await readView<UserPositionView>(m.contract_address, 'get_user_position', [
            scAddress(address),
          ]);
        } catch {
          /* RPC best-effort */
        }
        // Mark-to-market value of outcome tokens at current YES price.
        const yesPrice = BigInt(m.yes_price ?? '0');
        const noPrice = 10_000_000n - yesPrice;
        const value =
          (pos.yes_balance * yesPrice) / 10_000_000n +
          (pos.no_balance * noPrice) / 10_000_000n;
        // Estimated LP redemption value: pro-rata share of the pool's USDC plus
        // accrued fees. Indicative — the exact payout is computed on withdraw.
        const lpSupply = BigInt(m.total_lp_supply ?? '0');
        const poolUsdc = BigInt(m.usdc_reserve ?? '0') + BigInt(m.fee_pool ?? '0');
        const lpValue = lpSupply > 0n ? (pos.lp_balance * poolUsdc) / lpSupply : 0n;
        const invested = BigInt(m.invested);
        totalValue += value;
        totalInvested += invested;
        totalLpValue += lpValue;
        return {
          market_id: m.market_id,
          contract_address: m.contract_address,
          question: m.question,
          status: m.status,
          yes_balance: s(pos.yes_balance),
          no_balance: s(pos.no_balance),
          lp_balance: s(pos.lp_balance),
          claimed: pos.claimed,
          invested_usdc: m.invested,
          received_usdc: m.received,
          current_value_usdc: s(value),
          total_lp_supply: s(lpSupply),
          lp_value_usdc: s(lpValue),
        };
      }),
    );

    ok(res, {
      address,
      markets,
      total_value_usdc: s(totalValue),
      total_invested_usdc: s(totalInvested),
      total_pnl_usdc: s(totalValue - totalInvested),
      total_lp_value_usdc: s(totalLpValue),
    });
  }),
);

portfolioRouter.get(
  '/:address/history',
  asyncHandler(async (req, res) => {
    const address = req.params.address ?? "";
    const [trades, claims, liquidity] = await Promise.all([
      query(
        `SELECT t.*, m.question FROM trades t JOIN markets m ON m.market_id=t.market_id
         WHERE t.trader_address=$1 ORDER BY t.timestamp DESC LIMIT 200`,
        [address],
      ),
      query(
        `SELECT rc.*, m.question FROM reward_claims rc JOIN markets m ON m.market_id=rc.market_id
         WHERE rc.claimer_address=$1 ORDER BY rc.timestamp DESC LIMIT 200`,
        [address],
      ),
      query(
        `SELECT le.*, m.question FROM liquidity_events le JOIN markets m ON m.market_id=le.market_id
         WHERE le.provider_address=$1 ORDER BY le.timestamp DESC LIMIT 200`,
        [address],
      ),
    ]);
    ok(res, { trades: trades.rows, claims: claims.rows, liquidity: liquidity.rows });
  }),
);
