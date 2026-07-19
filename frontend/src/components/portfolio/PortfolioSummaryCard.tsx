'use client';

import Link from 'next/link';
import { ArrowUpRight, Wallet } from 'lucide-react';
import { Card } from '@/components/ui';
import { FlashValue } from '@/components/ui/FlashValue';
import { formatUsdc, truncateAddress } from '@/lib/format';
import { usePortfolio } from '@/hooks/useData';
import { usePortfolioLive } from '@/hooks/usePortfolioLive';
import { useWallet } from '@/stores/wallet';

/** Compact portfolio snapshot for the dashboard right rail. Shows a connect
 *  prompt when no wallet is connected, otherwise the wallet's headline numbers. */
export function PortfolioSummaryCard() {
  const { address } = useWallet();
  const { data, isLoading } = usePortfolio(address);
  usePortfolioLive(address);

  const pnl = data ? BigInt(data.total_pnl_usdc) : 0n;

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-muted">
          <Wallet className="h-4 w-4" /> Your portfolio
        </h3>
        {address && (
          <Link href="/portfolio" className="flex items-center gap-1 text-xs text-primary">
            Open <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {!address ? (
        <p className="text-sm text-muted">
          Connect your wallet to see your positions, PnL, and LP value.
        </p>
      ) : isLoading || !data ? (
        <p className="py-2 text-sm text-muted">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Metric
              label="Total value"
              value={`$${formatUsdc(data.total_value_usdc)}`}
              flashKey={data.total_value_usdc}
            />
            <Metric
              label="PnL"
              value={`${pnl >= 0n ? '+' : '-'}$${formatUsdc(pnl < 0n ? -pnl : pnl)}`}
              tone={pnl >= 0n ? 'pos' : 'neg'}
              flashKey={data.total_pnl_usdc}
            />
            <Metric
              label="LP value"
              value={`$${formatUsdc(data.total_lp_value_usdc)}`}
              flashKey={data.total_lp_value_usdc}
            />
            <Metric label="Positions" value={String(data.markets.length)} flashKey={data.markets.length} />
          </div>
          <p className="mt-3 truncate text-xs text-muted" title={address}>
            {truncateAddress(address)}
          </p>
        </>
      )}
    </Card>
  );
}

function Metric({
  label,
  value,
  tone,
  flashKey,
}: {
  label: string;
  value: string;
  tone?: 'pos' | 'neg';
  flashKey?: string | number;
}) {
  const color = tone === 'pos' ? 'text-yes' : tone === 'neg' ? 'text-no' : '';
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-0.5 font-semibold tabular-nums ${color}`}>
        {flashKey !== undefined ? <FlashValue value={flashKey}>{value}</FlashValue> : value}
      </div>
    </div>
  );
}
