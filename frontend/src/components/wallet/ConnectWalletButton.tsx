'use client';

import { LogOut, Wallet } from 'lucide-react';
import { Button } from '@/components/ui';
import { truncateAddress } from '@/lib/format';
import { useWallet } from '@/stores/wallet';

export function ConnectWalletButton() {
  const { address, connecting, connect, disconnect, error } = useWallet();

  if (address) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="hidden items-center gap-1.5 text-sm text-muted sm:flex"
          title={address}
        >
          <Wallet className="h-4 w-4" />
          {truncateAddress(address)}
        </span>
        <Button variant="ghost" onClick={disconnect} title={`Disconnect ${address}`}>
          <LogOut className="h-4 w-4" />
          Disconnect
        </Button>
      </div>
    );
  }
  return (
    <Button onClick={() => void connect()} loading={connecting} title={error ?? undefined}>
      <Wallet className="h-4 w-4" />
      Connect Wallet
    </Button>
  );
}
