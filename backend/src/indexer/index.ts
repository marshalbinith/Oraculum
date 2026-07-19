/**
 * Indexer main loop. Streams Soroban contract events (Factory, Oracle, and all
 * discovered Markets) into PostgreSQL, advancing a persisted ledger checkpoint
 * so it can resume after a restart.
 */
import { getEnv } from '../config/env.js';
import { closePool, query } from '../db/client.js';
import { closeRedis } from '../cache/redis.js';
import { processEvent } from './eventProcessor.js';
import { fetchEvents, latestLedger } from './soroban.js';

const MAX_HISTORY_LEDGERS = 17_000; // RPC event retention window (~24h)
let running = true;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function getCheckpoint(): Promise<number> {
  const r = await query<{ last_ledger_sequence: string }>(
    'SELECT last_ledger_sequence FROM indexer_state WHERE id = 1',
  );
  return Number(r.rows[0]?.last_ledger_sequence ?? 0);
}

async function setCheckpoint(ledger: number): Promise<void> {
  await query(
    'UPDATE indexer_state SET last_ledger_sequence = $1, last_processed_at = NOW() WHERE id = 1',
    [ledger],
  );
}

async function watchedContracts(): Promise<string[]> {
  const env = getEnv();
  const fixed = [env.FACTORY_ADDRESS, env.ORACLE_REGISTRY_ADDRESS].filter(Boolean);
  const markets = await query<{ contract_address: string }>(
    'SELECT contract_address FROM markets',
  );
  return [...fixed, ...markets.rows.map((m) => m.contract_address)];
}

async function resolveStartLedger(): Promise<number> {
  const env = getEnv();
  const checkpoint = await getCheckpoint();
  const tip = await latestLedger();
  const floor = Math.max(1, tip - MAX_HISTORY_LEDGERS);
  let start = checkpoint > 0 ? checkpoint + 1 : env.INDEXER_START_LEDGER || floor;
  if (start < floor) start = floor; // older than retention → fast-forward
  return start;
}

async function pollOnce(start: number): Promise<number> {
  const contracts = await watchedContracts();
  if (contracts.length === 0) {
    const tip = await latestLedger();
    return tip + 1;
  }

  let maxLedger = start - 1;
  let hitLimit = false;
  let tip = start;

  // RPC allows ≤5 contractIds per filter; fan out in chunks.
  for (const group of chunk(contracts, 5)) {
    const { events, latestLedger: ll } = await fetchEvents(start, group);
    tip = Math.max(tip, ll);
    if (events.length >= 200) hitLimit = true;
    // Process in ledger order for deterministic state.
    events.sort((a, b) => a.ledger - b.ledger);
    for (const e of events) {
      try {
        await processEvent(e);
        maxLedger = Math.max(maxLedger, e.ledger);
      } catch (err) {
        process.stderr.write(`event error (${e.topics.join(':')}): ${String(err)}\n`);
      }
    }
  }

  // If we saturated the page, resume from the last fully-seen ledger; otherwise
  // jump to the chain tip.
  return hitLimit && maxLedger >= start ? maxLedger : tip + 1;
}

async function main(): Promise<void> {
  const env = getEnv();
  process.stdout.write(`▶ Indexer starting (network=${env.STELLAR_NETWORK})\n`);
  let start = await resolveStartLedger();
  process.stdout.write(`▶ Resuming from ledger ${start}\n`);

  while (running) {
    try {
      const next = await pollOnce(start);
      if (next > start) {
        await setCheckpoint(next - 1);
        start = next;
      }
    } catch (err) {
      process.stderr.write(`poll error: ${String(err)}\n`);
    }
    await new Promise((r) => setTimeout(r, env.INDEXER_POLL_INTERVAL_MS));
  }
}

async function shutdown(): Promise<void> {
  running = false;
  await closePool();
  await closeRedis();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

main().catch((err) => {
  process.stderr.write(`fatal: ${String(err)}\n`);
  process.exit(1);
});
