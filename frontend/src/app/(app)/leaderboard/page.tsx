'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, Spinner } from '@/components/ui';
import { env } from '@/lib/env';
import { formatUsdc, truncateAddress } from '@/lib/format';

interface Row {
  address: string;
  pnl?: string;
  fees_earned?: string;
  markets_created?: string;
  volume_generated?: string;
  trade_count?: string;
}

async function fetchBoard(kind: string): Promise<Row[]> {
  const res = await fetch(`${env.apiBaseUrl}/api/v1/leaderboard/${kind}`);
  const body = await res.json();
  return body.success ? (body.data as Row[]) : [];
}

function Board({ title, kind, valueKey, format }: {
  title: string;
  kind: string;
  valueKey: keyof Row;
  format: (v: string) => string;
}) {
  const { data, isLoading } = useQuery({ queryKey: ['board', kind], queryFn: () => fetchBoard(kind) });
  return (
    <Card>
      <h2 className="mb-4 font-semibold">{title}</h2>
      {isLoading ? (
        <Spinner />
      ) : (
        <ol className="space-y-2 text-sm">
          {(data ?? []).slice(0, 10).map((r, i) => (
            <li key={r.address} className="flex items-center justify-between">
              <span className="text-muted">
                {i + 1}. {truncateAddress(r.address)}
              </span>
              <span>{format(String(r[valueKey] ?? '0'))}</span>
            </li>
          ))}
          {data?.length === 0 && <p className="text-muted">No data yet.</p>}
        </ol>
      )}
    </Card>
  );
}

export default function LeaderboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Leaderboard</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Board title="Top Traders" kind="traders" valueKey="pnl" format={(v) => `$${formatUsdc(v)}`} />
        <Board title="Top LPs" kind="lps" valueKey="fees_earned" format={(v) => `$${formatUsdc(v)}`} />
        <Board
          title="Top Creators"
          kind="creators"
          valueKey="volume_generated"
          format={(v) => `$${formatUsdc(v, 0)}`}
        />
      </div>
    </div>
  );
}
