# StellarPredict

[![CI](https://github.com/marshalbinith/Oraculum/actions/workflows/ci.yml/badge.svg)](https://github.com/marshalbinith/Oraculum/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Stellar](https://img.shields.io/badge/Stellar-Soroban%20testnet-7B00FF)](https://stellar.org/soroban)
[![Live demo](https://img.shields.io/badge/demo-oraculumpredict.vercel.app-brightgreen)](https://oraculumpredict.vercel.app)

An AMM-based decentralized **prediction market** protocol on **Stellar Soroban**.
Anyone can open a binary (YES / NO) market on any oracle-backed question; shares
are priced by a constant-product market maker, resolved by an on-chain price
oracle, and settled in real Circle USDC. No order book, no custodian, no
off-chain matching — just liquidity and math, fully on-chain.

**Live demo:** **https://oraculumpredict.vercel.app** · Deployed on Stellar **testnet**.

## Why this pattern

The obvious way to run a prediction market is an **order book**: buyers and
sellers post bids/asks and a matching engine pairs them. On-chain that's a poor
fit — every order is state, matching is unbounded work, and a market with no
resting orders simply can't trade. Thin markets (the common case for a
long-tail question) end up with no liquidity and no price at all.

Instead, `StellarPredict` prices each market with a **constant-product market
maker (CPMM)**, the same `x·y = k` invariant Uniswap uses, adapted to a binary
outcome. Each market keeps two *virtual* reserves in USDC-equivalent units,
`yes_reserve` and `no_reserve`, and the spot price of YES is simply its
complementary reserve's share of the pool:

```
P_yes = no_reserve / (yes_reserve + no_reserve)      (so P_yes + P_no = 1)
```

Because the two prices are forced to sum to 1, each price reads directly as the
market's **implied probability** of that outcome — a market trading YES at
`0.63` is saying "63% likely." There is always a price and always liquidity,
no matter how few participants exist.

A trade moves the reserves while holding the invariant `k = yes_reserve ·
no_reserve` constant. Buying YES pushes net USDC into the *opposite* (NO)
reserve and removes YES tokens from its own side:

```
buy YES:  new_no  = no_reserve  + usdc_net ;  yes_out = yes_reserve - k / new_no
buy NO :  new_yes = yes_reserve + usdc_net ;  no_out  = no_reserve  - k / new_yes
sell YES: new_yes = yes_reserve + yes_in   ;  usdc_gross = no_reserve - k / new_yes
sell NO : new_no  = no_reserve  + no_in    ;  usdc_gross = yes_reserve - k / new_no
```

Each branch recomputes the opposite reserve as `k / new_reserve`, so `k` is
conserved across every trade. Integer division only ever rounds `k` *down*,
which always favors the pool — the contract can never be drained by rounding.
The `sell` formulas are the exact algebraic inverse of `buy`, so a
buy-then-sell round trip (minus fees) returns you to where you started rather
than silently leaking value.

**Fixed-point precision.** All prices and per-token payouts are scaled by
`SCALE = 10^7` (Stellar stroop precision). Without scaling up before dividing,
integer division would round a sub-unit price like `no_reserve / total` down to
zero and lose it entirely; the contract scales up first, then divides back out
at settlement, preserving precision. Fees and probabilities use basis points
(`BPS = 10_000`, i.e. `10000 = 100%`). Arithmetic is checked everywhere and
`f64` is never used on-chain.

**Settlement is pro-rata, so the pool is always solvent.** When a market
resolves, the entire USDC pot is divided among the winning shares by
`reward_per_token = pot / winning_supply`, and each claimer burns their winning
tokens to redeem `redeemable · reward_per_token / SCALE`. Because payout is a
share of whatever the pool actually holds — not a fixed promise — the market
can never owe more than it has, regardless of trade history. If a market
resolves **Invalid**, both YES and NO redeem at a blended rate so no one is
wiped out by an unresolvable question.

**Resolution comes from an on-chain oracle, not a committee.** Each market
carries a `ResolutionCondition` (a feed id, a comparison, and a threshold).
At expiry the market reads a signed, timestamped price from the Oracle Registry
and resolves YES or NO deterministically — with a staleness guard so a market
can't be settled against a stale or future-dated price.

One deliberate edge case: a market seeded at price `P` sets `no_reserve =
initial_usdc · P` and `yes_reserve = initial_usdc · (1 − P)`, so the *realized*
opening price exactly equals the creator's chosen price. (The naive `√`-based
seeding you'll see in some write-ups does not actually satisfy its own price
definition — this is corrected intentionally.)

## Contract surface

Four Soroban contracts. The **Factory** deploys and configures a **Market** per
question; the Market holds the AMM and mints **YES / NO / LP** SEP-41 tokens;
the **Oracle Registry** supplies resolution prices.

### Market — CPMM core (`contracts/market/src/lib.rs`)

| Function | Access | Description |
|---|---|---|
| `initialize(params, contracts, fee_config)` | factory, once | One-time setup from the Factory |
| `initialize_pool(initial_usdc, initial_yes_price_bps)` | creator | Seeds reserves at the chosen opening price |
| `add_liquidity(provider, usdc_amount) -> lp` | user | Adds USDC liquidity, mints LP tokens |
| `buy_yes / buy_no(trader, usdc_in, min_out) -> out` | user | Buys outcome shares (slippage-guarded) |
| `sell_yes / sell_no(trader, tokens_in, min_usdc_out) -> usdc` | user | Sells outcome shares back to the pool |
| `withdraw_liquidity(provider, lp_amount) -> (usdc, fees)` | user | Burns LP, returns principal + fee share |
| `request_resolution()` | public | Reads the oracle at expiry and resolves YES/NO |
| `lock_market()` | public | Locks trading once expired, pre-resolution |
| `mark_invalid(grace_period)` | public | Marks an unresolvable market Invalid after grace |
| `claim_reward(claimer) -> i128` | user | Burns winning shares, pays pro-rata USDC (0 if none) |
| `earned` / quotes: `quote_buy_yes/no`, `quote_sell_yes/no` | read-only | Price impact + output preview, no state change |
| `get_market_info / get_amm_state / get_user_position` | read-only | Market, pool, and per-user views |
| `get_yes_price / get_no_price / get_status` | read-only | Current prices (10^7 scaled) and status |

Statuses: `Pending → Open → Locked → ResolvedYes | ResolvedNo | Invalid`.

### Factory — market deployment & registry (`contracts/factory/src/lib.rs`)

| Function | Access | Description |
|---|---|---|
| `initialize(config)` | deployer, once | Sets wasm hashes, fees, treasury |
| `create_market(creator, question, description, expiry, condition, initial_usdc, yes_price_bps) -> Address` | user | Deploys a Market + YES/NO/LP tokens and registers it |
| `list_markets(page, page_size) -> Vec<Address>` | read-only | Paginated market registry |
| `get_market(index) / get_market_count` | read-only | Registry lookups |
| `update_trading_fee_rate / update_market_creation_fee` | admin | Protocol parameters |
| `upgrade(new_wasm_hash)` | admin | Contract upgrade hook |

### Oracle Registry — price feeds (`contracts/oracle_registry/src/lib.rs`)

| Function | Access | Description |
|---|---|---|
| `initialize(admin, staleness_threshold)` | admin, once | One-time setup |
| `register_feed(feed_id, description, decimals)` | admin | Adds a price feed |
| `set_operator(operator, approved)` | admin | Authorizes a price relayer |
| `submit_price(feed_id, price, timestamp)` | operator | Posts a signed, timestamped price |
| `get_price(feed_id) -> (price, ts)` / `get_price_at(...)` | read-only | Latest / historical price with staleness guard |
| `list_feeds / get_feed / is_operator` | read-only | Registry views |

**Errors.** Each contract returns typed `contracterror` codes rather than
panicking opaquely, e.g. Market: `NotOpen`, `SlippageExceeded`, `TradeTooLarge`,
`InsufficientLiquidity`, `NotResolved`, `AlreadyClaimed`, `NothingToClaim`;
Oracle: `PriceTooStale`, `FutureTimestamp`, `FeedNotFound`; Factory:
`ExpiryInPast`, `DurationTooShort`, `InvalidPrice`. Claiming with nothing owed
is a no-op (returns `0`), not an error.

## Repo layout

```
contracts/
  oracle_registry/   price feed registry + signed attestations
  token_base/        shared SEP-41 token logic
  yes_token/ no_token/ lp_token/   SEP-41 outcome & LP tokens
  market/            CPMM AMM core + settlement (the contract described above)
  factory/           permissionless market deployment + registry
backend/             indexer + REST/WebSocket API (Node/TypeScript)
frontend/            Next.js 14 app: markets, trading, LP, portfolio, wallet
scripts/             testnet setup / deploy / create-market / price / e2e (bash)
```

## Running the tests

```
cargo test --workspace
```

**62 tests, 0 failures** across the workspace (`market` 22, `oracle_registry`
15, `yes_token` 12, `factory` 9, `no_token`/`lp_token` 2 each). Coverage
includes: CPMM invariant conservation across buys/sells, slippage/min-out
protection, single- and multi-provider liquidity, pro-rata settlement for
YES/NO/Invalid outcomes, oracle staleness and authorization paths, and the
factory's market-creation and pagination logic.

## Building the contracts

```
stellar contract build
```

Produces `target/wasm32v1-none/release/*.wasm`. Use the **`wasm32v1-none`**
target (what `stellar contract build` selects) — the default
`wasm32-unknown-unknown` emits post-MVP features (reference-types) the Soroban
host VM rejects, so it compiles but won't deploy. Build the `factory`
separately from `market` (in one invocation Cargo unifies features and links
the market's wasm exports into `factory.wasm`).

## Deploying to Testnet

```
bash scripts/setup-testnet.sh deployer     # create + fund a testnet identity
bash scripts/deploy.sh deployer            # deploy oracle, tokens, factory; wire them up
bash scripts/e2e.sh deployer               # deploy → create market → trade → resolve → claim
```

`e2e.sh` asserts on-chain state at each step and requires a funded identity.

## Frontend

```
cd frontend
cp .env.example .env.local
npm install
npm run dev            # → http://localhost:3000
```

Requires the [Freighter](https://www.freighter.app/) wallet extension. Fund a
testnet wallet from the [Circle faucet](https://faucet.circle.com) and add a
USDC trustline before trading. Routes: landing (`/`), markets & trading,
liquidity (`/lp`), portfolio, leaderboard, and a wallet panel (`/wallet`).

The backend indexer + REST/WebSocket API (which powers market lists and stats)
lives in `backend/` and needs PostgreSQL + Redis:

```
docker run -d --name stellarpredict-postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=stellarpredict -p 5432:5432 postgres:16-alpine
docker run -d --name stellarpredict-redis -p 6379:6379 redis:7-alpine
cd backend && cp .env.example .env && npm install
npm run migrate && npm run dev:api      # + `npm run dev:indexer` in a second terminal
```

## Live deployment (Stellar testnet)

All contracts are deployed and live on testnet, settling in real Circle testnet USDC.

| Contract | Address |
|---|---|
| Factory | [`CDEKLDCXKX33UR4UMWGUSI4YD4S4XHXAGU4X3QML4PDQC2EZW65M6UQX`](https://stellar.expert/explorer/testnet/contract/CDEKLDCXKX33UR4UMWGUSI4YD4S4XHXAGU4X3QML4PDQC2EZW65M6UQX) |
| Oracle Registry | [`CDMBKX5PJLPMOTGY7GORTH5CLXKP755AYRAEWYP4SLI4K7UXSRNBG47V`](https://stellar.expert/explorer/testnet/contract/CDMBKX5PJLPMOTGY7GORTH5CLXKP755AYRAEWYP4SLI4K7UXSRNBG47V) |
| USDC (Circle testnet SAC) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |

**Example contract-interaction transaction** (verified successful on-chain):
[`399a3739716a4729a40bb24995ff986dea15d7f4b674f514084e8f645b44e372`](https://stellar.expert/explorer/testnet/tx/399a3739716a4729a40bb24995ff986dea15d7f4b674f514084e8f645b44e372)

## License

MIT
