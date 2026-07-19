#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# Submit a test oracle price for XLM/USD.
# Usage:  bash scripts/submit-test-price.sh [identity] [price_scaled] [feed]
#   price_scaled defaults to 1200000 ($0.12, scaled 10^7)
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

IDENTITY="${1:-deployer}"
PRICE="${2:-1200000}"
FEED="${3:-XLM_USD_PRICE}"
NETWORK="testnet"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/.env.deployed"

CLI="$(command -v stellar || command -v soroban)"
ADMIN="$($CLI keys address "$IDENTITY")"
NOW="$(date +%s)"

echo "▶ Submitting $FEED = $PRICE (ts=$NOW) as operator $ADMIN…"
$CLI contract invoke --id "$ORACLE_REGISTRY_ADDRESS" --source "$IDENTITY" --network "$NETWORK" -- \
  submit_price \
  --operator "$ADMIN" \
  --feed_id "$FEED" \
  --price "$PRICE" \
  --confidence 0 \
  --timestamp "$NOW"

echo "✅ Price submitted"
