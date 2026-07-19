/** Handle `market / resolved` and `market / locked` status transitions. */
import { query } from '../../db/client.js';
import { publish } from '../../events/bus.js';
import type { DecodedEvent } from '../soroban.js';
import { asArray, decodeEnumTag, marketIdByAddress } from './shared.js';

export async function handleMarketLocked(e: DecodedEvent): Promise<void> {
  const marketId = await marketIdByAddress(e.contractId);
  if (!marketId) return;
  await query(`UPDATE markets SET status='LOCKED' WHERE market_id=$1`, [marketId]);
  await publish({ type: 'market_status', market_id: marketId, status: 'LOCKED' });
}

export async function handleMarketResolved(e: DecodedEvent): Promise<void> {
  // data tuple: [outcome(Symbol), oracle_price, reward_per_token]
  const [outcome] = asArray(e.data) as [string, bigint, bigint];
  const tag = decodeEnumTag(outcome).toUpperCase();
  const { status, winning } =
    tag === 'YES'
      ? { status: 'RESOLVED_YES', winning: 'YES' }
      : tag === 'NO'
        ? { status: 'RESOLVED_NO', winning: 'NO' }
        : { status: 'INVALID', winning: 'INVALID' };

  const marketId = await marketIdByAddress(e.contractId);
  if (!marketId) return;
  await query(
    `UPDATE markets SET status=$1, winning_outcome=$2, resolved_at=$3 WHERE market_id=$4`,
    [status, winning, e.timestamp, marketId],
  );
  await publish({ type: 'market_resolved', market_id: marketId, outcome: winning });
}
