/** Handle `market / trade` → insert a trade row and refresh AMM state. */
import { query } from '../../db/client.js';
import { publish } from '../../events/bus.js';
import type { DecodedEvent } from '../soroban.js';
import { refreshAmmState } from '../ammRefresh.js';
import { asArray, marketIdByAddress, s } from './shared.js';

export async function handleTrade(e: DecodedEvent): Promise<void> {
  // data tuple: [trader, direction, usdc_amount, token_amount, fee, yes_price]
  const [trader, direction, usdcAmount, tokenAmount, fee, yesPrice] = asArray(e.data) as [
    string,
    string,
    bigint,
    bigint,
    bigint,
    bigint,
  ];

  const marketId = await marketIdByAddress(e.contractId);
  if (!marketId) return;

  const inserted = await query<{ trade_id: string }>(
    `INSERT INTO trades
      (market_id, trader_address, direction, usdc_amount, token_amount, fee_paid,
       yes_price_after, transaction_hash, ledger_sequence, timestamp)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (transaction_hash) DO NOTHING
     RETURNING trade_id`,
    [
      marketId,
      trader,
      String(direction),
      s(usdcAmount),
      s(tokenAmount),
      s(fee),
      s(yesPrice),
      e.txHash,
      e.ledger,
      e.timestamp,
    ],
  );

  await refreshAmmState(marketId, e.contractId, e.ledger, e.timestamp);
  if (!inserted.rows[0]) return; // already indexed (idempotent replay)
  await publish({
    type: 'trade',
    market_id: marketId,
    trade: {
      trade_id: inserted.rows[0]?.trade_id,
      trader,
      direction: String(direction),
      usdc_amount: s(usdcAmount),
      token_amount: s(tokenAmount),
      yes_price_after: Number(yesPrice),
      timestamp: e.timestamp,
    },
  });
}
