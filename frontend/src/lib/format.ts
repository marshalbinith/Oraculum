/** Display formatting for scaled on-chain integers (all 10^7 precision). */

export const SCALE = 10_000_000n;

/** USDC stroops (10^7) → human string, e.g. 12_500_000_000 → "1,250.00". */
export function formatUsdc(raw: string | bigint | null | undefined, dp = 2): string {
  if (raw == null) return '0.00';
  const v = typeof raw === 'bigint' ? raw : BigInt(raw);
  const whole = v / SCALE;
  const frac = (v % SCALE).toString().padStart(7, '0').slice(0, dp);
  return `${whole.toLocaleString('en-US')}.${frac}`;
}

/** Price scaled by 10^7 (0..1) → percent number, e.g. 7_000_000 → 70. */
export function priceToPercent(raw: string | bigint | null | undefined): number {
  if (raw == null) return 0;
  const v = typeof raw === 'bigint' ? raw : BigInt(raw);
  return Number((v * 10000n) / SCALE) / 100;
}

/** Price scaled by 10^7 → decimal probability, e.g. 7_000_000 → 0.7. */
export function priceToProb(raw: string | bigint | null | undefined): number {
  if (raw == null) return 0;
  const v = typeof raw === 'bigint' ? raw : BigInt(raw);
  return Number(v) / Number(SCALE);
}

/** Price scaled by 10^7 (a 0..1 share price) → cents, e.g. 6_500_000 → 65. */
export function priceToCents(raw: string | bigint | null | undefined): number {
  if (raw == null) return 0;
  const v = typeof raw === 'bigint' ? raw : BigInt(raw);
  return Number(v) / 100_000;
}

/** Render a share price as cents like Polymarket, e.g. 6_500_000 → "65¢". */
export function formatCents(raw: string | bigint | null | undefined, dp = 0): string {
  return `${priceToCents(raw).toFixed(dp)}¢`;
}

/** Convert a human USDC amount string to stroops bigint. */
export function usdcToStroops(amount: string): bigint {
  const [whole = '0', frac = ''] = amount.trim().split('.');
  const fracPadded = (frac + '0000000').slice(0, 7);
  return BigInt(whole || '0') * SCALE + BigInt(fracPadded || '0');
}

export function truncateAddress(addr: string, n = 4): string {
  if (!addr) return '';
  return `${addr.slice(0, n + 1)}…${addr.slice(-n)}`;
}

export function timeUntil(unixSeconds: number): string {
  const diff = unixSeconds - Math.floor(Date.now() / 1000);
  if (diff <= 0) return 'expired';
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
