'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { useResolvedToasts } from '@/hooks/useResolvedToasts';
import { useWallet } from '@/stores/wallet';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false } },
      }),
  );
  const restore = useWallet((s) => s.restore);
  useEffect(() => {
    void restore();
  }, [restore]);

  return (
    <QueryClientProvider client={client}>
      <ToastHost />
      {children}
      <ToastContainer />
    </QueryClientProvider>
  );
}

/** Lives inside the QueryClientProvider so it can read the wallet's portfolio. */
function ToastHost() {
  useResolvedToasts();
  return null;
}
