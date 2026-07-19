/** API response domain types (bigints arrive as strings). */

export type MarketStatus =
  | 'PENDING'
  | 'OPEN'
  | 'LOCKED'
  | 'RESOLVED_YES'
  | 'RESOLVED_NO'
  | 'INVALID';

export interface Market {
  market_id: string;
  market_index: string | null;
  contract_address: string;
  creator_address: string;
  question: string;
  description: string | null;
  expiry_timestamp: string;
  oracle_feed_id: string;
  comparison: string;
  threshold: string;
  resolution_timestamp: string;
  status: MarketStatus;
  winning_outcome: string | null;
  created_at: string;
  resolved_at: string | null;
  // AMM (joined; nullable before first snapshot)
  yes_reserve: string | null;
  no_reserve: string | null;
  usdc_reserve: string | null;
  total_lp_supply: string | null;
  fee_pool: string | null;
  yes_price: string | null;
  no_price: string | null;
  total_volume: string | null;
  total_trades: string | null;
}

export interface Trade {
  trade_id: string;
  market_id: string;
  trader_address: string;
  direction: string;
  usdc_amount: string;
  token_amount: string;
  fee_paid: string;
  yes_price_after: string;
  transaction_hash: string;
  timestamp: string;
}

export interface PricePoint {
  yes_price: string;
  volume: string;
  timestamp: string;
}

export interface ProtocolStats {
  total_markets: number;
  open_markets: number;
  tvl: string;
  total_volume: string;
  total_traders: number;
}

export interface OracleFeed {
  feed_id: string;
  latest: { feed_id: string; price: string; timestamp: string } | null;
}

export interface Comment {
  comment_id: string;
  author_address: string;
  body: string;
  created_at: string;
}

export interface ActivityEvent {
  type: 'TRADE' | 'LIQUIDITY' | 'CLAIM';
  actor: string;
  action: string; // BUY_YES | BUY_NO | SELL_YES | SELL_NO | ADD | REMOVE | CLAIM
  usdc: string;
  tx: string;
  timestamp: string;
}

export interface PortfolioMarket {
  market_id: string;
  contract_address: string;
  question: string;
  status: MarketStatus;
  yes_balance: string;
  no_balance: string;
  lp_balance: string;
  claimed: boolean;
  invested_usdc: string;
  received_usdc: string;
  current_value_usdc: string;
  total_lp_supply: string;
  lp_value_usdc: string;
}

export interface Portfolio {
  address: string;
  markets: PortfolioMarket[];
  total_value_usdc: string;
  total_invested_usdc: string;
  total_pnl_usdc: string;
  total_lp_value_usdc: string;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  pagination?: { page: number; limit: number; total: number; total_pages: number };
}
export interface ApiFailure {
  success: false;
  error: { code: string; message: string; details?: unknown };
}
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
