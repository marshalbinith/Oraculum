'use client';

import { useMemo, useState } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { StellarPredictClient } from '@/lib/contracts/client';
import { quoteBuyShares, quoteSellUsdc, withSlippage } from '@/lib/amm';
import { formatCents, formatUsdc, priceToCents, usdcToStroops } from '@/lib/format';
import type { Market } from '@/lib/types';
import { useWallet } from '@/stores/wallet';

type Side = 'YES' | 'NO';
type Mode = 'BUY' | 'SELL';

const SLIPPAGE_BPS = 100; // 1% floor on estimated output

export function TradePanel({
  market,
  onDone,
  defaultSide = 'YES',
}: {
  market: Market;
  onDone: () => void;
  defaultSide?: Side;
}) {
  const { address, sign } = useWallet();
  const [mode, setMode] = useState<Mode>('BUY');
  const [side, setSide] = useState<Side>(defaultSide);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const tradable = market.status === 'OPEN';
  const yesR = BigInt(market.yes_reserve ?? '0');
  const noR = BigInt(market.no_reserve ?? '0');
  const yesCents = formatCents(market.yes_price ?? '5000000');
  const noCents = formatCents(market.no_price ?? '5000000');

  // Live estimate from the CPMM (exact mirror of the contract math).
  const est = useMemo(() => {
    const raw = amount ? usdcToStroops(amount) : 0n;
    if (raw <= 0n || yesR <= 0n || noR <= 0n) return null;
    if (mode === 'BUY') {
      const shares = quoteBuyShares(yesR, noR, raw, side);
      if (shares <= 0n) return null;
      const avgCents = (Number(raw) / Number(shares)) * 100;
      return { out: shares, avgCents, payout: shares, profit: shares - raw, minOut: withSlippage(shares, SLIPPAGE_BPS) };
    }
    const usdcOut = quoteSellUsdc(yesR, noR, raw, side);
    if (usdcOut <= 0n) return null;
    const avgCents = (Number(usdcOut) / Number(raw)) * 100;
    return { out: usdcOut, avgCents, payout: usdcOut, profit: 0n, minOut: withSlippage(usdcOut, SLIPPAGE_BPS) };
  }, [amount, mode, side, yesR, noR]);

  async function submit() {
    if (!address) {
      setErr('Connect your wallet first');
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const client = new StellarPredictClient(sign);
      const raw = usdcToStroops(amount || '0');
      const minOut = est?.minOut ?? 0n;
      const m = market.contract_address;
      let hash: string;
      if (mode === 'BUY') hash = side === 'YES' ? await client.buyYes(m, address, raw, minOut) : await client.buyNo(m, address, raw, minOut);
      else hash = side === 'YES' ? await client.sellYes(m, address, raw, minOut) : await client.sellNo(m, address, raw, minOut);
      setMsg(`Confirmed: ${hash.slice(0, 8)}…`);
      setAmount('');
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Transaction failed');
    } finally {
      setBusy(false);
    }
  }

  const unit = mode === 'BUY' ? 'USDC' : `${side} shares`;
  const quicks = mode === 'BUY' ? ['1', '5', '20', '50'] : ['5', '25', '100'];

  return (
    <Card className="p-5">
      {/* Buy / Sell */}
      <div className="mb-4 flex gap-4 border-b border-border text-sm font-medium">
        {(['BUY', 'SELL'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`-mb-px border-b-2 pb-2 ${
              mode === m ? 'border-primary text-white' : 'border-transparent text-muted hover:text-white'
            }`}
          >
            {m === 'BUY' ? 'Buy' : 'Sell'}
          </button>
        ))}
      </div>

      {/* Outcome */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => setSide('YES')}
          className={`flex flex-col items-center rounded-lg py-2.5 text-sm font-semibold ${
            side === 'YES' ? 'bg-yes text-white' : 'bg-yes/10 text-yes hover:bg-yes/20'
          }`}
        >
          Yes <span className="text-xs font-normal opacity-90">{yesCents}</span>
        </button>
        <button
          onClick={() => setSide('NO')}
          className={`flex flex-col items-center rounded-lg py-2.5 text-sm font-semibold ${
            side === 'NO' ? 'bg-no text-white' : 'bg-no/10 text-no hover:bg-no/20'
          }`}
        >
          No <span className="text-xs font-normal opacity-90">{noCents}</span>
        </button>
      </div>

      {/* Amount */}
      <label className="mb-1 block text-xs text-muted">Amount ({unit})</label>
      <Input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <div className="mt-2 flex gap-1.5">
        {quicks.map((q) => (
          <button
            key={q}
            onClick={() => setAmount(q)}
            className="rounded-md bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-white"
          >
            {mode === 'BUY' ? `$${q}` : q}
          </button>
        ))}
      </div>

      {/* Estimate */}
      {est && (
        <div className="mt-4 space-y-1.5 rounded-lg bg-surface-2 p-3 text-xs">
          <Row label="Avg price" value={`${est.avgCents.toFixed(1)}¢`} />
          {mode === 'BUY' ? (
            <>
              <Row label="Est. shares" value={formatUsdc(est.out, 2)} />
              <Row label="To win" value={`$${formatUsdc(est.payout, 2)}`} tone="yes" />
              <Row label="Potential profit" value={`$${formatUsdc(est.profit, 2)}`} tone="yes" />
            </>
          ) : (
            <Row label="Est. you receive" value={`$${formatUsdc(est.out, 2)}`} tone="yes" />
          )}
          <p className="pt-1 text-[11px] text-muted">Includes 2% fee · max 1% slippage</p>
        </div>
      )}

      <Button
        className={`mt-4 w-full ${side === 'YES' ? 'bg-yes hover:bg-yes/90' : 'bg-no hover:bg-no/90'}`}
        onClick={() => void submit()}
        loading={busy}
        disabled={!tradable || !amount}
      >
        {!tradable ? 'Market closed' : `${mode === 'BUY' ? 'Buy' : 'Sell'} ${side}`}
      </Button>

      {msg && <p className="mt-3 text-xs text-yes">{msg}</p>}
      {err && <p className="mt-3 break-words text-xs text-no">{err}</p>}

      <div className="mt-4 border-t border-border pt-3 text-xs text-muted">
        Pool liquidity: ${formatUsdc(market.usdc_reserve ?? '0', 0)} · Implied YES{' '}
        {priceToCents(market.yes_price ?? '5000000').toFixed(0)}¢
      </div>
    </Card>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'yes' }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className={tone === 'yes' ? 'font-medium text-yes' : 'font-medium'}>{value}</span>
    </div>
  );
}
