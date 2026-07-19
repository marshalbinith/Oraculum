/**
 * Client-side CPMM quotes — an exact mirror of the Market contract's buy/sell
 * math, so the trade panel can show instant payout estimates without an RPC
 * round-trip per keystroke. All amounts are 10^7-scaled stroops (USDC and
 * outcome tokens share the same scale).
 */

export type Side = 'YES' | 'NO';

// Mirrors the factory's trading_fee_rate (2%). Kept in sync with the deployed
// config; used only for client-side estimates labelled "Est.".
const FEE_BPS = 200n;
const BPS = 10_000n;

/** USDC in → outcome shares out (buy). Buying YES adds net USDC to the NO
 *  reserve and removes YES (and vice-versa), preserving k = yes·no. */
export function quoteBuyShares(
  yesReserve: bigint,
  noReserve: bigint,
  usdcIn: bigint,
  side: Side,
): bigint {
  if (usdcIn <= 0n || yesReserve <= 0n || noReserve <= 0n) return 0n;
  const net = usdcIn - (usdcIn * FEE_BPS) / BPS;
  const k = yesReserve * noReserve;
  if (side === 'YES') {
    const newNo = noReserve + net;
    return yesReserve - k / newNo;
  }
  const newYes = yesReserve + net;
  return noReserve - k / newYes;
}

/** Outcome shares in → USDC out (sell), net of fee. */
export function quoteSellUsdc(
  yesReserve: bigint,
  noReserve: bigint,
  tokenIn: bigint,
  side: Side,
): bigint {
  if (tokenIn <= 0n || yesReserve <= 0n || noReserve <= 0n) return 0n;
  const k = yesReserve * noReserve;
  let gross: bigint;
  if (side === 'YES') {
    const newYes = yesReserve + tokenIn;
    gross = noReserve - k / newYes;
  } else {
    const newNo = noReserve + tokenIn;
    gross = yesReserve - k / newNo;
  }
  if (gross <= 0n) return 0n;
  return gross - (gross * FEE_BPS) / BPS;
}

/** Apply a slippage tolerance (bps) as a floor on an estimated output. */
export function withSlippage(estimate: bigint, slippageBps: number): bigint {
  return (estimate * BigInt(10_000 - slippageBps)) / BPS;
}
