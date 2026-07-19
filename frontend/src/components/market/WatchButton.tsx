'use client';

import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { useWatchlist } from '@/stores/watchlist';

/** ⭐ toggle to add/remove a market from the local watchlist. */
export function WatchButton({
  marketId,
  className = '',
  size = 'sm',
}: {
  marketId: string;
  className?: string;
  size?: 'sm' | 'lg';
}) {
  // Persisted state hydrates on the client; guard against SSR mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const toggle = useWatchlist((s) => s.toggle);
  const watched = useWatchlist((s) => s.ids.includes(marketId));
  const on = mounted && watched;
  const dim = size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(marketId);
      }}
      aria-label={on ? 'Remove from watchlist' : 'Add to watchlist'}
      title={on ? 'Remove from watchlist' : 'Add to watchlist'}
      className={`transition-colors hover:text-amber-400 ${on ? 'text-amber-400' : 'text-muted'} ${className}`}
    >
      <Star className={`${dim} ${on ? 'fill-amber-400' : ''}`} />
    </button>
  );
}
