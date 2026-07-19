'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Droplets, PlusCircle, Star, TrendingUp } from 'lucide-react';
import { MarketCard } from '@/components/market/MarketCard';
import { PortfolioSummaryCard } from '@/components/portfolio/PortfolioSummaryCard';
import { Card, LinkButton, Spinner, Stat } from '@/components/ui';
import { formatUsdc } from '@/lib/format';
import { useMarkets, useOracleFeeds, useStats } from '@/hooks/useData';
import { useMarketsLive } from '@/hooks/useMarketsLive';
import { useWatchlist } from '@/stores/watchlist';

export default function HomePage() {
  const stats = useStats();
  const top = useMarkets({ sort: 'volume', order: 'desc', limit: 4, status: 'OPEN' });
  const recent = useMarkets({ sort: 'new', order: 'desc', limit: 100 });
  const feeds = useOracleFeeds();
  useMarketsLive();

  // Watchlist is localStorage-backed; guard against SSR hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const watchedIds = useWatchlist((s) => s.ids);
  const watchlist = (recent.data ?? []).filter((m) => watchedIds.includes(m.market_id));

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted">Live overview of StellarPredict markets on Stellar testnet.</p>
        </div>
        <LinkButton href="/markets/create">+ Create Market</LinkButton>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Markets" value={stats.data?.total_markets ?? '—'} />
        <Stat label="Open" value={stats.data?.open_markets ?? '—'} />
        <Stat label="TVL" value={`$${formatUsdc(stats.data?.tvl ?? '0', 0)}`} />
        <Stat label="24h Volume" value={`$${formatUsdc(stats.data?.total_volume ?? '0', 0)}`} />
        <Stat label="Traders" value={stats.data?.total_traders ?? '—'} />
      </div>

      {/* Body: markets (main) + right rail */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          {mounted && watchlist.length > 0 && (
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Star className="h-5 w-5 fill-amber-400 text-amber-400" /> Your watchlist
                </h2>
                <Link
                  href="/markets"
                  className="flex items-center gap-1 text-sm text-primary"
                >
                  Manage <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {watchlist.map((m) => (
                  <MarketCard key={m.market_id} market={m} />
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <TrendingUp className="h-5 w-5 text-primary" /> Top Markets
              </h2>
              <Link href="/markets" className="flex items-center gap-1 text-sm text-primary">
                View all <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
            {top.isLoading ? (
              <Spinner />
            ) : top.data && top.data.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {top.data.map((m) => (
                  <MarketCard key={m.market_id} market={m} />
                ))}
              </div>
            ) : (
              <Card className="p-6 text-center text-sm text-muted">
                No open markets yet.{' '}
                <Link href="/markets/create" className="text-primary">
                  Create the first one →
                </Link>
              </Card>
            )}
          </section>

          <section>
            <h2 className="mb-4 text-lg font-semibold">Recently Created</h2>
            {recent.isLoading ? (
              <Spinner />
            ) : recent.data && recent.data.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {recent.data.slice(0, 4).map((m) => (
                  <MarketCard key={m.market_id} market={m} />
                ))}
              </div>
            ) : (
              <Card className="p-6 text-center text-sm text-muted">No markets yet.</Card>
            )}
          </section>
        </div>

        {/* Right rail */}
        <div className="space-y-6">
          {/* On desktop the sidebar already carries this card; show it here only
              on mobile (where the sidebar is hidden) to avoid duplication. */}
          <div className="md:hidden">
            <PortfolioSummaryCard />
          </div>

          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-muted">Oracle Feeds</h3>
            {feeds.isLoading ? (
              <Spinner />
            ) : (
              <div className="space-y-2">
                {feeds.data?.map((f) => (
                  <div key={f.feed_id} className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {f.feed_id.replace('_PRICE', '').replace('_', '/')}
                    </span>
                    <span className="tabular-nums text-muted">
                      {f.latest ? `$${(Number(f.latest.price) / 1e7).toLocaleString('en-US', { maximumFractionDigits: 4 })}` : '—'}
                    </span>
                  </div>
                ))}
                {feeds.data?.length === 0 && <p className="text-sm text-muted">No feeds.</p>}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 text-sm font-semibold text-muted">Get started</h3>
            <div className="space-y-1.5 text-sm">
              <QuickLink href="/markets/create" icon={PlusCircle} label="Create a market" />
              <QuickLink href="/markets" icon={TrendingUp} label="Browse & trade markets" />
              <QuickLink href="/lp" icon={Droplets} label="Provide liquidity" />
            </div>
            <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted">
              Markets settle in real Circle USDC. Fund your wallet from the{' '}
              <a
                href="https://faucet.circle.com"
                target="_blank"
                rel="noreferrer"
                className="text-primary"
              >
                testnet faucet
              </a>{' '}
              and add a USDC trustline before trading.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof PlusCircle;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-white"
    >
      <Icon className="h-4 w-4 text-primary" />
      {label}
    </Link>
  );
}
