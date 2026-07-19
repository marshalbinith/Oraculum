import { Badge } from '@/components/ui';
import type { MarketStatus } from '@/lib/types';

const MAP: Record<MarketStatus, { label: string; color: string }> = {
  PENDING: { label: 'Pending', color: 'gray' },
  OPEN: { label: 'Open', color: 'green' },
  LOCKED: { label: 'Locked', color: 'amber' },
  RESOLVED_YES: { label: 'Resolved · YES', color: 'green' },
  RESOLVED_NO: { label: 'Resolved · NO', color: 'red' },
  INVALID: { label: 'Invalid', color: 'gray' },
};

export function MarketStatusBadge({ status }: { status: MarketStatus }) {
  const s = MAP[status] ?? MAP.PENDING;
  return <Badge color={s.color}>{s.label}</Badge>;
}
