'use client';

import { ArrowDownLeft, ArrowUpRight, Droplets, Trophy } from 'lucide-react';
import { formatUsdc, truncateAddress } from '@/lib/format';
import { useMarketActivity } from '@/hooks/useData';
import type { ActivityEvent } from '@/lib/types';

const META: Record<string, { label: string; cls: string }> = {
  BUY_YES: { label: 'Bought YES', cls: 'text-yes' },
  BUY_NO: { label: 'Bought NO', cls: 'text-no' },
  SELL_YES: { label: 'Sold YES', cls: 'text-yes' },
  SELL_NO: { label: 'Sold NO', cls: 'text-no' },
  ADD: { label: 'Added liquidity', cls: 'text-primary' },
  REMOVE: { label: 'Removed liquidity', cls: 'text-muted' },
  CLAIM: { label: 'Claimed reward', cls: 'text-primary' },
};

function EventIcon({ e }: { e: ActivityEvent }) {
  if (e.type === 'LIQUIDITY') return <Droplets className="h-4 w-4 shrink-0 text-primary" />;
  if (e.type === 'CLAIM') return <Trophy className="h-4 w-4 shrink-0 text-primary" />;
  return e.action.includes('YES') ? (
    <ArrowUpRight className="h-4 w-4 shrink-0 text-yes" />
  ) : (
    <ArrowDownLeft className="h-4 w-4 shrink-0 text-no" />
  );
}

/** Unified market timeline: trades, liquidity events and reward claims. */
export function ActivityFeed({ marketId }: { marketId: string }) {
  const { data, isLoading } = useMarketActivity(marketId);
  if (isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (!data || data.length === 0) return <p className="text-sm text-muted">No activity yet.</p>;

  return (
    <div className="space-y-2">
      {data.map((e) => {
        const m = META[e.action] ?? { label: e.action, cls: 'text-muted' };
        return (
          <div
            key={`${e.tx}-${e.action}-${e.timestamp}`}
            className="flex items-center gap-3 border-b border-border pb-2 text-sm last:border-0"
          >
            <EventIcon e={e} />
            <span className={`font-medium ${m.cls}`}>{m.label}</span>
            <span className="text-muted">${formatUsdc(e.usdc)}</span>
            <span className="ml-auto text-xs text-muted" title={e.actor}>
              {truncateAddress(e.actor)}
            </span>
            <span className="w-20 text-right text-xs text-muted">
              {new Date(Number(e.timestamp) * 1000).toLocaleDateString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}
