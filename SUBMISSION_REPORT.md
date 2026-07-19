# StellarPredict — Submission & Production-Readiness Report

**Product:** StellarPredict (repo: `Oraculum`) — AMM prediction markets on Stellar Soroban
**Report generated:** 2026-07-18
**Method:** Every "✅ Verified" item below was executed on this machine and its real
output captured. Items that cannot be truthfully verified from this environment are
marked **⛔ Blocked** with the reason — none are fabricated.

> Toolchain used: `rustc 1.93.0`, `cargo 1.93.0`, `stellar-cli 25.0.0`,
> Node (frontend build), `@stellar/stellar-sdk 12.3.0`, `@stellar/freighter-api 3.1.0`.

---

## 1. Executive Summary

StellarPredict is a monorepo comprising a 7-crate Soroban contract workspace, a
Node/TypeScript indexer + REST/WebSocket API, and a Next.js 14 frontend. On this
machine I verified:

- **Contracts:** `cargo test --workspace` → **62 passed / 0 failed**; both the
  deployable (`wasm32v1-none`) and CI (`wasm32-unknown-unknown`) release builds
  compile clean.
- **On-chain:** the factory contract at `CDEKLDCX…6UQX` is **live on testnet** — its
  interface was downloaded directly from the chain. Two locally-built wasm hashes
  **match** the recorded deployment hashes exactly.
- **Frontend:** `npm run lint` clean, `npm run test` **4/4 passed**, `npm run build`
  succeeds for all 10 routes.
- **CI/CD:** `.github/workflows/ci.yml` and `deploy.yml` authored to spec and every
  local command they run has been exercised successfully.

**Blocked (environmental, not code):** this working copy is **not a git repository and
has no GitHub remote or secrets**, so GitHub Actions runs cannot be triggered or
confirmed from here, and no *new* deployment transaction was broadcast (no funded
secret key available). See §13.

---

## 2. Architecture Review

```
Oraculum/
├─ Cargo.toml / Cargo.lock       Rust workspace (7 contract crates)   ✅ present
├─ Makefile                      build / test / deploy targets        ✅ added
├─ contracts/
│  ├─ oracle_registry/           price feed registry + attestations
│  ├─ token_base/                shared SEP-41 token logic
│  ├─ yes_token/ no_token/ lp_token/   SEP-41 outcome & LP tokens
│  ├─ market/                    CPMM AMM + settlement (core)
│  └─ factory/                   market deployment + registry
├─ backend/                      indexer + REST API + WebSocket (Node/TS)
├─ frontend/                     Next.js 14 app (TypeScript, Tailwind)
├─ scripts/                      testnet setup / deploy / e2e (bash)
└─ .github/workflows/            ci.yml + deploy.yml                   ✅ added
```

Design notes: all USDC/prices are 10^7-scaled integers (stroop precision); fees and
probabilities are basis points; contracts use checked arithmetic (`overflow-checks =
true` in the release profile), `panic = "abort"`, `lto = true`. No `f64` on-chain.

---

## 3. Smart Contract Audit

| Crate | lib.rs | tests | Tests passing |
|---|---|---|---|
| oracle_registry | ✅ | src/test.rs | 15 |
| token_base | ✅ | inline (shared lib) | 0 (exercised via yes/no/lp) |
| yes_token | ✅ | src/test.rs | 12 |
| no_token | ✅ | src/test.rs | 2 |
| lp_token | ✅ | src/test.rs | 2 |
| market | ✅ | src/test.rs | 22 |
| factory | ✅ | src/test.rs | 9 |
| **Total** | | | **62** |

Verified properties (from passing tests): CPMM invariant & slippage bounds, min-out
protection on buy/sell, oracle attestation + resolution, permissioned admin ops,
SEP-41 token semantics, factory market creation & registry pagination.

---

## 4. Frontend Audit

- **Stack:** Next.js 14.2.5 (App Router), TypeScript (strict), Tailwind.
- **Contract integration:** `lib/contracts/client.ts` (typed calls) + new generic
  `lib/contract.ts` (`callContractFunction` / `readContractFunction`). Contract
  functions are invoked from `components/trading/TradePanel.tsx`,
  `LiquidityPanel.tsx`, `app/(app)/markets/create/page.tsx`, and
  `app/(app)/markets/[market_id]/page.tsx`.
- **Wallet:** Freighter integration (`lib/stellar-wallet.ts`, `lib/stellar-sdk.ts`,
  `hooks/use-stellar-wallet.ts`, `/wallet` page) — detect → connect → balance → send.
- **Lint:** ✅ `next lint` → *No ESLint warnings or errors* (ESLint config added).
- **Type safety:** ✅ `tsc --noEmit` → 0 errors.
- **Unit tests:** ✅ Vitest 4/4 passing (`src/lib/format.test.ts`).

---

