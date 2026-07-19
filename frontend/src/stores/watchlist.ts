'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WatchlistState {
  ids: string[];
  toggle: (id: string) => void;
}

/** Per-browser market watchlist, persisted to localStorage. */
export const useWatchlist = create<WatchlistState>()(
  persist(
    (set) => ({
      ids: [],
      toggle: (id) =>
        set((s) => ({
          ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id],
        })),
    }),
    { name: 'stellarpredict-watchlist' },
  ),
);
