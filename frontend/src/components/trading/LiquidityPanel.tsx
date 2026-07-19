'use client';

import { useCallback, useEffect, useState } from 'react';
import { Droplets } from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';
import {
  StellarPredictClient,
  getUserPosition,
  type UserPosition,
} from '@/lib/contracts/client';
import { formatUsdc, usdcToStroops } from '@/lib/format';
import type { Market } from '@/lib/types';
import { useWallet } from '@/stores/wallet';

/**
 * Liquidity provision panel. While a market is OPEN, LPs deposit USDC and mint
 * LP shares (proportional to the pool, so the price is unaffected). After the
 * market resolves, LPs burn their shares to redeem their pro-rata USDC + fees.
 */
export function LiquidityPanel({ market, onDone }: { market: Market; onDone: () => void }) {
  const { address, sign } = useWallet();
  const [amount, setAmount] = useState('');
  const [pct, setPct] = useState(100);
  const [pos, setPos] = useState<UserPosition | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const open = market.status === 'OPEN';
  const resolved =
    market.status === 'RESOLVED_YES' ||
    market.status === 'RESOLVED_NO' ||
    market.status === 'INVALID';

  const refreshPos = useCallback(async () => {
    if (!address) {
      setPos(null);
      return;
    }
    try {
      setPos(await getUserPosition(market.contract_address, address));
    } catch {
      setPos(null);
    }
  }, [address, market.contract_address]);

  useEffect(() => {
    void refreshPos();
  }, [refreshPos, market.status]);

  // Pool figures (all 10^7 scaled). Estimated LP shares for an add follow the
  // contract's rule: lp_to_mint = total_lp * usdc / usdc_reserve.
  const totalLp = BigInt(market.total_lp_supply ?? '0');
  const usdcReserve = BigInt(market.usdc_reserve ?? '0');
  const addStroops = amount ? usdcToStroops(amount) : 0n;
  const estShares = usdcReserve > 0n ? (totalLp * addStroops) / usdcReserve : 0n;
  const lpBalance = pos?.lp_balance ?? 0n;
  const ownershipPct = totalLp > 0n ? Number((lpBalance * 1_000_000n) / totalLp) / 10000 : 0;
  const withdrawShares = (lpBalance * BigInt(pct)) / 100n;

  async function run(fn: () => Promise<string>) {
    if (!address) {
      setErr('Connect your wallet first');
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const hash = await fn();
      setMsg(`Confirmed: ${hash.slice(0, 8)}…`);
      setAmount('');
      await refreshPos();
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Transaction failed');
    } finally {
      setBusy(false);
    }
  }

  function add() {
    const client = new StellarPredictClient(sign);
    return run(() =>
      client.addLiquidity(market.contract_address, address!, usdcToStroops(amount || '0')),
    );
  }

  function withdraw() {
    if (lpBalance <= 0n) {
      setErr('You have no LP shares to withdraw');
      return;
    }
    const shares = withdrawShares > 0n ? withdrawShares : lpBalance;
    const client = new StellarPredictClient(sign);
    return run(() => client.withdrawLiquidity(market.contract_address, address!, shares));
  }

  return (
    <Card>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Droplets className="h-4 w-4 text-primary" />
        Liquidity
      </h3>

      <div className="mb-4 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
        <div className="flex justify-between">
          <span>Your LP shares</span>
          <span className="text-white">{formatUsdc(lpBalance, 2)}</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span>Pool ownership</span>
          <span className="text-white">{ownershipPct.toFixed(2)}%</span>
        </div>
      </div>

      {open && (
        <>
          <label className="mb-1 block text-xs text-muted">Add liquidity (USDC)</label>
          <Input
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <p className="mt-2 text-xs text-muted">
            You receive ≈ <span className="text-white">{formatUsdc(estShares, 2)}</span> LP shares.
            Adding liquidity is proportional and does not move the price.
          </p>
          <Button
            className="mt-4 w-full"
            onClick={() => void add()}
            loading={busy}
            disabled={!address || !amount || estShares <= 0n}
          >
            {address ? 'Add liquidity' : 'Connect wallet'}
          </Button>
        </>
      )}

      {resolved && (
        <>
          <label className="mb-1 block text-xs text-muted">Withdraw liquidity</label>
          <div className="flex gap-1">
            {[25, 50, 100].map((p) => (
              <button
                key={p}
                onClick={() => setPct(p)}
                className={`flex-1 rounded px-2 py-1 text-xs ${
                  pct === p ? 'bg-primary text-white' : 'bg-surface-2 text-muted'
                }`}
              >
                {p}%
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Burns <span className="text-white">{formatUsdc(withdrawShares, 2)}</span> LP shares for
            your pro-rata USDC plus accrued fees.
          </p>
          <Button
            className="mt-4 w-full"
            onClick={() => void withdraw()}
            loading={busy}
            disabled={!address || lpBalance <= 0n}
          >
            {lpBalance > 0n ? 'Withdraw liquidity' : 'No LP shares'}
          </Button>
        </>
      )}

      {!open && !resolved && (
        <p className="text-xs text-muted">
          Liquidity actions are unavailable while the market is {market.status.toLowerCase()}.
        </p>
      )}

      {msg && <p className="mt-3 text-xs text-yes">{msg}</p>}
      {err && <p className="mt-3 break-words text-xs text-no">{err}</p>}
    </Card>
  );
}