## 5. CI/CD Audit

**`.github/workflows/ci.yml`**
- `contracts` job: checkout → `dtolnay/rust-toolchain@stable` (+`wasm32-unknown-unknown`)
  → `cargo test --workspace` → `cargo build --target wasm32-unknown-unknown --release`.
- `frontend` job (working-directory `frontend`): `npm ci` → `npm run lint` →
  `npm run build` → `npm run test`. Package manager = **npm** (repo has
  `package-lock.json`).

**`.github/workflows/deploy.yml`** (on push to `main`)
- `deploy-contract`: install `stellar-cli`, `stellar contract build` (deployable
  `wasm32v1-none`), `stellar contract deploy --wasm …/factory.wasm --source
  ${{ secrets.STELLAR_SECRET_KEY }} --network testnet`.
- `deploy-frontend`: `needs: [deploy-contract]`, `npm ci` → `npm run build` with
  `NEXT_PUBLIC_CONTRACT_ID` / `NEXT_PUBLIC_SOROBAN_RPC_URL` /
  `NEXT_PUBLIC_NETWORK_PASSPHRASE` from secrets → `npx vercel --prod --token
  ${{ secrets.VERCEL_TOKEN }} --yes` (Vercel = default; no platform was pre-configured).

> Deviation from the literal spec, on purpose: the CD build target is `wasm32v1-none`,
> not `wasm32-unknown-unknown`. Per this repo's README, the default target emits
> reference-types the Soroban host VM rejects, so it is **not deployable**. CI keeps
> `wasm32-unknown-unknown` as a fast compile gate; CD uses the deployable target.

---

## 6. Testing Report

| Suite | Command | Result |
|---|---|---|
| Contracts | `cargo test --workspace` | ✅ 62 passed, 0 failed |
| Frontend unit | `npm run test` (vitest) | ✅ 4 passed |
| Frontend lint | `npm run lint` | ✅ clean |
| Frontend types | `tsc --noEmit` | ✅ 0 errors |

Gap: there are **no frontend behavioral/E2E tests** (only pure-function unit tests +
type/lint gates). A bash integration script exists at `scripts/e2e.sh` (on-chain
deploy→trade→resolve→claim) but requires a funded identity and was not run here. See §13.

---

## 7. Deployment Verification

✅ **The deployed factory is live on Stellar testnet.** `stellar contract info
interface --id CDEKLDCX…6UQX --network testnet` downloaded the contract spec from chain
(exit 0), exposing `create_market`, `list_markets`, `get_market`, `get_config`,
`get_market_count`, `initialize`, `upgrade` — matching the frontend client.

✅ **Local build ↔ deployment hash match:**
- `market.wasm` sha256 `ed515adc…f6c493` == `MARKET_WASM_HASH` in `.env.deployed`
- `yes_token.wasm` sha256 `8e68e864…3ea1f8` == `TOKEN_WASM_HASH` in `.env.deployed`

---

## 8. Contract Deployment Addresses (testnet)

| Contract | Address |
|---|---|
| Factory | `CDEKLDCXKX33UR4UMWGUSI4YD4S4XHXAGU4X3QML4PDQC2EZW65M6UQX` |
| Oracle Registry | `CDMBKX5PJLPMOTGY7GORTH5CLXKP755AYRAEWYP4SLI4K7UXSRNBG47V` |
| USDC (real Circle testnet SAC) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| USDC issuer | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |
| Admin | `GCOJ7BMTKNNLMJGHX6C6IE5HL3BS6KIGJ74KGNMM7XSQFFUKGJCMZQQZ` |

Market/token wasm code hashes (installed on-chain):
`MARKET_WASM_HASH = ed515adc6c51fbb04cbda6c81e57a6e6030c008a6c4b791210835b6a35f6c493`,
`TOKEN_WASM_HASH = 8e68e86468eb9d4d33159f3f541687ee31af6c6b324ce65c275e08615a3ea1f8`.

---

## 9. Transaction Hashes

⛔ **The original deployment transaction hashes are not recorded in the repo**, and I
will not fabricate them. Deployment is instead verified by (a) the live on-chain
contract interface fetch (§7) and (b) the wasm-hash match against `.env.deployed`.
The `deploy-contract` CD job prints the deploy tx hash in its logs; capturing it there
is the durable place to record future hashes. A fresh on-chain broadcast from here is
blocked (no funded secret key in this environment).

---

## 10. Test Outputs (verbatim excerpts)

```
# cargo test --workspace
test result: ok. 15 passed; 0 failed  (oracle_registry)
test result: ok. 12 passed; 0 failed  (yes_token)
test result: ok.  2 passed; 0 failed  (no_token)
test result: ok.  2 passed; 0 failed  (lp_token)
test result: ok. 22 passed; 0 failed  (market)
test result: ok.  9 passed; 0 failed  (factory)
→ 62 passed, 0 failed

# npm run test  (vitest run)
✓ src/lib/format.test.ts (4 tests) 56ms
Test Files  1 passed (1)
     Tests  4 passed (4)

# npm run lint
✔ No ESLint warnings or errors
```

