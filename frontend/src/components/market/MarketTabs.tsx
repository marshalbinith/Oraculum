'use client';

import { useState } from 'react';
import { Card } from '@/components/ui';
import { useMarketActivity, useMarketComments } from '@/hooks/useData';
import { ActivityFeed } from './ActivityFeed';
import { CommentsFeed } from './CommentsFeed';

type Tab = 'activity' | 'comments';

/** Polymarket-style tabbed panel: a unified Activity timeline + signed Comments. */
export function MarketTabs({ marketId }: { marketId: string }) {
  const [tab, setTab] = useState<Tab>('activity');
  const activity = useMarketActivity(marketId);
  const comments = useMarketComments(marketId);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'activity', label: `Activity${activity.data ? ` (${activity.data.length})` : ''}` },
    { id: 'comments', label: `Comments${comments.data ? ` (${comments.data.length})` : ''}` },
  ];

  return (
    <Card>
      <div className="mb-4 flex gap-4 border-b border-border text-sm font-medium">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 pb-2 ${
              tab === t.id
                ? 'border-primary text-white'
                : 'border-transparent text-muted hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'activity' ? <ActivityFeed marketId={marketId} /> : <CommentsFeed marketId={marketId} />}
    </Card>
  );
}
