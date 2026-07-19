/** Thumbnail derived from the market's oracle feed (no uploaded images). */
const FEED_META: Record<string, { label: string; cls: string }> = {
  XLM_USD_PRICE: { label: 'XLM', cls: 'bg-primary/20 text-primary' },
  BTC_USD_PRICE: { label: 'BTC', cls: 'bg-amber-500/20 text-amber-400' },
  ETH_USD_PRICE: { label: 'ETH', cls: 'bg-indigo-400/20 text-indigo-300' },
};

export function MarketIcon({
  feedId,
  size = 'md',
}: {
  feedId: string;
  size?: 'md' | 'lg';
}) {
  const meta = FEED_META[feedId] ?? {
    label: feedId.replace('_PRICE', '').slice(0, 3),
    cls: 'bg-surface-2 text-muted',
  };
  const dim = size === 'lg' ? 'h-12 w-12 text-sm' : 'h-10 w-10 text-xs';
  return (
    <div
      className={`flex ${dim} shrink-0 items-center justify-center rounded-lg font-bold ${meta.cls}`}
    >
      {meta.label}
    </div>
  );
}
