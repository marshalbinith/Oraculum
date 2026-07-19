'use client';

import Link from 'next/link';
import { Droplets } from 'lucide-react';
import { Card, Spinner, Stat } from '@/components/ui';
import { MarketStatusBadge } from '@/components/market/MarketStatusBadge';
import { formatUsdc } from '@/lib/format';
import { usePortfolio } from '@/hooks/useData';
import { useWallet } from '@/stores/wallet';

export default function PortfolioPage() {
  const { address } = useWallet();
  const { data, isLoading } = usePortfolio(address);

  if (!address) {
    return <p className="py-16 text-center text-muted">Connect your wallet to view your portfolio.</p>;
  }
  if (isLoading || !data) return <Spinner />;

  const pnl = BigInt(data.total_pnl_usdc);
  const lpPositions = data.markets.filter((m) => BigInt(m.lp_balance) > 0n);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Portfolio</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Total value" value={`$${formatUsdc(data.total_value_usdc)}`} />
        <Stat label="Invested" value={`$${formatUsdc(data.total_invested_usdc)}`} />
        <Stat
          label="PnL"
          value={
            <span className={pnl >= 0n ? 'text-yes' : 'text-no'}>
              {pnl >= 0n ? '+' : '-'}${formatUsdc(pnl < 0n ? -pnl : pnl)}
            </span>
          }
        />
        <Stat label="LP value (est.)" value={`$${formatUsdc(data.total_lp_value_usdc)}`} />
      </div>

      <Card>
        <h2 className="mb-4 font-semibold">Positions</h2>
        {data.markets.length === 0 ? (
          <p className="text-sm text-muted">No positions yet.</p>
        ) : (
          <div className="space-y-2">
            {data.markets.map((m) => (
              <Link
                key={m.market_id}
                href={`/markets/${m.market_id}`}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm hover:border-primary"
              >
                <span className="line-clamp-1 max-w-[40%]">{m.question}</span>
                <MarketStatusBadge status={m.status} />
                <span className="text-yes">{formatUsdc(m.yes_balance, 0)} YES</span>
                <span className="text-no">{formatUsdc(m.no_balance, 0)} NO</span>
                <span>${formatUsdc(m.current_value_usdc)}</span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Droplets className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">LP positions</h2>
        </div>
        {lpPositions.length === 0 ? (
          <p className="text-sm text-muted">
            No liquidity provided. Open a market to add liquidity and earn a share of trading fees.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="hidden px-4 text-xs uppercase tracking-wide text-muted sm:flex sm:justify-between">
              <span className="max-w-[40%] flex-1">Market</span>
              <span className="w-24 text-right">Shares</span>
              <span className="w-20 text-right">Pool %</span>
              <span className="w-24 text-right">Value (est.)</span>
            </div>
            {lpPositions.map((m) => {
              const supply = BigInt(m.total_lp_supply || '0');
              const shares = BigInt(m.lp_balance);
              const ownership = supply > 0n ? Number((shares * 1_000_000n) / supply) / 10000 : 0;
              return (
                <Link
                  key={m.market_id}
                  href={`/markets/${m.market_id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-4 py-3 text-sm hover:border-primary"
                >
                  <div className="flex max-w-[40%] flex-1 items-center gap-2">
                    <span className="line-clamp-1">{m.question}</span>
                    <MarketStatusBadge status={m.status} />
                  </div>
                  <span className="w-24 text-right">{formatUsdc(m.lp_balance, 2)}</span>
                  <span className="w-20 text-right text-muted">{ownership.toFixed(2)}%</span>
                  <span className="w-24 text-right">${formatUsdc(m.lp_value_usdc)}</span>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
