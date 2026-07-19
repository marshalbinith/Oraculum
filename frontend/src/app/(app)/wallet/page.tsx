'use client';

import { StellarWalletPanel } from '@/components/wallet/stellar-wallet-panel';

/** /wallet — Stellar Wallet · Freighter Integration (testnet). */
export default function WalletPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stellar Wallet — Freighter Integration</h1>
        <p className="text-sm text-muted">
          Connect Freighter on Stellar testnet, view your XLM balance, and send a payment.
        </p>
      </div>
      <StellarWalletPanel />
    </div>
  );
}
