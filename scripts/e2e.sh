#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# StellarPredict — Phase 10 end-to-end integration test (Testnet).
#
# Drives the full market lifecycle against a live deployment and asserts the
# on-chain state at each step:
#
#   deploy → create → trade (buy YES / buy NO) → add liquidity        [phase A]
#   → wait for expiry → submit oracle price → lock → resolve → claim   [phase B]
#   → withdraw liquidity
#
# The factory enforces a minimum market duration (MIN_DURATION = 1h), so the
# market cannot expire sooner than an hour out. Phase A runs and asserts
# immediately; phase B needs the market to have expired. If the wait exceeds
# MAX_WAIT_SECS the script defers phase B and prints how to resume it later:
#
#   RESOLVE_MARKET=<market_addr> bash scripts/e2e.sh [identity]
#
# Self-contained: creates/funds the deployer/trader/lp identities and runs
# scripts/deploy.sh automatically if .env.deployed is absent.
#
# Usage:  bash scripts/e2e.sh [deployer_identity]
# Env:    EXPIRY_SECS    market lifetime before expiry (default 3660, min 3600)
#         MAX_WAIT_SECS  max seconds to sleep for expiry before deferring (900)
#         REUSE_DEPLOY=1 reuse an existing .env.deployed
#         RESOLVE_MARKET resume phase B on this (already-traded) market address
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

IDENTITY="${1:-deployer}"
TRADER="e2e_trader"
LP="e2e_lp"
NETWORK="testnet"
EXPIRY_SECS="${EXPIRY_SECS:-3660}"
MAX_WAIT_SECS="${MAX_WAIT_SECS:-900}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Resolve CLI (soroban was renamed to stellar). ───────────────────────────
if command -v stellar >/dev/null 2>&1; then CLI="stellar"
elif command -v soroban >/dev/null 2>&1; then CLI="soroban"
else echo "❌ Stellar CLI not found" >&2; exit 1; fi

