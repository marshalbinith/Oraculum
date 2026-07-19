/** Handle `market / liq_add` and `market / liq_out` liquidity events. */
import { query } from '../../db/client.js';
import type { DecodedEvent } from '../soroban.js';
import { refreshAmmState } from '../ammRefresh.js';
import { asArray, marketIdByAddress, s } from './shared.js';

export async function handleLiquidityAdded(e: DecodedEvent): Promise<void> {
  // data tuple: [provider, usdc_amount, lp_tokens_minted]
  const [provider, usdc, lp] = asArray(e.data) as [string, bigint, bigint];
  const marketId = await marketIdByAddress(e.contractId);
  if (!marketId) return;
  await query(
    `INSERT INTO liquidity_events
      (market_id, provider_address, event_type, usdc_amount, lp_tokens, fees_amount,
       transaction_hash, timestamp)
     VALUES ($1,$2,'ADD',$3,$4,0,$5,$6)
     ON CONFLICT (transaction_hash, event_type) DO NOTHING`,
    [marketId, provider, s(usdc), s(lp), e.txHash, e.timestamp],
  );
  await refreshAmmState(marketId, e.contractId, e.ledger, e.timestamp);
}

export async function handleLiquidityWithdrawn(e: DecodedEvent): Promise<void> {
  // data tuple: [provider, lp_tokens_burned, usdc_received, fees_received]
  const [provider, lp, usdc, fees] = asArray(e.data) as [string, bigint, bigint, bigint];
  const marketId = await marketIdByAddress(e.contractId);
  if (!marketId) return;
  await query(
    `INSERT INTO liquidity_events
      (market_id, provider_address, event_type, usdc_amount, lp_tokens, fees_amount,
       transaction_hash, timestamp)
     VALUES ($1,$2,'REMOVE',$3,$4,$5,$6,$7)
     ON CONFLICT (transaction_hash, event_type) DO NOTHING`,
    [marketId, provider, s(usdc), s(lp), s(fees), e.txHash, e.timestamp],
  );
  await refreshAmmState(marketId, e.contractId, e.ledger, e.timestamp);
}
