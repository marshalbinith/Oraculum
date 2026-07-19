'use client';

import { Droplets } from 'lucide-react';
import { MarketCard } from '@/components/market/MarketCard';
import { Spinner } from '@/components/ui';
import { useMarkets } from '@/hooks/useData';

/** Liquidity provision hub: open markets you can add liquidity to. Pick one and
 *  use its Liquidity panel to deposit; withdraw your share + fees after it resolves. */
export default function LpPage() {
  const { data, isLoading } = useMarkets({
    status: 'OPEN',
    sort: 'liquidity',
    order: 'desc',
    limit: 50,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Droplets className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Provide Liquidity</h1>
      </div>
      <p className="max-w-2xl text-sm text-muted">
        Add USDC to an open market&apos;s pool to earn a share of its trading fees. Choose a market
        below, then open its <span className="text-white">Liquidity</span> panel to deposit. After
        the market resolves you can withdraw your pro-rata USDC plus accrued fees.
      </p>

      {isLoading ? (
        <Spinner />
      ) : data && data.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((m) => (
            <MarketCard key={m.market_id} market={m} />
          ))}
        </div>
      ) : (
        <p className="py-12 text-center text-muted">
          No open markets to provide liquidity to yet. Create one from the Create tab.
        </p>
      )}
    </div>
  );
}
