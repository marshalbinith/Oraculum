'use client';

/**
 * useWallet — self-contained state for the /wallet feature.
 *
 * Composes the Freighter layer (stellar-wallet.ts) with the Horizon layer
 * (stellar-sdk.ts): connect / disconnect, XLM balance, and send-XLM flow.
 * (Distinct from the app-wide zustand wallet store in stores/wallet.ts.)
 */
import { useCallback, useEffect, useState } from 'react';
import { connectWallet, getWalletAddress, signTx } from '@/lib/stellar-wallet';
import { buildPaymentXdr, fetchXlmBalance, submitSignedTx } from '@/lib/stellar-sdk';

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

export interface UseWallet {
  address: string | null;
  balance: string | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
  sendXlm: (to: string, amount: string) => Promise<{ hash: string }>;
}

export function useWallet(): UseWallet {
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Fetch balance for `addr` (defaults to current address). */
  const refreshFor = useCallback(async (addr: string | null) => {
    if (!addr) return;
    setError(null);
    try {
      const b = await fetchXlmBalance(addr);
      setBalance(b);
    } catch (err) {
      setError(messageOf(err));
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    setIsLoading(true);
    try {
      await refreshFor(address);
    } finally {
      setIsLoading(false);
    }
  }, [address, refreshFor]);

  const connect = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const addr = await connectWallet();
      setAddress(addr);
      await refreshFor(addr);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setIsLoading(false);
    }
  }, [refreshFor]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setBalance(null);
    setError(null);
  }, []);

  const sendXlm = useCallback(
    async (to: string, amount: string): Promise<{ hash: string }> => {
      if (!address) throw new Error('Wallet not connected');
      setIsLoading(true);
      setError(null);
      try {
        const xdr = await buildPaymentXdr(address, to, amount);
        const signedXdr = await signTx(xdr);
        const result = await submitSignedTx(signedXdr);
        await refreshFor(address);
        return result;
      } catch (err) {
        const m = messageOf(err);
        setError(m);
        throw new Error(m);
      } finally {
        setIsLoading(false);
      }
    },
    [address, refreshFor],
  );

  // Restore a previously-authorized session on mount.
  useEffect(() => {
    let active = true;
    void (async () => {
      const addr = await getWalletAddress();
      if (active && addr) {
        setAddress(addr);
        await refreshFor(addr);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshFor]);

  return {
    address,
    balance,
    isConnected: address !== null,
    isLoading,
    error,
    connect,
    disconnect,
    refreshBalance,
    sendXlm,
  };
}
