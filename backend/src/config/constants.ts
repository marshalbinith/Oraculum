/**
 * Protocol-wide constants shared across indexer and API.
 * Kept in sync with the on-chain contract configuration.
 */

/** All prices and USDC amounts are scaled by 10^7 (Stellar stroop precision). */
export const PRICE_SCALE = 10_000_000n;

/** Basis-point denominator (100% = 10_000 bps). */
export const BPS_DENOMINATOR = 10_000n;

/** Registered oracle feed identifiers (must match Oracle Registry). */
export const ORACLE_FEEDS = ['XLM_USD_PRICE', 'BTC_USD_PRICE', 'ETH_USD_PRICE'] as const;
export type OracleFeedId = (typeof ORACLE_FEEDS)[number];

/** Market status values mirrored from the Market contract enum. */
export const MARKET_STATUSES = [
  'PENDING',
  'OPEN',
  'LOCKED',
  'RESOLVED_YES',
  'RESOLVED_NO',
  'INVALID',
] as const;
export type MarketStatus = (typeof MARKET_STATUSES)[number];

/** Soroban event topic prefixes emitted by the contracts. */
export const EVENT_TOPICS = {
  FACTORY_MARKET_CREATED: 'market_created',
  MARKET_TRADE: 'trade',
  MARKET_LIQUIDITY_ADDED: 'liquidity_added',
  MARKET_LIQUIDITY_WITHDRAWN: 'liquidity_withdrawn',
  MARKET_LOCKED: 'market_locked',
  MARKET_RESOLVED: 'market_resolved',
  MARKET_REWARD_CLAIMED: 'reward_claimed',
  ORACLE_PRICE_SUBMITTED: 'price_submitted',
} as const;
