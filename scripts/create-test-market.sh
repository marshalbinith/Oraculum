#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# Create a test XLM/USD market (> $0.10) with 15 USDC initial liquidity.
# Settles in REAL Circle USDC — the creator must already hold testnet USDC
# (fund via https://faucet.circle.com). Requires deploy.sh → .env.deployed.
# Usage:  bash scripts/create-test-market.sh [identity]
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

IDENTITY="${1:-deployer}"
NETWORK="testnet"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/.env.deployed"
USDC_ISSUER="${USDC_ISSUER:-GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5}"

CLI="$(command -v stellar || command -v soroban)"
ADMIN="$($CLI keys address "$IDENTITY")"
invoke() { local id="$1"; shift; $CLI contract invoke --id "$id" --source "$IDENTITY" --network "$NETWORK" -- "$@"; }

# Real Circle USDC can't be minted. Ensure a trustline and that the creator is
# funded (1 USDC fee + 15 USDC liquidity = 16 USDC minimum).
$CLI tx new change-trust --source "$IDENTITY" --line "USDC:$USDC_ISSUER" --network "$NETWORK" >/dev/null 2>&1 || true
BAL="$(invoke "$USDC_TOKEN_ADDRESS" balance --id "$ADMIN" | tr -d '"')"; BAL="${BAL:-0}"
if [ "$BAL" -lt 160000000 ] 2>/dev/null; then
  echo "❌ Creator $ADMIN holds $BAL stroops USDC, needs 160000000 (16 USDC)."
  echo "   Fund it via the Circle testnet faucet: https://faucet.circle.com"
  exit 1
fi
echo "▶ Creator USDC balance: $BAL stroops"

# Resolution: XLM/USD > $0.10, 1 hour out.
NOW="$(date +%s)"
EXPIRY="$((NOW + 3700))"
# The Stellar CLI wants u64 fields (resolution_timestamp) as JSON numbers and
# i128 fields (threshold) as JSON strings.
CONDITION=$(cat <<JSON
{
  "feed_id": "XLM_USD_PRICE",
  "comparison": "Gt",
  "threshold": "1000000",
  "resolution_timestamp": $EXPIRY
}
JSON
)

echo "▶ Creating market (expiry=$EXPIRY)…"
MARKET="$(invoke "$FACTORY_ADDRESS" create_market \
  --creator "$ADMIN" \
  --question "Will XLM/USD be above \$0.10?" \
  --description "Test market" \
  --expiry_timestamp "$EXPIRY" \
  --condition "$CONDITION" \
  --initial_usdc 150000000 \
  --initial_yes_price_bps 5000)"

echo "✅ Market created: $MARKET"
echo "MARKET_ADDRESS=$MARKET" >> "$ROOT/.env.deployed"
