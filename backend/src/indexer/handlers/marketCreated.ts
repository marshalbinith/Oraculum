/** Handle `factory / created` → insert the market row + initial AMM snapshot. */
import { query } from '../../db/client.js';
import { publish } from '../../events/bus.js';
import type { DecodedEvent } from '../soroban.js';
import { readView } from '../soroban.js';
import { refreshAmmState } from '../ammRefresh.js';
import { asArray, comparisonToDb, decodeEnumTag, s } from './shared.js';

interface MarketInfoView {
  condition: {
    feed_id: string;
    comparison: unknown;
    threshold: bigint;
    resolution_timestamp: bigint;
  };
  created_at: bigint;
}

export async function handleMarketCreated(e: DecodedEvent): Promise<void> {
  // data tuple: [index, market_addr, creator, question, expiry_timestamp]
  const [index, marketAddr, creator, question, expiry] = asArray(e.data) as [
    bigint,
    string,
    string,
    string,
    bigint,
  ];

  let feedId = '';
  let comparison = 'GT';
  let threshold = '0';
  let resolutionTs = String(expiry);
  let createdAt = String(e.timestamp);
  try {
    const info = await readView<MarketInfoView>(marketAddr, 'get_market_info');
    feedId = info.condition.feed_id;
    comparison = comparisonToDb(decodeEnumTag(info.condition.comparison));
    threshold = s(info.condition.threshold);
    resolutionTs = s(info.condition.resolution_timestamp);
    createdAt = s(info.created_at);
  } catch {
    /* fall back to event-derived values */
  }

  await query(
    `INSERT INTO markets
      (market_index, contract_address, creator_address, question, description,
       expiry_timestamp, oracle_feed_id, comparison, threshold, resolution_timestamp,
       status, created_at, ledger_sequence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'OPEN',$11,$12)
     ON CONFLICT (contract_address) DO NOTHING`,
    [
      s(index),
      marketAddr,
      creator,
      question,
      '',
      s(expiry),
      feedId,
      comparison,
      threshold,
      resolutionTs,
      createdAt,
      e.ledger,
    ],
  );

  const r = await query<{ market_id: string }>(
    'SELECT market_id FROM markets WHERE contract_address = $1',
    [marketAddr],
  );
  const marketId = r.rows[0]?.market_id;
  if (marketId) {
    await refreshAmmState(marketId, marketAddr, e.ledger, e.timestamp);
    await publish({ type: 'market_created', market_id: marketId });
  }
}
