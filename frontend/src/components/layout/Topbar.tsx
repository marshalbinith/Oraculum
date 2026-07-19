'use client';

import { Activity } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectWalletButton } from '@/components/wallet/ConnectWalletButton';
import { env } from '@/lib/env';
import { NAV_LINKS, activeHref } from './nav';

const IS_MAINNET = env.network === 'mainnet' || env.network === 'public';

/** Full-width top header: brand + wallet. On mobile it also carries the nav as a
 *  horizontal strip (the left sidebar is hidden below md). */
export function Topbar() {
  const pathname = usePathname();
  const active = activeHref(pathname);
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/70 backdrop-blur">
      <div className="flex h-16 items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <Activity className="h-5 w-5 text-primary" />
          StellarPredict
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              IS_MAINNET ? 'bg-yes/15 text-yes' : 'bg-amber-500/15 text-amber-400'
            }`}
          >
            {IS_MAINNET ? 'Mainnet' : 'Testnet'}
          </span>
        </Link>
        <ConnectWalletButton />
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-border px-2 py-2 md:hidden">
        {NAV_LINKS.map(({ href, label, icon: Icon }) => {
          const isActive = href === active;
          return (
            <Link
              key={href}
              href={href}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${
                isActive ? 'bg-primary/15 text-primary' : 'text-muted'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
