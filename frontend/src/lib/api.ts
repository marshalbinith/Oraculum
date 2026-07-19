/** Backend REST client. */
import { env } from './env';
import type {
  ActivityEvent,
  ApiResponse,
  Comment,
  Market,
  OracleFeed,
  Portfolio,
  PricePoint,
  ProtocolStats,
  Trade,
} from './types';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${env.apiBaseUrl}/api/v1${path}`, {
    headers: { accept: 'application/json' },
  });
  const body = (await res.json()) as ApiResponse<T>;
  if (!body.success) throw new Error(body.error.message);
  return body.data;
}

async function post<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(`${env.apiBaseUrl}/api/v1${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as ApiResponse<T>;
  if (!body.success) throw new Error(body.error.message);
  return body.data;
}

export interface MarketListParams {
  status?: string;
  sort?: 'volume' | 'liquidity' | 'expiry' | 'new';
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  search?: string;
  feed_id?: string;
}

export const api = {
  markets: (params: MarketListParams = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') q.set(k, String(v));
    });
    return get<Market[]>(`/markets?${q.toString()}`);
  },
  market: (id: string) => get<Market>(`/markets/${id}`),
  marketTrades: (id: string) => get<Trade[]>(`/markets/${id}/trades`),
  priceHistory: (id: string) => get<PricePoint[]>(`/markets/${id}/price-history`),
  stats: () => get<ProtocolStats>('/stats'),
  oracleFeeds: () => get<OracleFeed[]>('/oracle/feeds'),
  portfolio: (address: string) => get<Portfolio>(`/portfolio/${address}`),
  marketActivity: (id: string) => get<ActivityEvent[]>(`/markets/${id}/activity`),
  marketComments: (id: string) => get<Comment[]>(`/markets/${id}/comments`),
  postComment: (
    id: string,
    author: string,
    body: string,
    timestamp: number,
    signature: string,
  ) => post<Comment>(`/markets/${id}/comments`, { author, body, timestamp, signature }),
};
