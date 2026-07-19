/** Handle `market / claim` → record a reward claim. */
import { query } from '../../db/client.js';
import type { DecodedEvent } from '../soroban.js';
import { asArray, marketIdByAddress, s } from './shared.js';

export async function handleRewardClaimed(e: DecodedEvent): Promise<void> {
  // data tuple: [claimer, tokens_burned, usdc_received]
  const [claimer, burned, received] = asArray(e.data) as [string, bigint, bigint];
  const marketId = await marketIdByAddress(e.contractId);
  if (!marketId) return;
  await query(
    `INSERT INTO reward_claims
      (market_id, claimer_address, tokens_burned, usdc_received, transaction_hash, timestamp)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (market_id, claimer_address) DO NOTHING`,
    [marketId, claimer, s(burned), s(received), e.txHash, e.timestamp],
  );
}
