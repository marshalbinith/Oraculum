'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { PortfolioSummaryCard } from '@/components/portfolio/PortfolioSummaryCard';
import { useWatchlist } from '@/stores/watchlist';
import { NAV_LINKS, activeHref } from './nav';

/** Left sidebar navigation (desktop). Mobile uses the horizontal nav in Topbar. */
export function Sidebar() {
  const pathname = usePathname();
  const active = activeHref(pathname);
  // localStorage-backed; guard against SSR hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const watchCount = useWatchlist((s) => s.ids.length);

  return (
    <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface/40 px-3 py-6 md:flex">
      <nav className="flex flex-col gap-1">
        {NAV_LINKS.map(({ href, label, icon: Icon }) => {
          const isActive = href === active;
          const badge = href === '/markets' && mounted && watchCount > 0 ? watchCount : null;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-primary/15 font-medium text-primary'
                  : 'text-muted hover:bg-surface-2 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {badge != null && (
                <span className="ml-auto flex items-center gap-0.5 rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                  <Star className="h-2.5 w-2.5 fill-amber-400" />
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6">
        <PortfolioSummaryCard />
      </div>

      <p className="mt-auto px-3 pt-6 text-[11px] leading-relaxed text-muted">
        Testnet only · settles in real Circle USDC · not financial advice.
      </p>
    </aside>
  );
}
