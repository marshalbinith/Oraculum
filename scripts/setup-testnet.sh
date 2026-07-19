#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# StellarPredict — Testnet tooling setup
# Creates/funds a deployer identity and verifies the toolchain.
# Usage:  bash scripts/setup-testnet.sh [identity_name]
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

IDENTITY="${1:-deployer}"
NETWORK="testnet"

# The CLI was renamed `soroban` -> `stellar` in v21+. Prefer `stellar`.
if command -v stellar >/dev/null 2>&1; then
  CLI="stellar"
elif command -v soroban >/dev/null 2>&1; then
  CLI="soroban"
else
  echo "❌ Neither 'stellar' nor 'soroban' CLI found. Install the Stellar CLI." >&2
  exit 1
fi
echo "✅ Using CLI: $CLI ($($CLI --version | head -1))"

# Ensure the wasm target is installed.
if ! rustup target list --installed | grep -q wasm32-unknown-unknown; then
  echo "→ Installing wasm32-unknown-unknown target…"
  rustup target add wasm32-unknown-unknown
fi
echo "✅ wasm32-unknown-unknown target present"

# Register the testnet network config (idempotent).
$CLI network add "$NETWORK" \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" 2>/dev/null || true

# Create + fund the deployer identity via friendbot.
if ! $CLI keys address "$IDENTITY" >/dev/null 2>&1; then
  echo "→ Generating identity '$IDENTITY'…"
  $CLI keys generate "$IDENTITY" --network "$NETWORK" --fund
else
  echo "→ Identity '$IDENTITY' exists; funding via friendbot…"
  $CLI keys fund "$IDENTITY" --network "$NETWORK" || true
fi

ADDR=$($CLI keys address "$IDENTITY")
echo "✅ Deployer '$IDENTITY' ready: $ADDR"
echo ""
echo "Next: run 'bash scripts/deploy.sh' once contracts are built (Phase 7)."
