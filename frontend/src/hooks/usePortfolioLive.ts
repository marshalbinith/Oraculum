'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from '@/lib/socket';

const EVENTS = ['trade', 'price_update', 'market_status', 'market_resolved'] as const;

/**
 * Keep a wallet's portfolio fresh in real time. A portfolio's value/PnL changes
 * both from the wallet's own actions and from price moves in markets it holds —
 * both arrive on the global `markets` room — so we invalidate the portfolio query
 * on any market event. No-ops when no wallet is connected.
 */
export function usePortfolioLive(address: string | null): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!address) return;
    const socket = getSocket();
    const invalidate = () => {
      void qc.invalidateQueries({ queryKey: ['portfolio', address] });
    };
    const join = () => socket.emit('subscribe', { channel: 'markets' });

    if (socket.connected) join();
    socket.on('connect', join);
    EVENTS.forEach((e) => socket.on(e, invalidate));

    // Keep the shared room; just drop our listeners.
    return () => {
      socket.off('connect', join);
      EVENTS.forEach((e) => socket.off(e, invalidate));
    };
  }, [address, qc]);
}
