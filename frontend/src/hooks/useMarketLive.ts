'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '@/lib/socket';

const EVENTS = ['trade', 'price_update', 'market_status', 'market_resolved'] as const;

/**
 * Subscribe to a market's realtime room and invalidate its React Query caches on
 * any indexer event, so the price, activity and chart live-update. `routeId` is
 * what the page's queries were keyed by; `canonicalId` (the market UUID) is the
 * room the indexer publishes to. Returns whether the socket is connected.
 */
export function useMarketLive(routeId: string, canonicalId?: string): boolean {
  const qc = useQueryClient();
  const [live, setLive] = useState(false);

  useEffect(() => {
    const room = canonicalId || routeId;
    if (!room) return;
    const socket = getSocket();

    const invalidate = () => {
      void qc.invalidateQueries({ queryKey: ['market', routeId] });
      void qc.invalidateQueries({ queryKey: ['activity', routeId] });
      void qc.invalidateQueries({ queryKey: ['price-history', routeId] });
    };
    const join = () => {
      setLive(true);
      socket.emit('subscribe', { channel: 'market', market_id: room });
    };
    const onDisconnect = () => setLive(false);

    if (socket.connected) join();
    socket.on('connect', join);
    socket.on('disconnect', onDisconnect);
    EVENTS.forEach((e) => socket.on(e, invalidate));

    return () => {
      socket.emit('unsubscribe', { channel: 'market', market_id: room });
      socket.off('connect', join);
      socket.off('disconnect', onDisconnect);
      EVENTS.forEach((e) => socket.off(e, invalidate));
    };
  }, [routeId, canonicalId, qc]);

  return live;
}
