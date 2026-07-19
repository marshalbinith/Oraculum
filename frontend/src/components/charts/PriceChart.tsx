'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { priceToPercent } from '@/lib/format';
import type { PricePoint } from '@/lib/types';

export function PriceChart({ points }: { points: PricePoint[] }) {
  const data = points.map((p) => ({
    t: Number(p.timestamp) * 1000,
    yes: priceToPercent(p.yes_price),
  }));

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted">
        No price history yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={256}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke="#243049" strokeDasharray="3 3" />
        <XAxis
          dataKey="t"
          type="number"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(t) => new Date(t).toLocaleDateString()}
          stroke="#8b97b3"
          fontSize={11}
        />
        <YAxis domain={[0, 100]} stroke="#8b97b3" fontSize={11} tickFormatter={(v) => `${v}%`} />
        <Tooltip
          contentStyle={{ background: '#121829', border: '1px solid #243049', borderRadius: 8 }}
          labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
          formatter={(v: number) => [`${v.toFixed(1)}%`, 'YES']}
        />
        <Line type="monotone" dataKey="yes" stroke="#6366f1" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
