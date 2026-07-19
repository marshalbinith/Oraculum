'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { PriceChart } from '@/components/charts/PriceChart';
import { ExpiryCountdown } from '@/components/market/ExpiryCountdown';
import { MarketIcon } from '@/components/market/MarketIcon';
import { MarketStatusBadge } from '@/components/market/MarketStatusBadge';
import { MarketTabs } from '@/components/market/MarketTabs';
import { PriceBar } from '@/components/market/PriceBar';
import { WatchButton } from '@/components/market/WatchButton';
import { LiquidityPanel } from '@/components/trading/LiquidityPanel';
import { TradePanel } from '@/components/trading/TradePanel';
import { Button, Card, Spinner } from '@/components/ui';
import { FlashValue } from '@/components/ui/FlashValue';
import { StellarPredictClient } from '@/lib/contracts/client';
import { formatUsdc, priceToPercent, truncateAddress } from '@/lib/format';
import { useMarket, usePriceHistory } from '@/hooks/useData';
import { useMarketLive } from '@/hooks/useMarketLive';
import { useWallet } from '@/stores/wallet';

const CMP: Record<string, string> = { GT: '>', GTE: '≥', LT: '<', LTE: '≤', EQ: '=' };

export default function MarketDetailPage() {
  const id = String(useParams().market_id ?? '');
  const outcomeParam = useSearchParams().get('outcome');
  const defaultSide = outcomeParam?.toLowerCase() === 'no' ? 'NO' : 'YES';
  const { data: market, isLoading, refetch } = useMarket(id);
  const history = usePriceHistory(id);
  const live = useMarketLive(id, market?.market_id);
  const { address, sign } = useWallet();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (isLoading || !market) return <Spinner />;

  const resolved =
    market.status === 'RESOLVED_YES' ||
    market.status === 'RESOLVED_NO' ||
    market.status === 'INVALID';
  const threshold = (Number(market.threshold) / 1e7).toFixed(4);

  async function claim() {
    if (!address || !market) return;
    setBusy(true);
    setNote(null);
    try {
      const client = new StellarPredictClient(sign);
      const hash = await client.claimReward(market.contract_address, address);
      setNote(`Confirmed: ${hash.slice(0, 8)}…`);
      void refetch();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-3">
        <div className="flex items-center gap-3">
          <MarketStatusBadge status={market.status} />
          <span className="text-sm text-muted">
            <ExpiryCountdown expiry={market.expiry_timestamp} />
          </span>
          {live && (
            <span className="flex items-center gap-1 text-xs font-medium text-yes">
              <span className="h-2 w-2 animate-pulse rounded-full bg-yes" /> Live
            </span>
          )}
          <WatchButton marketId={market.market_id} size="lg" className="ml-auto" />
        </div>
        <div className="flex items-start gap-4">
          <MarketIcon feedId={market.oracle_feed_id} size="lg" />
          <h1 className="flex-1 text-2xl font-bold leading-snug">{market.question}</h1>
          <div className="shrink-0 text-right">
            <div className="text-3xl font-bold leading-none text-yes">
              <FlashValue value={priceToPercent(market.yes_price ?? '5000000')}>
                {priceToPercent(market.yes_price ?? '5000000').toFixed(0)}%
              </FlashValue>
            </div>
            <div className="mt-0.5 text-xs text-muted">YES chance</div>
          </div>
        </div>
        {market.description && <p className="text-muted">{market.description}</p>}

        <Card>
          <PriceBar yesPrice={market.yes_price} />
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-semibold text-muted">YES price history</h3>
          <PriceChart points={history.data ?? []} />
        </Card>

        <Card>
          <h3 className="mb-2 text-sm font-semibold">Resolution</h3>
          <p className="text-sm text-muted">
            Resolves YES if{' '}
            <span className="text-white">
              {market.oracle_feed_id.replace('_PRICE', '').replace('_', '/')}{' '}
              {CMP[market.comparison] ?? market.comparison} ${threshold}
            </span>{' '}
            at expiry. Creator: {truncateAddress(market.creator_address)}.
          </p>
        </Card>

        <MarketTabs marketId={market.market_id} />
      </div>

      <div className="space-y-4 lg:col-span-2">
        {!resolved ? (
          <TradePanel market={market} onDone={() => void refetch()} defaultSide={defaultSide} />
        ) : (
          <Card>
            <h3 className="mb-2 font-semibold">Market resolved</h3>
            <p className="mb-4 text-sm text-muted">
              Outcome: <span className="text-white">{market.winning_outcome}</span>
            </p>
            <Button
              className="w-full"
              loading={busy}
              disabled={!address}
              onClick={() => void claim()}
            >
              Claim reward
            </Button>
            {note && <p className="mt-3 break-words text-xs text-muted">{note}</p>}
          </Card>
        )}

        <LiquidityPanel market={market} onDone={() => void refetch()} />

        <Card>
          <h3 className="mb-3 text-sm font-semibold text-muted">Pool</h3>
          <dl className="space-y-2 text-sm">
            <Row label="USDC reserve" value={`$${formatUsdc(market.usdc_reserve ?? '0')}`} />
            <Row label="LP supply" value={formatUsdc(market.total_lp_supply ?? '0', 0)} />
            <Row label="Fee pool" value={`$${formatUsdc(market.fee_pool ?? '0')}`} />
            <Row label="Volume" value={`$${formatUsdc(market.total_volume ?? '0', 0)}`} />
          </dl>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
