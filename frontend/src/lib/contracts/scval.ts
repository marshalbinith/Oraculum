/** Helpers to build Soroban ScVal arguments for contract invocations. */
import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';

export const addr = (a: string): xdr.ScVal => new Address(a).toScVal();
export const i128 = (v: bigint): xdr.ScVal => nativeToScVal(v, { type: 'i128' });
export const u64 = (v: bigint | number): xdr.ScVal =>
  nativeToScVal(typeof v === 'number' ? BigInt(v) : v, { type: 'u64' });
export const sym = (s: string): xdr.ScVal => nativeToScVal(s, { type: 'symbol' });
export const str = (s: string): xdr.ScVal => nativeToScVal(s, { type: 'string' });

/** A contract unit-enum variant serializes as a single-symbol vec. */
export const enumVariant = (variant: string): xdr.ScVal =>
  xdr.ScVal.scvVec([nativeToScVal(variant, { type: 'symbol' })]);

/** Build a struct ScVal as an ScMap (keys must be symbol-sorted). */
export function structVal(fields: Record<string, xdr.ScVal>): xdr.ScVal {
  const entries = Object.keys(fields)
    .sort()
    .map((key) =>
      new xdr.ScMapEntry({
        key: nativeToScVal(key, { type: 'symbol' }),
        val: fields[key]!,
      }),
    );
  return xdr.ScVal.scvMap(entries);
}

export type Comparison = 'Gt' | 'Gte' | 'Lt' | 'Lte' | 'Eq';

/** Build a market `ResolutionCondition` struct. */
export function resolutionCondition(input: {
  feedId: string;
  comparison: Comparison;
  threshold: bigint;
  resolutionTimestamp: bigint;
}): xdr.ScVal {
  return structVal({
    feed_id: sym(input.feedId),
    comparison: enumVariant(input.comparison),
    threshold: i128(input.threshold),
    resolution_timestamp: u64(input.resolutionTimestamp),
  });
}
