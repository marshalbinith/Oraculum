'use client';

/**
 * Self-contained Freighter wallet panel: detect → connect → balance → send.
 * Renders every Level-1 step visibly for a reviewer.
 */
import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  LogOut,
  RefreshCw,
  Send,
  Wallet,
} from 'lucide-react';
import { detectFreighter } from '@/lib/stellar-wallet';
import { useWallet } from '@/hooks/use-stellar-wallet';

type TxResult =
  | { ok: true; hash: string }
  | { ok: false; message: string }
  | null;

const EXPLORER_TX = 'https://stellar.expert/explorer/testnet/tx';

export function StellarWalletPanel() {
  const {
    address,
    balance,
    isConnected,
    isLoading,
    error,
    connect,
    disconnect,
    refreshBalance,
    sendXlm,
  } = useWallet();

  const [hasFreighter, setHasFreighter] = useState<boolean | null>(null);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [tx, setTx] = useState<TxResult>(null);
  const [copied, setCopied] = useState(false);

  // Detect the Freighter extension on mount.
  useEffect(() => {
    detectFreighter()
      .then(setHasFreighter)
      .catch(() => setHasFreighter(false));
  }, []);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setTx(null);
    if (!to.trim() || !amount.trim()) {
      setTx({ ok: false, message: 'Enter both a destination address and an amount.' });
      return;
    }
    if (Number(amount) <= 0 || Number.isNaN(Number(amount))) {
      setTx({ ok: false, message: 'Amount must be a positive number.' });
      return;
    }
    setSending(true);
    try {
      const res = await sendXlm(to.trim(), amount.trim());
      setTx({ ok: true, hash: res.hash });
      setTo('');
      setAmount('');
    } catch (err) {
      setTx({ ok: false, message: err instanceof Error ? err.message : 'Transaction failed' });
    } finally {
      setSending(false);
    }
  }

  function copyAddress() {
    if (!address) return;
    void navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  // ── Detecting ────────────────────────────────────────────────
  if (hasFreighter === null) {
    return (
      <div className="card flex items-center gap-3 p-6 text-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
        Checking for Freighter…
      </div>
    );
  }

  // ── Not installed ────────────────────────────────────────────
  if (!hasFreighter) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Wallet className="h-5 w-5 text-primary" />
          Freighter not detected
        </div>
        <p className="mt-2 text-sm text-muted">
          The Freighter browser extension is required to connect a Stellar wallet.
        </p>
        <a
          href="https://freighter.app"
          target="_blank"
          rel="noreferrer"
          className="btn-primary mt-4"
        >
          Install Freighter
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Connection card */}
      <div className="card p-6">
        <div className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Wallet className="h-5 w-5 text-primary" />
          Wallet
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
            Testnet
          </span>
        </div>

        {!isConnected ? (
          <button onClick={() => void connect()} disabled={isLoading} className="btn-primary">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            Connect Wallet
          </button>
        ) : (
          <div className="space-y-4">
            {/* Address */}
            <div>
              <div className="text-xs uppercase tracking-wide text-muted">Address</div>
              <div className="mt-1 flex items-center gap-2">
                <code className="break-all rounded-lg bg-surface-2 px-3 py-2 text-sm text-white">
                  {address}
                </code>
                <button
                  onClick={copyAddress}
                  title="Copy address"
                  className="btn-ghost shrink-0 px-2 py-2"
                >
                  {copied ? (
                    <CheckCircle2 className="h-4 w-4 text-yes" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Balance */}
            <div>
              <div className="text-xs uppercase tracking-wide text-muted">Balance</div>
              <div className="mt-1 flex items-center gap-3">
                <span className="text-2xl font-bold tabular-nums">
                  {balance === null ? '—' : `${balance} XLM`}
                </span>
                <button
                  onClick={() => void refreshBalance()}
                  disabled={isLoading}
                  className="btn-ghost px-3 py-1.5 text-sm"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
              {balance === '0' && (
                <p className="mt-1 text-xs text-amber-400">
                  0 XLM — account not funded. Fund it from the{' '}
                  <a
                    href="https://friendbot.stellar.org"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    testnet friendbot
                  </a>
                  .
                </p>
              )}
            </div>

            <button onClick={disconnect} className="btn-ghost">
              <LogOut className="h-4 w-4" />
              Disconnect
            </button>
          </div>
        )}

        {error && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-no/10 px-3 py-2 text-sm text-no">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
      </div>

      {/* Send card */}
      {isConnected && (
        <div className="card p-6">
          <div className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Send className="h-5 w-5 text-primary" />
            Send XLM
          </div>
          <form onSubmit={handleSend} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">
                Destination address
              </label>
              <input
                className="input"
                placeholder="G…"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                disabled={sending}
                spellCheck={false}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">
                Amount (XLM)
              </label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.0000001"
                placeholder="0.0000000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={sending}
              />
            </div>
            <button type="submit" disabled={sending} className="btn-primary w-full">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? 'Sending…' : 'Send XLM'}
            </button>
          </form>

          {/* Tx feedback */}
          {tx?.ok && (
            <div className="mt-4 rounded-lg bg-yes/10 px-3 py-3 text-sm text-yes">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                Transaction sent!
              </div>
              <div className="mt-1 break-all text-yes/90">Hash: {tx.hash}</div>
              <a
                href={`${EXPLORER_TX}/${tx.hash}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 underline"
              >
                View on Stellar Expert
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}
          {tx && !tx.ok && (
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-no/10 px-3 py-2 text-sm text-no">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {tx.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
