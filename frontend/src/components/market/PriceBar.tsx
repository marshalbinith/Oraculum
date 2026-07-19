import { priceToPercent } from '@/lib/format';

export function PriceBar({ yesPrice }: { yesPrice: string | null }) {
  const yes = priceToPercent(yesPrice ?? '5000000');
  const no = 100 - yes;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm font-medium">
        <span className="text-yes">YES {yes.toFixed(0)}%</span>
        <span className="text-no">NO {no.toFixed(0)}%</span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
        <div className="bg-yes" style={{ width: `${yes}%` }} />
        <div className="bg-no" style={{ width: `${no}%` }} />
      </div>
    </div>
  );
}
