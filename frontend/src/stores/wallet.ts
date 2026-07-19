'use client';

/** Wallet connection state backed by Freighter. */
import { create } from 'zustand';
import {
  getAddress,
  isConnected,
  requestAccess,
  signMessage,
  signTransaction,
} from '@stellar/freighter-api';
import { env } from '@/lib/env';

interface WalletState {
  address: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  restore: () => Promise<void>;
  sign: (xdr: string) => Promise<string>;
  signMsg: (message: string) => Promise<string>;
}

/** Normalize Freighter's signedMessage (Buffer | base64 string) to base64. */
function toBase64(sm: unknown): string {
  if (typeof sm === 'string') return sm;
  const bytes = sm instanceof Uint8Array ? sm : new Uint8Array(sm as ArrayBufferLike);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

export const useWallet = create<WalletState>((set, getState) => ({
  address: null,
  connecting: false,
  error: null,

  async connect() {
    set({ connecting: true, error: null });
    try {
      const conn = await isConnected();
      if (!conn.isConnected) throw new Error('Freighter is not installed');
      const access = await requestAccess();
      if (access.error) throw new Error(access.error);
      set({ address: access.address, connecting: false });
    } catch (e) {
      set({ connecting: false, error: e instanceof Error ? e.message : 'Failed to connect' });
    }
  },

  disconnect() {
    set({ address: null });
  },

  async restore() {
    try {
      const conn = await isConnected();
      if (!conn.isConnected) return;
      const res = await getAddress();
      if (!res.error && res.address) set({ address: res.address });
    } catch {
      /* not connected */
    }
  },

  async sign(xdr: string): Promise<string> {
    const address = getState().address;
    if (!address) throw new Error('Wallet not connected');
    const res = await signTransaction(xdr, {
      networkPassphrase: env.networkPassphrase,
      address,
    });
    if (res.error) throw new Error(String(res.error));
    return res.signedTxXdr;
  },

  async signMsg(message: string): Promise<string> {
    const address = getState().address;
    if (!address) throw new Error('Wallet not connected');
    const res = await signMessage(message, {
      networkPassphrase: env.networkPassphrase,
      address,
    });
    if (res.error) throw new Error(String(res.error));
    if (res.signedMessage == null) throw new Error('Message signing was rejected');
    return toBase64(res.signedMessage);
  },
}));
