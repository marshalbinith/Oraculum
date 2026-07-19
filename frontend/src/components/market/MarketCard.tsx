import Link from 'next/link';
import { FlashValue } from '@/components/ui/FlashValue';
import { formatCents, formatUsdc, priceToPercent } from '@/lib/format';
import type { Market } from '@/lib/types';
import { ExpiryCountdown } from './ExpiryCountdown';
import { MarketIcon } from './MarketIcon';
import { MarketStatusBadge } from './MarketStatusBadge';
import { WatchButton } from './WatchButton';

/** Polymarket-style market tile: question, the implied "% chance", inline
 *  Yes/No buy buttons priced in cents, and volume/expiry. */
export function MarketCard({ market }: { market: Market }) {
  const yesPct = priceToPercent(market.yes_price ?? '5000000');
  const tradable = market.status === 'OPEN';
  const href = `/markets/${market.market_id}`;

  return (
    <div className="card flex flex-col gap-3 p-4 transition-colors hover:border-primary/60">
      <div className="flex items-start gap-3">
        <MarketIcon feedId={market.oracle_feed_id} />
        <Link
          href={href}
          className="line-clamp-2 min-h-[2.5rem] flex-1 text-[15px] font-medium leading-snug hover:text-primary"
        >
          {market.question}
        </Link>
        <div className="shrink-0 text-right">
          <div className="text-2xl font-bold leading-none">
            <FlashValue value={yesPct}>{yesPct.toFixed(0)}%</FlashValue>
          </div>
          <div className="mt-0.5 text-[11px] text-muted">chance</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <OutcomeButton
          href={`${href}?outcome=yes`}
          label="Yes"
          price={formatCents(market.yes_price ?? '5000000')}
          tone="yes"
          disabled={!tradable}
        />
        <OutcomeButton
          href={`${href}?outcome=no`}
          label="No"
          price={formatCents(market.no_price ?? '5000000')}
          tone="no"
          disabled={!tradable}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-muted">
        <span>${formatUsdc(market.total_volume ?? '0', 0)} Vol</span>
        <span className="flex items-center gap-2">
          <MarketStatusBadge status={market.status} />
          <ExpiryCountdown expiry={market.expiry_timestamp} />
          <WatchButton marketId={market.market_id} />
        </span>
      </div>
    </div>
  );
}

function OutcomeButton({
  href,
  label,
  price,
  tone,
  disabled,
}: {
  href: string;
  label: string;
  price: string;
  tone: 'yes' | 'no';
  disabled: boolean;
}) {
  const tones = {
    yes: 'bg-yes/15 text-yes hover:bg-yes/25',
    no: 'bg-no/15 text-no hover:bg-no/25',
  } as const;
  if (disabled) {
    return (
      <span className="flex cursor-not-allowed items-center justify-center gap-1.5 rounded-lg bg-surface-2 py-2 text-sm font-semibold text-muted">
        {label} {price}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors ${tones[tone]}`}
    >
      {label} {price}
    </Link>
  );
}