# ── Assertion bookkeeping ─────────────────────────────────────────────────
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✅ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ❌ $1"; }
assert_eq()  { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1: expected '$3', got '$2'"; fi; }
assert_gt()  { if [ "$2" -gt "$3" ] 2>/dev/null; then ok "$1 ($2 > $3)"; else bad "$1: '$2' not > '$3'"; fi; }

# ── CLI helpers ───────────────────────────────────────────────────────────
addr()   { $CLI keys address "$1"; }
# Read a numeric/string field out of a JSON struct emitted by a read call.
jget()   { echo "$1" | grep -oE "\"$2\"[[:space:]]*:[[:space:]]*\"?-?[0-9A-Za-z_]+\"?" | head -1 | sed -E 's/.*:[[:space:]]*//; s/"//g'; }
# invoke <identity> <contract_id> <args...>
invoke() { local who="$1" id="$2"; shift 2; $CLI contract invoke --id "$id" --source "$who" --network "$NETWORK" -- "$@"; }
# read <contract_id> <fn> <args...>  (uses deployer as signer; reads are free)
rd()     { local id="$1"; shift; $CLI contract invoke --id "$id" --source "$IDENTITY" --network "$NETWORK" -- "$@" 2>/dev/null; }

# ── 0. Identities ─────────────────────────────────────────────────────────
echo "▶ Ensuring identities (deployer/trader/lp)…"
for who in "$IDENTITY" "$TRADER" "$LP"; do
  if ! $CLI keys address "$who" >/dev/null 2>&1; then
    $CLI keys generate "$who" --network "$NETWORK" --fund
  else
    $CLI keys fund "$who" --network "$NETWORK" >/dev/null 2>&1 || true
  fi
done
ADMIN="$(addr "$IDENTITY")"; TRADER_ADDR="$(addr "$TRADER")"; LP_ADDR="$(addr "$LP")"
echo "  admin=$ADMIN"; echo "  trader=$TRADER_ADDR"; echo "  lp=$LP_ADDR"

# ── 1. Deploy (or reuse) ──────────────────────────────────────────────────
if [ -n "${RESOLVE_MARKET:-}" ] || { [ "${REUSE_DEPLOY:-0}" = "1" ] && [ -f "$ROOT/.env.deployed" ]; }; then
  [ -f "$ROOT/.env.deployed" ] || { echo "❌ .env.deployed missing; cannot reuse/resume" >&2; exit 1; }
  echo "▶ Reusing existing .env.deployed"
else
  echo "▶ Running full deployment…"
  bash "$ROOT/scripts/deploy.sh" "$IDENTITY"
fi
source "$ROOT/.env.deployed"

# ══════════════════════════════════════════════════════════════════════════
# PHASE A — create market, trade, provide liquidity (skipped when resuming)
# ══════════════════════════════════════════════════════════════════════════
if [ -n "${RESOLVE_MARKET:-}" ]; then
  MARKET="$RESOLVE_MARKET"
  echo "▶ Resuming phase B on market $MARKET"
else
  NOW="$(date +%s)"; EXPIRY="$((NOW + EXPIRY_SECS))"

  # Settlement is REAL Circle USDC — it cannot be minted (the SAC requires the
  # issuer's auth). Ensure each account has a USDC trustline, then verify it
  # holds enough; if not, point to the faucet and stop (rather than fail on a
  # mint that can never succeed). Amounts below are sized for the 20 USDC/2h
  # faucet and the factory's 1 USDC fee + 10 USDC min liquidity.
  USDC_ISSUER="${USDC_ISSUER:-GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5}"
  usdc_bal() { rd "$USDC_TOKEN_ADDRESS" balance --id "$1" | tr -d '"'; }
  echo "▶ Ensuring USDC trustlines (real Circle USDC)…"
  for who in "$IDENTITY" "$TRADER" "$LP"; do
    $CLI tx new change-trust --source "$who" --line "USDC:$USDC_ISSUER" --network "$NETWORK" >/dev/null 2>&1 || true
  done
  underfunded=0
  check_funded() { # <label> <addr> <min_stroops>
    local bal; bal="$(usdc_bal "$2")"; bal="${bal:-0}"
    if [ "$bal" -lt "$3" ] 2>/dev/null; then
      echo "  ⚠ $1 ($2): $bal stroops USDC, needs $3"; underfunded=1
    else
      echo "  ✓ $1 funded: $bal stroops USDC"
    fi
  }
  check_funded "creator" "$ADMIN"       160000000   # 16 USDC (1 fee + 15 liquidity)
  check_funded "trader"  "$TRADER_ADDR"  10000000   # 1 USDC
  check_funded "lp"      "$LP_ADDR"       50000000   # 5 USDC
  if [ "$underfunded" -eq 1 ]; then
    echo ""
    echo "─────────────────────────────────────────"
    echo "Real Circle USDC cannot be minted. Fund the account(s) above via the"
    echo "Circle testnet faucet, then re-run this script:"
    echo "  https://faucet.circle.com   (select Stellar · Testnet)"
    echo "─────────────────────────────────────────"
    exit 1
  fi

  # The Stellar CLI wants u64 fields (resolution_timestamp) as JSON *numbers*
  # and i128 fields (threshold) as JSON *strings*.
  CONDITION=$(cat <<JSON
{ "feed_id": "XLM_USD_PRICE", "comparison": "Gt", "threshold": "1000000", "resolution_timestamp": $EXPIRY }
JSON
)
  echo "▶ Creating market (expiry in ${EXPIRY_SECS}s, ts=$EXPIRY)…"
  MARKET="$(invoke "$IDENTITY" "$FACTORY_ADDRESS" create_market \
    --creator "$ADMIN" \
    --question "E2E: Will XLM/USD be above \$0.10?" \
    --description "Phase 10 end-to-end test market" \
    --expiry_timestamp "$EXPIRY" \
    --condition "$CONDITION" \
    --initial_usdc 150000000 \
    --initial_yes_price_bps 5000 | tr -d '"')"
  echo "  MARKET = $MARKET"
  [ -n "$MARKET" ] && ok "market deployed" || { bad "market not created"; exit 1; }
  echo "MARKET_ADDRESS=$MARKET"   >> "$ROOT/.env.deployed"
  echo "MARKET_EXPIRY=$EXPIRY"    >> "$ROOT/.env.deployed"

  assert_eq "status is Open" "$(rd "$MARKET" get_status | tr -d '"')" "Open"

  # ── Trades ───────────────────────────────────────────────────────────────
  # Trades are capped at max_single_trade_pct (10%) of the USDC reserve
  # (15 USDC initial → 1.5 USDC cap), so keep each trade well under that.
  PRICE0="$(jget "$(rd "$MARKET" get_amm_state)" yes_price)"
  echo "▶ Trader buys YES (0.5 USDC)…"
  invoke "$TRADER" "$MARKET" buy_yes --trader "$TRADER_ADDR" --usdc_in 5000000 --min_yes_out 1 >/dev/null
  PRICE1="$(jget "$(rd "$MARKET" get_amm_state)" yes_price)"
  POS="$(rd "$MARKET" get_user_position --user "$TRADER_ADDR")"
  assert_gt "trader holds YES" "$(jget "$POS" yes_balance)" 0
  assert_gt "YES price rose after buy" "$PRICE1" "$PRICE0"

  echo "▶ Trader buys NO (0.3 USDC)…"
  invoke "$TRADER" "$MARKET" buy_no --trader "$TRADER_ADDR" --usdc_in 3000000 --min_no_out 1 >/dev/null
  assert_gt "trader holds NO" "$(jget "$(rd "$MARKET" get_user_position --user "$TRADER_ADDR")" no_balance)" 0

  # ── Liquidity ────────────────────────────────────────────────────────────
  echo "▶ LP adds liquidity (5 USDC)…"
  invoke "$LP" "$MARKET" add_liquidity --provider "$LP_ADDR" --usdc_amount 50000000 >/dev/null
  assert_gt "LP holds shares" "$(jget "$(rd "$MARKET" get_user_position --user "$LP_ADDR")" lp_balance)" 0
fi

# ══════════════════════════════════════════════════════════════════════════
# PHASE B — wait for expiry, resolve, claim, withdraw
# ══════════════════════════════════════════════════════════════════════════
EXPIRY="$(jget "$(rd "$MARKET" get_market_info)" expiry_timestamp)"
NOW="$(date +%s)"; WAIT=$((EXPIRY - NOW + 5))
if [ "$WAIT" -gt 0 ]; then
  if [ "$WAIT" -gt "$MAX_WAIT_SECS" ]; then
    echo ""
    echo "─────────────────────────────────────────"
    echo "Phase A: $PASS passed, $FAIL failed."
    echo "Market expires in ${WAIT}s (> MAX_WAIT_SECS=${MAX_WAIT_SECS}); deferring resolution."
    echo "Resume phase B after expiry with:"
    echo "  RESOLVE_MARKET=$MARKET bash scripts/e2e.sh $IDENTITY"
    echo "─────────────────────────────────────────"
    [ "$FAIL" -eq 0 ] || exit 1
    exit 0
  fi
  echo "▶ Waiting ${WAIT}s for expiry…"; sleep "$WAIT"
fi

echo "▶ Submitting oracle price (XLM/USD = \$0.12 > threshold)…"
invoke "$IDENTITY" "$ORACLE_REGISTRY_ADDRESS" submit_price \
  --operator "$ADMIN" --feed_id XLM_USD_PRICE --price 1200000 --confidence 0 --timestamp "$EXPIRY" >/dev/null

echo "▶ Locking + resolving market…"
invoke "$IDENTITY" "$MARKET" lock_market >/dev/null
assert_eq "status is Locked" "$(rd "$MARKET" get_status | tr -d '"')" "Locked"
invoke "$IDENTITY" "$MARKET" request_resolution >/dev/null
assert_eq "resolved YES (price > threshold)" "$(rd "$MARKET" get_status | tr -d '"')" "ResolvedYes"

echo "▶ Trader claims reward…"
PAYOUT="$(invoke "$TRADER" "$MARKET" claim_reward --claimer "$TRADER_ADDR" | tr -d '"')"
assert_gt "trader payout > 0" "$PAYOUT" 0
assert_eq "position marked claimed" "$(jget "$(rd "$MARKET" get_user_position --user "$TRADER_ADDR")" claimed)" "true"

echo "▶ LP withdraws liquidity…"
LP_SHARES="$(jget "$(rd "$MARKET" get_user_position --user "$LP_ADDR")" lp_balance)"
if [ "${LP_SHARES:-0}" -gt 0 ] 2>/dev/null; then
  invoke "$LP" "$MARKET" withdraw_liquidity --provider "$LP_ADDR" --lp_amount "$LP_SHARES" >/dev/null
  assert_eq "LP shares burned to 0" "$(jget "$(rd "$MARKET" get_user_position --user "$LP_ADDR")" lp_balance)" "0"
else
  echo "  (no LP shares to withdraw — skipping)"
fi

# ── Summary ───────────────────────────────────────────────────────────────
echo ""
echo "─────────────────────────────────────────"
echo "E2E result:  $PASS passed, $FAIL failed"
echo "─────────────────────────────────────────"
[ "$FAIL" -eq 0 ] || exit 1
echo "✅ All end-to-end assertions passed."
