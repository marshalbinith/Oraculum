'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { MarketCard } from '@/components/market/MarketCard';
import { Input, Spinner } from '@/components/ui';
import { useMarkets } from '@/hooks/useData';
import { useMarketsLive } from '@/hooks/useMarketsLive';
import { useWatchlist } from '@/stores/watchlist';
import type { MarketStatus } from '@/lib/types';

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'XLM_USD_PRICE', label: 'XLM' },
  { value: 'BTC_USD_PRICE', label: 'BTC' },
  { value: 'ETH_USD_PRICE', label: 'ETH' },
];

const STATUSES: Array<{ value: '' | MarketStatus; label: string }> = [
  { value: '', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'LOCKED', label: 'Locked' },
  { value: 'RESOLVED_YES', label: 'Resolved' },
];

const SORTS = [
  { value: 'volume', label: 'Volume' },
  { value: 'liquidity', label: 'Liquidity' },
  { value: 'expiry', label: 'Expiry' },
  { value: 'new', label: 'Newest' },
] as const;

export default function MarketsPage() {
  const [status, setStatus] = useState<'' | MarketStatus>('');
  const [feed, setFeed] = useState('');
  const [sort, setSort] = useState<(typeof SORTS)[number]['value']>('volume');
  const [search, setSearch] = useState('');
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const watchedIds = useWatchlist((s) => s.ids);
  useMarketsLive();

  const { data, isLoading } = useMarkets({
    status: status || undefined,
    feed_id: feed || undefined,
    sort,
    order: 'desc',
    search: search || undefined,
    limit: watchlistOnly ? 200 : 50,
  });

  const shown = watchlistOnly
    ? (data ?? []).filter((m) => watchedIds.includes(m.market_id))
    : (data ?? []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Markets</h1>

      {/* Category chips (by oracle feed) + watchlist toggle */}
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => setFeed(c.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              feed === c.value ? 'bg-primary text-white' : 'bg-surface-2 text-muted hover:text-white'
            }`}
          >
            {c.label}
          </button>
        ))}
        <button
          onClick={() => setWatchlistOnly((v) => !v)}
          className={`ml-auto flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            watchlistOnly ? 'bg-amber-400/20 text-amber-400' : 'bg-surface-2 text-muted hover:text-white'
          }`}
        >
          <Star className={`h-4 w-4 ${watchlistOnly ? 'fill-amber-400' : ''}`} />
          Watchlist{watchedIds.length ? ` (${watchedIds.length})` : ''}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                status === s.value ? 'bg-surface-2 text-white' : 'text-muted hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="input w-auto"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              Sort: {s.label}
            </option>
          ))}
        </select>
        <div className="ml-auto w-full max-w-xs">
          <Input
            placeholder="Search questions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : shown.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((m) => (
            <MarketCard key={m.market_id} market={m} />
          ))}
        </div>
      ) : (
        <p className="py-12 text-center text-muted">
          {watchlistOnly ? 'No watched markets yet — tap the ☆ on any market.' : 'No markets match your filters.'}
        </p>
      )}
    </div>
  );
}
