'use client';

import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  href?: string;
  tone?: 'yes' | 'no' | 'info';
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    // Auto-dismiss after 10s.
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 10_000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));
