/**
 * Refresh a market's AMM snapshot by reading `get_amm_state` from chain and
 * upserting the cached row + a price point. Publishes a price_update.
 */
import { query } from '../db/client.js';
import { publish } from '../events/bus.js';
import { readView } from './soroban.js';

interface AmmStateView {
  yes_reserve: bigint;
  no_reserve: bigint;
  usdc_reserve: bigint;
  total_lp_supply: bigint;
  fee_pool: bigint;
  yes_price: bigint;
  no_price: bigint;
  total_volume: bigint;
  total_trades: bigint;
}

const s = (v: bigint | number): string => String(v);

export async function refreshAmmState(
  marketId: string,
  contractAddress: string,
  ledger: number,
  timestamp: number,
): Promise<void> {
  let amm: AmmStateView;
  try {
    amm = await readView<AmmStateView>(contractAddress, 'get_amm_state');
  } catch {
    return; // contract not ready / transient RPC error — skip this refresh
  }

  await query(
    `INSERT INTO market_amm_state
      (market_id, yes_reserve, no_reserve, usdc_reserve, total_lp_supply,
       fee_pool, yes_price, no_price, total_volume, total_trades, updated_at, ledger_sequence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (market_id) DO UPDATE SET
       yes_reserve=$2, no_reserve=$3, usdc_reserve=$4, total_lp_supply=$5,
       fee_pool=$6, yes_price=$7, no_price=$8, total_volume=$9, total_trades=$10,
       updated_at=$11, ledger_sequence=$12`,
    [
      marketId,
      s(amm.yes_reserve),
      s(amm.no_reserve),
      s(amm.usdc_reserve),
      s(amm.total_lp_supply),
      s(amm.fee_pool),
      s(amm.yes_price),
      s(amm.no_price),
      s(amm.total_volume),
      s(amm.total_trades),
      timestamp,
      ledger,
    ],
  );

  await query(
    `INSERT INTO price_points (market_id, yes_price, volume, timestamp)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (market_id, timestamp) DO NOTHING`,
    [marketId, s(amm.yes_price), s(amm.total_volume), timestamp],
  );

  await publish({
    type: 'price_update',
    market_id: marketId,
    yes_price: Number(amm.yes_price),
    no_price: Number(amm.no_price),
    timestamp,
  });
}
