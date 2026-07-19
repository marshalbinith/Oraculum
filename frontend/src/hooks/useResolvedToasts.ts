'use client';

import { useEffect, useRef } from 'react';
import { getSocket } from '@/lib/socket';
import { usePortfolio } from '@/hooks/useData';
import { useToasts } from '@/stores/toast';
import { useWallet } from '@/stores/wallet';
import { useWatchlist } from '@/stores/watchlist';

interface ResolvedEvent {
  market_id: string;
  outcome?: string;
}

/**
 * Toast when a "watched" market resolves. Watched = the wallet's portfolio
 * markets (with their question) plus explicitly starred watchlist markets.
 * Resolutions arrive on the global `markets` room.
 */
export function useResolvedToasts(): void {
  const { address } = useWallet();
  const { data } = usePortfolio(address);
  const watchlistIds = useWatchlist((s) => s.ids);
  const push = useToasts((s) => s.push);

  // Kept in refs so the socket handler always sees the latest without resubscribing.
  const watchedIds = useRef<Set<string>>(new Set());
  const questions = useRef<Map<string, string>>(new Map());
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    const q = new Map<string, string>();
    const ids = new Set<string>(watchlistIds);
    data?.markets?.forEach((mk) => {
      q.set(mk.market_id, mk.question);
      ids.add(mk.market_id);
    });
    questions.current = q;
    watchedIds.current = ids;
  }, [data, watchlistIds]);

  useEffect(() => {
    const socket = getSocket();
    const join = () => socket.emit('subscribe', { channel: 'markets' });
    const onResolved = (e: ResolvedEvent) => {
      if (!watchedIds.current.has(e.market_id) || seen.current.has(e.market_id)) return;
      seen.current.add(e.market_id);
      const question = questions.current.get(e.market_id);
      const outcome = (e.outcome ?? '').toUpperCase();
      push({
        message: question
          ? `Resolved ${outcome} — ${question}. Claim your reward.`
          : `A market you're watching resolved ${outcome}.`,
        href: `/markets/${e.market_id}`,
        tone: outcome === 'YES' ? 'yes' : outcome === 'NO' ? 'no' : 'info',
      });
    };

    if (socket.connected) join();
    socket.on('connect', join);
    socket.on('market_resolved', onResolved);
    return () => {
      socket.off('connect', join);
      socket.off('market_resolved', onResolved);
    };
  }, [push]);
}
