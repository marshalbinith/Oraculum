'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BadgeCheck } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { api } from '@/lib/api';
import { commentMessage } from '@/lib/comment';
import { truncateAddress } from '@/lib/format';
import { useMarketComments } from '@/hooks/useData';
import { useWallet } from '@/stores/wallet';

/** Per-market discussion. Comments persist to Postgres via the REST API; the
 *  author is the connected wallet address. */
export function CommentsFeed({ marketId }: { marketId: string }) {
  const { address, signMsg } = useWallet();
  const { data, isLoading } = useMarketComments(marketId);
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!address || !text.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const body = text.trim();
      const timestamp = Math.floor(Date.now() / 1000);
      // Prove authorship: sign the canonical message with the wallet (SEP-53).
      const signature = await signMsg(commentMessage(marketId, timestamp, body));
      await api.postComment(marketId, address, body, timestamp, signature);
      setText('');
      await qc.invalidateQueries({ queryKey: ['comments', marketId] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to post');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {address ? (
        <div className="mb-4 flex gap-2">
          <Input
            placeholder="Add a comment…"
            value={text}
            maxLength={500}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
          <Button onClick={() => void submit()} loading={busy} disabled={!text.trim()}>
            Post
          </Button>
        </div>
      ) : (
        <p className="mb-4 text-sm text-muted">Connect your wallet to comment.</p>
      )}
      {err && <p className="mb-3 break-words text-xs text-no">{err}</p>}

      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : data && data.length > 0 ? (
        <div className="space-y-3">
          {data.map((c) => (
            <div key={c.comment_id} className="border-b border-border pb-3 last:border-0">
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="font-medium text-white" title={c.author_address}>
                    {truncateAddress(c.author_address)}
                  </span>
                  <span
                    className="inline-flex items-center gap-0.5 rounded-full bg-yes/15 px-1.5 py-0.5 text-[10px] font-medium text-yes"
                    title="Authorship verified by wallet signature (SEP-53)"
                  >
                    <BadgeCheck className="h-3 w-3" /> signed
                  </span>
                </span>
                <span>{new Date(c.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-1 break-words text-sm">{c.body}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">No comments yet. Be the first.</p>
      )}
    </div>
  );
}
