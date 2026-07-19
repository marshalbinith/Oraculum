'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '@/lib/socket';

const EVENTS = [
  'trade',
  'price_update',
  'market_status',
  'market_resolved',
  'market_created',
] as const;

/**
 * Subscribe to the global markets room and invalidate the markets list + stats
 * on any market event, so the list/dashboard live-update (new markets, price
 * moves, resolutions) without a refresh.
 */
export function useMarketsLive(): void {
  const qc = useQueryClient();
  useEffect(() => {
    const socket = getSocket();
    const invalidate = () => {
      void qc.invalidateQueries({ queryKey: ['markets'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
    };
    const join = () => socket.emit('subscribe', { channel: 'markets' });

    if (socket.connected) join();
    socket.on('connect', join);
    EVENTS.forEach((e) => socket.on(e, invalidate));

    // Only remove our listeners on cleanup — keep the shared `markets:all` room
    // membership (other hooks, e.g. usePortfolioLive, may still rely on it).
    return () => {
      socket.off('connect', join);
      EVENTS.forEach((e) => socket.off(e, invalidate));
    };
  }, [qc]);
}
