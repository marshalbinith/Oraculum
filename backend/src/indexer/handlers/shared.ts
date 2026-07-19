/** Shared helpers for event handlers. */
import { query } from '../../db/client.js';

/** Resolve the internal market UUID from its contract address. */
export async function marketIdByAddress(address: string): Promise<string | null> {
  const r = await query<{ market_id: string }>(
    'SELECT market_id FROM markets WHERE contract_address = $1',
    [address],
  );
  return r.rows[0]?.market_id ?? null;
}

/** Soroban unit-enum values may decode as a string, a 1-element array, or a
 *  tagged object depending on SDK version — normalize to the variant name. */
export function decodeEnumTag(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v.length > 0) return String(v[0]);
  if (v && typeof v === 'object' && 'tag' in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>).tag);
  }
  return String(v);
}

/** Map a contract Comparison variant to the DB enum string. */
export function comparisonToDb(tag: string): string {
  const t = tag.toUpperCase();
  if (t === 'GT' || t === 'GTE' || t === 'LT' || t === 'LTE' || t === 'EQ') return t;
  return 'GT';
}

export const s = (v: unknown): string => String(v);
export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [v]);
