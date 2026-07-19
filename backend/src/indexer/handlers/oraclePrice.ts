/** Handle `oracle / price` → record a submitted oracle price. */
import { query } from '../../db/client.js';
import type { DecodedEvent } from '../soroban.js';
import { asArray, s } from './shared.js';

export async function handleOraclePrice(e: DecodedEvent): Promise<void> {
  // data tuple: [feed_id, price, timestamp]
  const [feedId, price, timestamp] = asArray(e.data) as [string, bigint, bigint];
  await query(
    `INSERT INTO oracle_prices
      (feed_id, price, confidence, transaction_hash, timestamp, ledger_sequence)
     VALUES ($1,$2,NULL,$3,$4,$5)`,
    [String(feedId), s(price), e.txHash, s(timestamp), e.ledger],
  );
}
