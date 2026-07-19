/**
 * Freighter wallet integration for Stellar testnet.
 *
 * Thin, explicitly-imported wrappers over @stellar/freighter-api (v3.x, which
 * returns `{ address, error }` / `{ isConnected }` style objects). All calls
 * target testnet via STELLAR_TESTNET_PASSPHRASE.
 */
import {
  getAddress,
  isAllowed,
  isConnected,
  requestAccess,
  signTransaction,
} from '@stellar/freighter-api';
import { HORIZON_TESTNET_URL, STELLAR_TESTNET_PASSPHRASE } from './stellar-sdk';

// Re-export so callers can pull the network constants from the wallet module.
export { HORIZON_TESTNET_URL, STELLAR_TESTNET_PASSPHRASE };

/** True when the Freighter browser extension is installed and reachable. */
export async function detectFreighter(): Promise<boolean> {
  try {
    const res = await isConnected();
    return res.isConnected === true;
  } catch {
    return false;
  }
}

/**
 * Request permission (if not already granted) and return the wallet G-address.
 * Uses isAllowed() → requestAccess() (first time) → getAddress().
 */
export async function connectWallet(): Promise<string> {
  const allowed = await isAllowed();
  if (!allowed.isAllowed) {
    const access = await requestAccess();
    if (access.error) throw new Error(String(access.error));
    if (!access.address) throw new Error('Freighter returned no address');
    return access.address;
  }
  const res = await getAddress();
  if (res.error) throw new Error(String(res.error));
  if (!res.address) throw new Error('Freighter returned no address');
  return res.address;
}

/** Return the already-authorized address, or null if not connected/allowed. */
export async function getWalletAddress(): Promise<string | null> {
  try {
    const allowed = await isAllowed();
    if (!allowed.isAllowed) return null;
    const res = await getAddress();
    if (res.error || !res.address) return null;
    return res.address;
  } catch {
    return null;
  }
}

/** Sign a transaction XDR with Freighter on testnet; returns the signed XDR. */
export async function signTx(xdr: string): Promise<string> {
  const address = await getWalletAddress();
  if (!address) throw new Error('Wallet not connected');
  const res = await signTransaction(xdr, {
    networkPassphrase: STELLAR_TESTNET_PASSPHRASE,
    address,
  });
  if (res.error) throw new Error(String(res.error));
  return res.signedTxXdr;
}