---

## 11. Build Outputs

**Deployable wasm (`target/wasm32v1-none/release/`):**

```
oracle_registry.wasm   23,186 B  sha256 7ab66774…c8c010
yes_token.wasm         15,452 B  sha256 8e68e864…3ea1f8   ← matches deployed
no_token.wasm          15,324 B  sha256 f9a0a81e…e28d4e
lp_token.wasm          15,324 B  sha256 f9a0a81e…e28d4e
market.wasm            54,584 B  sha256 ed515adc…f6c493   ← matches deployed
factory.wasm           30,298 B  sha256 810f68c8…abedca
```

**CI compile gate (`cargo build --target wasm32-unknown-unknown --release`):** ✅ exit 0,
all 6 wasm produced.

**Frontend (`npm run build`):** ✅ exit 0. Routes: `/`, `/dashboard`, `/markets`,
`/markets/create`, `/markets/[market_id]`, `/lp`, `/portfolio`, `/leaderboard`,
`/wallet`, `/_not-found` (10 total).

---

## 12. Documentation Review

- Root `README.md` ✅ (build phases, quick-start, precision conventions).
- `Makefile` ✅ (added: `build`, `test`, `deploy`, `fmt`, `clean`).
- `.env.example` (backend) and `.env.deployed` ✅ present.
- This `SUBMISSION_REPORT.md` ✅.

---

## 13. Production-Readiness Assessment

| Area | Status |
|---|---|
| Contract correctness (62 tests) | ✅ Ready |
| Deployable wasm builds | ✅ Ready |
| Contracts live on testnet | ✅ Verified |
| Frontend build/lint/type/unit | ✅ Ready |
| CI workflow (authored + steps exercised) | ✅ Ready |
| CD workflow (authored, secrets-gated) | 🟡 Template ready, not executed |
| GitHub Actions green runs | ⛔ Blocked — not a git repo / no remote |
| New deploy tx hash | ⛔ Blocked — no funded secret key here |
| Frontend E2E/behavioral tests | 🟡 Gap (only unit + gates) |
| Mainnet readiness | 🟡 Testnet-only by design |

**To finish the GitHub-side requirements (needs your action / credentials):**

```bash
cd C:/Oraculum
git init && git add -A && git commit -m "StellarPredict: contracts, app, CI/CD, report"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
# In GitHub → Settings → Secrets: add STELLAR_SECRET_KEY, NEXT_PUBLIC_CONTRACT_ID,
# NEXT_PUBLIC_SOROBAN_RPC_URL, NEXT_PUBLIC_NETWORK_PASSPHRASE, VERCEL_TOKEN
```
CI runs on that push; CD runs once the secrets exist.

---

## 14. Remaining Risks

1. **CD unexecuted** — the deploy workflow is correct-by-construction but has never run
   (no secrets here). First real run should be watched end-to-end.
2. **No frontend E2E tests** — UI regressions (wallet flow, trading) aren't caught
   automatically. `scripts/e2e.sh` covers the on-chain path but needs a funded identity.
3. **Indexer scan-window** — a known issue: the indexer can skip events when its start
   ledger is far from the tip; backfill needs a close start ledger + two passes.
4. **`wasm32-unknown-unknown` is not deployable** for this VM — only the CI compile
   gate uses it; deployment must use `wasm32v1-none` (encoded in CD + Makefile).
5. **Testnet only** — settles in real Circle *testnet* USDC; no mainnet hardening/audit.

---

## 15. Final Checklist Status

**Smart Contract**
- [x] `Cargo.lock` exists (workspace root)
- [x] `Makefile` with build / test / deploy targets (added)
- [x] `README.md` (root)
- [x] `src/lib.rs` with full contract logic (per crate under `contracts/*/src/lib.rs`)
- [x] `src/test.rs` / inline tests (per crate)

**Frontend Integration**
- [x] `lib/stellar-sdk.ts` exists and exports `server` + `networkPassphrase`
- [x] `lib/contract.ts` exists with `callContractFunction`
- [x] A component/page calls a contract function (TradePanel, LiquidityPanel, create, detail)

**CI/CD**
- [x] `ci.yml` has a contracts job: `cargo test` + `cargo build` wasm
- [x] `ci.yml` has a frontend job: install + lint + build + test
- [x] `deploy.yml` has a `deploy-contract` job using `stellar contract deploy`
- [x] `deploy.yml` has a `deploy-frontend` job with env vars from secrets
- [ ] ⛔ Push to main + green Actions runs — **requires your GitHub remote & secrets** (see §13)
