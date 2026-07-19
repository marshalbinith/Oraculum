'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input } from '@/components/ui';
import { StellarPredictClient } from '@/lib/contracts/client';
import type { Comparison } from '@/lib/contracts/scval';
import { usdcToStroops } from '@/lib/format';
import { useWallet } from '@/stores/wallet';

// Mirrors the factory contract's limits.
const MIN_DURATION_SECS = 60; // 1 minute
const MIN_LIQUIDITY_USDC = 10;

/** Format a Date as a `datetime-local` value (local time). */
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Translate a factory contract error into a human message. */
function friendlyError(raw: string): string {
  const code = raw.match(/Error\(Contract, #(\d+)\)/)?.[1];
  const map: Record<string, string> = {
    '4': 'Expiry is in the past.',
    '5': 'Expiry must be at least 1 minute from now.',
    '6': 'Expiry is too far out (max 365 days).',
    '7': `Initial liquidity is below the minimum (${MIN_LIQUIDITY_USDC} USDC).`,
    '8': 'Opening probability must be between 1% and 99%.',
    '9': 'Question cannot be empty.',
  };
  if (code && map[code]) return map[code];
  if (/trustline/i.test(raw)) {
    return 'Your wallet needs a USDC trustline and balance to create a market.';
  }
  return raw;
}

const FEEDS = ['XLM_USD_PRICE', 'BTC_USD_PRICE', 'ETH_USD_PRICE'];
const COMPARISONS: Array<{ value: Comparison; label: string }> = [
  { value: 'Gt', label: '>' },
  { value: 'Gte', label: '≥' },
  { value: 'Lt', label: '<' },
  { value: 'Lte', label: '≤' },
  { value: 'Eq', label: '=' },
];

export default function CreateMarketPage() {
  const router = useRouter();
  const { address, sign } = useWallet();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    question: '',
    description: '',
    expiry: '',
    feedId: FEEDS[0]!,
    comparison: 'Gt' as Comparison,
    threshold: '1.00',
    initialUsdc: '20',
    yesPercent: 50,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Default the expiry to 7 days out and compute the picker's minimum (now + 1h),
  // client-side to avoid SSR/time hydration mismatches.
  const [minExpiry, setMinExpiry] = useState('');
  useEffect(() => {
    const now = Date.now();
    // Picker floor = exactly the contract minimum (1 minute).
    setMinExpiry(toLocalInput(new Date(now + MIN_DURATION_SECS * 1000)));
    // Default 10 minutes out — short enough to test the full lifecycle quickly.
    setForm((f) => (f.expiry ? f : { ...f, expiry: toLocalInput(new Date(now + 10 * 60 * 1000)) }));
  }, []);

  const cmpLabel = COMPARISONS.find((c) => c.value === form.comparison)?.label ?? '>';

  /** Client-side guard mirroring the contract, so we never submit an invalid tx. */
  function validate(): string | null {
    if (!form.question.trim()) return 'Enter a question.';
    const expMs = new Date(form.expiry).getTime();
    if (!form.expiry || Number.isNaN(expMs)) return 'Pick an expiry date and time.';
    if (Math.floor(expMs / 1000) - Math.floor(Date.now() / 1000) < MIN_DURATION_SECS) {
      return 'Expiry must be at least 1 minute from now.';
    }
    if (Number(form.initialUsdc) < MIN_LIQUIDITY_USDC) {
      return `Initial liquidity must be at least ${MIN_LIQUIDITY_USDC} USDC.`;
    }
    return null;
  }

  async function submit() {
    if (!address) {
      setErr('Connect your wallet first');
      return;
    }
    const problem = validate();
    if (problem) {
      setErr(problem);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const client = new StellarPredictClient(sign);
      const expirySecs = BigInt(Math.floor(new Date(form.expiry).getTime() / 1000));
      const hash = await client.createMarket({
        creator: address,
        question: form.question,
        description: form.description,
        expiry: expirySecs,
        feedId: form.feedId,
        comparison: form.comparison,
        threshold: usdcToStroops(form.threshold),
        initialUsdc: usdcToStroops(form.initialUsdc),
        yesPriceBps: BigInt(Math.round(form.yesPercent * 100)),
      });
      router.push(`/markets?created=${hash.slice(0, 8)}`);
    } catch (e) {
      setErr(friendlyError(e instanceof Error ? e.message : 'Failed to create market'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Create Market</h1>
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className={`h-1.5 flex-1 rounded-full ${n <= step ? 'bg-primary' : 'bg-surface-2'}`}
          />
        ))}
      </div>

      <Card className="space-y-4">
        {step === 1 && (
          <>
            <h2 className="font-semibold">1 · Market details</h2>
            <div>
              <label className="mb-1 block text-xs text-muted">
                Question ({form.question.length}/280)
              </label>
              <Input
                maxLength={280}
                value={form.question}
                onChange={(e) => set('question', e.target.value)}
                placeholder="Will XLM/USD be above $1 on Dec 31?"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Description (optional)</label>
              <Input value={form.description} onChange={(e) => set('description', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Expiry</label>
              <Input
                type="datetime-local"
                min={minExpiry}
                value={form.expiry}
                onChange={(e) => set('expiry', e.target.value)}
              />
              <p className="mt-1 text-xs text-muted">Must be at least 1 minute from now.</p>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="font-semibold">2 · Oracle configuration</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted">Feed</label>
                <select
                  className="input"
                  value={form.feedId}
                  onChange={(e) => set('feedId', e.target.value)}
                >
                  {FEEDS.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted">Comparison</label>
                <select
                  className="input"
                  value={form.comparison}
                  onChange={(e) => set('comparison', e.target.value as Comparison)}
                >
                  {COMPARISONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Threshold (USD)</label>
              <Input
                inputMode="decimal"
                value={form.threshold}
                onChange={(e) => set('threshold', e.target.value)}
              />
            </div>
            <p className="rounded-lg bg-surface-2 p-3 text-sm text-muted">
              Resolves YES if{' '}
              <span className="text-white">
                {form.feedId.replace('_PRICE', '').replace('_', '/')} {cmpLabel} ${form.threshold}
              </span>{' '}
              at expiry.
            </p>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="font-semibold">3 · Initial liquidity</h2>
            <div>
              <label className="mb-1 block text-xs text-muted">Initial USDC</label>
              <Input
                inputMode="decimal"
                value={form.initialUsdc}
                onChange={(e) => set('initialUsdc', e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">
                Initial YES probability: {form.yesPercent}%
              </label>
              <input
                type="range"
                min={1}
                max={99}
                value={form.yesPercent}
                onChange={(e) => set('yesPercent', Number(e.target.value))}
                className="w-full"
              />
              <div className="mt-1 flex justify-between text-xs text-muted">
                <span className="text-yes">YES {form.yesPercent}%</span>
                <span className="text-no">NO {100 - form.yesPercent}%</span>
              </div>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="font-semibold">4 · Review</h2>
            <dl className="space-y-2 text-sm">
              <Review label="Question" value={form.question} />
              <Review
                label="Condition"
                value={`${form.feedId} ${cmpLabel} $${form.threshold}`}
              />
              <Review label="Expiry" value={form.expiry || '—'} />
              <Review label="Initial USDC" value={`$${form.initialUsdc}`} />
              <Review label="Opening YES" value={`${form.yesPercent}%`} />
            </dl>
            <p className="text-xs text-muted">
              A creation fee (set by the protocol) plus your initial USDC will be transferred on
              submit.
            </p>
            {err && <p className="break-words text-xs text-no">{err}</p>}
          </>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
            Back
          </Button>
          {step < 4 ? (
            <Button onClick={() => setStep((s) => s + 1)}>Next</Button>
          ) : (
            <Button loading={busy} disabled={!address} onClick={() => void submit()}>
              Create Market
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function Review({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
