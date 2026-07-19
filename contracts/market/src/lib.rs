#![no_std]
//! # Market Contract (AMM core)
//!
//! Per-market CPMM prediction pool. One instance per binary market. Holds the
//! AMM reserves, mediates trading of YES/NO outcome tokens, accrues fees, locks
//! at expiry, accepts oracle resolution, and distributes the USDC pot to winners
//! and liquidity providers.
//!
//! ## CPMM model (consistent & conservation-correct)
//!
//! The pool keeps two *virtual* reserves used purely for pricing:
//! `yes_reserve` and `no_reserve`, in USDC-equivalent units. The spot price is
//!
//! ```text
//! P_yes = no_reserve / (yes_reserve + no_reserve)        (P_yes + P_no = 1)
//! ```
//!
//! A buy adds the net USDC to the *opposite* reserve and removes outcome tokens
//! from the same side, preserving the invariant `k = yes_reserve * no_reserve`:
//!
//! ```text
//! buy YES:  new_no  = no_reserve  + usdc_net ;  yes_out = yes_reserve - k/new_no
//! buy NO :  new_yes = yes_reserve + usdc_net ;  no_out  = no_reserve  - k/new_yes
//! sell YES: new_yes = yes_reserve + yes_in   ;  usdc_gross = no_reserve  - k/new_yes
//! sell NO : new_no  = no_reserve  + no_in    ;  usdc_gross = yes_reserve - k/new_no
//! ```
//!
//! Each branch sets the opposite reserve to `k / new_reserve`, so `k` is held
//! across trades (integer division only ever rounds it *down*, favoring the pool).
//!
//! ### Deviations from the prose spec (intentional, documented)
//! 1. **Seeding** uses `no_reserve = initial_usdc·P_yes`, `yes_reserve =
//!    initial_usdc·P_no` so that the realized `P_yes` exactly equals the
//!    creator's chosen price. The spec's `√`-based seeding does not satisfy its
//!    own price definition.
//! 2. **`sell` formulas** are the exact CPMM inverse of `buy` (the spec's
//!    `usdc·yes_in/(yes+yes_in)` form breaks the `k` invariant).
//! 3. **Balances** live in the YES/NO/LP token contracts (the source of truth);
//!    the Market does not keep redundant per-user balance maps.
//! 4. **USDC settlement is pro-rata** (`pot / winning_supply`), so the pool is
//!    always solvent regardless of trade history.

use soroban_sdk::{
    contractclient, contracterror, contracttype, panic_with_error, symbol_short, token, Address,
    Env, String, Symbol,
};
// Only used when the on-chain contract is compiled (see the feature note in Cargo.toml).
#[cfg(feature = "contract")]
use soroban_sdk::{contract, contractimpl};

// ─────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────

/// Fixed-point scale for prices and per-token rewards (10^7).
const SCALE: i128 = 10_000_000;
/// Basis-point denominator (100% = 10_000 bps).
const BPS: i128 = 10_000;
/// Minimum trade size in USDC stroops (0.01 USDC).
const MIN_TRADE_USDC: i128 = 100_000;
/// Tolerance (seconds) when matching the oracle price to the resolution time.
const ORACLE_TOLERANCE: u64 = 3_600;

const DAY_IN_LEDGERS: u32 = 17_280;
const INSTANCE_BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
const INSTANCE_LIFETIME_THRESHOLD: u32 = INSTANCE_BUMP_AMOUNT - DAY_IN_LEDGERS;

// ─────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum MarketError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NotOpen = 3,
    NotLocked = 4,
    NotResolved = 5,
    AlreadyResolved = 6,
    NotExpired = 7,
    InvalidAmount = 8,
    InvalidPrice = 9,
    SlippageExceeded = 10,
    ZeroOutput = 11,
    TradeTooSmall = 12,
    TradeTooLarge = 13,
    AlreadyClaimed = 14,
    NothingToClaim = 15,
    InsufficientLiquidity = 16,
    ResolutionAlreadyAttempted = 17,
    InvalidStatusForPool = 18,
}

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum MarketStatus {
    Pending,
    Open,
    Locked,
    ResolvedYes,
    ResolvedNo,
    Invalid,
}

#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Comparison {
    Gt,
    Gte,
    Lt,
    Lte,
    Eq,
}

#[contracttype]
#[derive(Clone)]
pub struct ResolutionCondition {
    pub feed_id: Symbol,
    pub comparison: Comparison,
    pub threshold: i128,
    pub resolution_timestamp: u64,
}

/// Market metadata bundle (Soroban caps contract fns at 10 params, so
/// `initialize` takes grouped structs).
#[contracttype]
#[derive(Clone)]
pub struct MarketParams {
    pub creator: Address,
    pub question: String,
    pub description: String,
    pub expiry_timestamp: u64,
    pub condition: ResolutionCondition,
}

/// External contract addresses the Market depends on.
#[contracttype]
#[derive(Clone)]
pub struct MarketContracts {
    pub yes_token: Address,
    pub no_token: Address,
    pub lp_token: Address,
    pub usdc_token: Address,
    pub oracle_registry: Address,
    pub factory: Address,
}

/// Fee + risk configuration (inherited from the Factory at creation).
#[contracttype]
#[derive(Clone)]
pub struct FeeConfig {
    pub trading_fee_rate: i128,    // bps, e.g. 200 = 2%
    pub protocol_fee_share: i128,  // bps of fee to protocol, e.g. 1000 = 10%
    pub protocol_treasury: Address,
    pub max_single_trade_pct: i128, // bps of reserve, e.g. 1000 = 10%
}

#[contracttype]
#[derive(Clone)]
pub struct MarketInfo {
    pub creator: Address,
    pub question: String,
    pub description: String,
    pub expiry_timestamp: u64,
    pub condition: ResolutionCondition,
    pub status: MarketStatus,
    pub created_at: u64,
    pub resolved_at: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct AmmState {
    pub yes_reserve: i128,
    pub no_reserve: i128,
    pub usdc_reserve: i128,
    pub total_lp_supply: i128,
    pub fee_pool: i128,
    pub yes_price: i128, // scaled 10^7
    pub no_price: i128,  // scaled 10^7
    pub total_volume: i128,
    pub total_trades: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct UserPosition {
    pub yes_balance: i128,
    pub no_balance: i128,
    pub lp_balance: i128,
    pub claimed: bool,
}

#[derive(Clone)]
#[contracttype]
pub enum MarketKey {
    // Metadata
    Creator,
    Question,
    Description,
    ExpiryTimestamp,
    Condition,
    Status,
    CreatedAt,
    ResolvedAt,
    // Token / external addresses
    YesToken,
    NoToken,
    LpToken,
    UsdcToken,
    OracleRegistry,
    Factory,
    // AMM reserves
    YesReserve,
    NoReserve,
    UsdcReserve,
    TotalLpSupply,
    FeePool,
    // Config
    TradingFeeRate,
    ProtocolFeeShare,
    ProtocolTreasury,
    MaxSingleTradePct,
    // Settlement
    RewardPerToken,
    LpRedemptionPool,
    ResolutionAttempted,
    // Per-user (only claim guard; balances live in the token contracts)
    Claimed(Address),
    // Stats
    TotalVolume,
    TotalTrades,
}

// ── External contract interfaces ─────────────────────────────────────────

/// Mint/burn/read interface implemented by the YES, NO, and LP token contracts.
#[contractclient(name = "OutcomeTokenClient")]
pub trait OutcomeTokenInterface {
    fn mint(env: Env, to: Address, amount: i128);
    fn burn(env: Env, from: Address, amount: i128);
    fn balance(env: Env, id: Address) -> i128;
    fn total_supply(env: Env) -> i128;
}

/// Subset of the Oracle Registry the Market needs for resolution.
#[contractclient(name = "OracleClient")]
pub trait OracleInterface {
    fn get_price_at(
        env: Env,
        feed_id: Symbol,
        target_timestamp: u64,
        tolerance: u64,
    ) -> Option<i128>;
}

// ─────────────────────────────────────────────────────────────────────────
// Contract
// ─────────────────────────────────────────────────────────────────────────

// The `#[contract]`/`#[contractimpl]` macros (which emit the wasm exports and the
// generated `MarketClient`) are applied only when the `contract` feature is on.
// Dependents that link this crate for its types alone (the factory) build with the
// feature off, so they don't inherit the Market's `export_name` symbols. See the
// `MarketInterface` client below and the feature note in Cargo.toml.
#[cfg_attr(feature = "contract", contract)]
pub struct Market;

#[cfg_attr(feature = "contract", contractimpl)]
impl Market {
    /// One-time configuration. Called by the Factory immediately after deploy,
    /// before any liquidity exists. Sets status to `Pending`.
    pub fn initialize(
        env: Env,
        params: MarketParams,
        contracts: MarketContracts,
        fees: FeeConfig,
    ) {
        let s = env.storage().instance();
        if s.has(&MarketKey::Status) {
            panic_with_error!(&env, MarketError::AlreadyInitialized);
        }
        s.set(&MarketKey::Creator, &params.creator);
        s.set(&MarketKey::Question, &params.question);
        s.set(&MarketKey::Description, &params.description);
        s.set(&MarketKey::ExpiryTimestamp, &params.expiry_timestamp);
        s.set(&MarketKey::Condition, &params.condition);
        s.set(&MarketKey::Status, &MarketStatus::Pending);
        s.set(&MarketKey::CreatedAt, &env.ledger().timestamp());
        s.set(&MarketKey::ResolvedAt, &0u64);

        s.set(&MarketKey::YesToken, &contracts.yes_token);
        s.set(&MarketKey::NoToken, &contracts.no_token);
        s.set(&MarketKey::LpToken, &contracts.lp_token);
        s.set(&MarketKey::UsdcToken, &contracts.usdc_token);
        s.set(&MarketKey::OracleRegistry, &contracts.oracle_registry);
        s.set(&MarketKey::Factory, &contracts.factory);

        s.set(&MarketKey::YesReserve, &0i128);
        s.set(&MarketKey::NoReserve, &0i128);
        s.set(&MarketKey::UsdcReserve, &0i128);
        s.set(&MarketKey::TotalLpSupply, &0i128);
        s.set(&MarketKey::FeePool, &0i128);

        s.set(&MarketKey::TradingFeeRate, &fees.trading_fee_rate);
        s.set(&MarketKey::ProtocolFeeShare, &fees.protocol_fee_share);
        s.set(&MarketKey::ProtocolTreasury, &fees.protocol_treasury);
        s.set(&MarketKey::MaxSingleTradePct, &fees.max_single_trade_pct);

        s.set(&MarketKey::ResolutionAttempted, &false);
        s.set(&MarketKey::TotalVolume, &0i128);
        s.set(&MarketKey::TotalTrades, &0u64);
        bump(&env);
    }

    /// Seed the pool with the first liquidity and open the market.
    ///
    /// `initial_yes_price_bps` (e.g. 7000 = 70%) sets the opening odds. Reserves
    /// are seeded so the realized spot price equals it exactly. Pulls
    /// `initial_usdc` from the creator and mints them LP tokens (supply seeded to
    /// `initial_usdc`).
    pub fn initialize_pool(env: Env, initial_usdc: i128, initial_yes_price_bps: i128) {
        Self::require_status(&env, MarketStatus::Pending, MarketError::InvalidStatusForPool);
        let creator: Address = Self::get(&env, &MarketKey::Creator);
        creator.require_auth();

        if initial_usdc <= 0 {
            panic_with_error!(&env, MarketError::InvalidAmount);
        }
        if initial_yes_price_bps <= 0 || initial_yes_price_bps >= BPS {
            panic_with_error!(&env, MarketError::InvalidPrice);
        }

        // Seed reserves so P_yes == initial_yes_price.
        // no_reserve = usdc·P_yes ; yes_reserve = usdc·P_no.
        let no_reserve = mul_div(initial_usdc, initial_yes_price_bps, BPS);
        let yes_reserve = mul_div(initial_usdc, BPS - initial_yes_price_bps, BPS);
        if yes_reserve <= 0 || no_reserve <= 0 {
            panic_with_error!(&env, MarketError::InsufficientLiquidity);
        }

        // Pull USDC from creator into the pool.
        Self::usdc(&env).transfer(&creator, &env.current_contract_address(), &initial_usdc);

        Self::set(&env, &MarketKey::YesReserve, &yes_reserve);
        Self::set(&env, &MarketKey::NoReserve, &no_reserve);
        Self::set(&env, &MarketKey::UsdcReserve, &initial_usdc);
        Self::set(&env, &MarketKey::TotalLpSupply, &initial_usdc);
        Self::set(&env, &MarketKey::Status, &MarketStatus::Open);

        // Mint LP tokens to the creator (initial supply = initial_usdc).
        Self::lp_client(&env).mint(&creator, &initial_usdc);
        bump(&env);

        env.events().publish(
            (symbol_short!("market"), symbol_short!("opened")),
            (creator, initial_usdc, yes_reserve, no_reserve),
        );
    }

    /// Add liquidity proportionally at the current price. Mints LP tokens.
    /// Returns the LP tokens minted.
    pub fn add_liquidity(env: Env, provider: Address, usdc_amount: i128) -> i128 {
        Self::require_status(&env, MarketStatus::Open, MarketError::NotOpen);
        provider.require_auth();
        if usdc_amount <= 0 {
            panic_with_error!(&env, MarketError::InvalidAmount);
        }

        let yes_reserve: i128 = Self::get(&env, &MarketKey::YesReserve);
        let no_reserve: i128 = Self::get(&env, &MarketKey::NoReserve);
        let usdc_reserve: i128 = Self::get(&env, &MarketKey::UsdcReserve);
        let total_lp: i128 = Self::get(&env, &MarketKey::TotalLpSupply);

        // Proportional scaling preserves price.
        let lp_to_mint = mul_div(total_lp, usdc_amount, usdc_reserve);
        let yes_add = mul_div(yes_reserve, usdc_amount, usdc_reserve);
        let no_add = mul_div(no_reserve, usdc_amount, usdc_reserve);
        if lp_to_mint <= 0 {
            panic_with_error!(&env, MarketError::TradeTooSmall);
        }

        Self::usdc(&env).transfer(&provider, &env.current_contract_address(), &usdc_amount);

        Self::set(&env, &MarketKey::YesReserve, &(yes_reserve + yes_add));
        Self::set(&env, &MarketKey::NoReserve, &(no_reserve + no_add));
        Self::set(&env, &MarketKey::UsdcReserve, &(usdc_reserve + usdc_amount));
        Self::set(&env, &MarketKey::TotalLpSupply, &(total_lp + lp_to_mint));

        Self::lp_client(&env).mint(&provider, &lp_to_mint);
        bump(&env);

        env.events().publish(
            (symbol_short!("market"), symbol_short!("liq_add")),
            (provider, usdc_amount, lp_to_mint),
        );
        lp_to_mint
    }

    /// Buy YES tokens with `usdc_in`. Reverts if output < `min_yes_out`.
    /// Returns YES tokens minted to the trader.
    pub fn buy_yes(env: Env, trader: Address, usdc_in: i128, min_yes_out: i128) -> i128 {
        Self::buy(&env, trader, usdc_in, min_yes_out, true)
    }

    /// Buy NO tokens with `usdc_in`. Reverts if output < `min_no_out`.
    pub fn buy_no(env: Env, trader: Address, usdc_in: i128, min_no_out: i128) -> i128 {
        Self::buy(&env, trader, usdc_in, min_no_out, false)
    }

    /// Sell `yes_in` YES tokens. Reverts if USDC out < `min_usdc_out`.
    pub fn sell_yes(env: Env, trader: Address, yes_in: i128, min_usdc_out: i128) -> i128 {
        Self::sell(&env, trader, yes_in, min_usdc_out, true)
    }

    /// Sell `no_in` NO tokens. Reverts if USDC out < `min_usdc_out`.
    pub fn sell_no(env: Env, trader: Address, no_in: i128, min_usdc_out: i128) -> i128 {
        Self::sell(&env, trader, no_in, min_usdc_out, false)
    }

    /// Lock the market once expiry is reached. Permissionless.
    pub fn lock_market(env: Env) {
        Self::require_status(&env, MarketStatus::Open, MarketError::NotOpen);
        let expiry: u64 = Self::get(&env, &MarketKey::ExpiryTimestamp);
        if env.ledger().timestamp() < expiry {
            panic_with_error!(&env, MarketError::NotExpired);
        }
        Self::set(&env, &MarketKey::Status, &MarketStatus::Locked);
        bump(&env);
        env.events().publish(
            (symbol_short!("market"), symbol_short!("locked")),
            env.ledger().timestamp(),
        );
    }

    /// Query the oracle and resolve the market. Permissionless. Idempotent —
    /// only the first successful attempt sets the outcome.
    pub fn request_resolution(env: Env) {
        Self::require_status(&env, MarketStatus::Locked, MarketError::NotLocked);
        let attempted: bool = Self::get(&env, &MarketKey::ResolutionAttempted);
        if attempted {
            panic_with_error!(&env, MarketError::ResolutionAlreadyAttempted);
        }
        Self::set(&env, &MarketKey::ResolutionAttempted, &true);

        let condition: ResolutionCondition = Self::get(&env, &MarketKey::Condition);
        let oracle_addr: Address = Self::get(&env, &MarketKey::OracleRegistry);
        let oracle = OracleClient::new(&env, &oracle_addr);
        let price = oracle.get_price_at(
            &condition.feed_id,
            &condition.resolution_timestamp,
            &ORACLE_TOLERANCE,
        );

        let status = match price {
            Some(p) => {
                if evaluate(p, &condition) {
                    MarketStatus::ResolvedYes
                } else {
                    MarketStatus::ResolvedNo
                }
            }
            None => MarketStatus::Invalid,
        };
        Self::finalize(&env, status, price.unwrap_or(0));
    }

    /// Mark a locked market INVALID after the oracle grace period elapsed with no
    /// usable price. Permissionless. `grace_period` seconds past expiry required.
    pub fn mark_invalid(env: Env, grace_period: u64) {
        Self::require_status(&env, MarketStatus::Locked, MarketError::NotLocked);
        let expiry: u64 = Self::get(&env, &MarketKey::ExpiryTimestamp);
        if env.ledger().timestamp() < expiry + grace_period {
            panic_with_error!(&env, MarketError::NotExpired);
        }
        Self::set(&env, &MarketKey::ResolutionAttempted, &true);
        Self::finalize(&env, MarketStatus::Invalid, 0);
    }

    /// Claim a trader's winning (or INVALID-refund) USDC. Burns the redeemed
    /// tokens. Single claim per address. Returns USDC paid out.
    pub fn claim_reward(env: Env, claimer: Address) -> i128 {
        claimer.require_auth();
        let status: MarketStatus = Self::get(&env, &MarketKey::Status);
        let invalid = status == MarketStatus::Invalid;
        if !matches!(
            status,
            MarketStatus::ResolvedYes | MarketStatus::ResolvedNo | MarketStatus::Invalid
        ) {
            panic_with_error!(&env, MarketError::NotResolved);
        }
        if Self::is_claimed(&env, &claimer) {
            panic_with_error!(&env, MarketError::AlreadyClaimed);
        }

        let rpt: i128 = Self::get(&env, &MarketKey::RewardPerToken);
        let yes = Self::yes_client(&env);
        let no = Self::no_client(&env);

        // Determine redeemable token balance, burning what is redeemed.
        let mut redeemable: i128 = 0;
        match status {
            MarketStatus::ResolvedYes => {
                let bal = yes.balance(&claimer);
                if bal > 0 {
                    yes.burn(&claimer, &bal);
                    redeemable += bal;
                }
            }
            MarketStatus::ResolvedNo => {
                let bal = no.balance(&claimer);
                if bal > 0 {
                    no.burn(&claimer, &bal);
                    redeemable += bal;
                }
            }
            _ => {
                // INVALID: both sides redeem at the blended rate.
                let yb = yes.balance(&claimer);
                let nb = no.balance(&claimer);
                if yb > 0 {
                    yes.burn(&claimer, &yb);
                    redeemable += yb;
                }
                if nb > 0 {
                    no.burn(&claimer, &nb);
                    redeemable += nb;
                }
            }
        }

        Self::set_claimed(&env, &claimer);
        if redeemable == 0 {
            // Nothing to redeem, but mark claimed to keep idempotency cheap.
            let _ = invalid;
            return 0;
        }

        let payout = mul_div(redeemable, rpt, SCALE);
        if payout > 0 {
            Self::usdc(&env).transfer(&env.current_contract_address(), &claimer, &payout);
            let reserve: i128 = Self::get(&env, &MarketKey::UsdcReserve);
            Self::set(&env, &MarketKey::UsdcReserve, &(reserve - payout));
        }
        bump(&env);

        env.events().publish(
            (symbol_short!("market"), symbol_short!("claim")),
            (claimer, redeemable, payout),
        );
        payout
    }

    /// Withdraw liquidity after resolution. Burns LP tokens and pays the LP's
    /// pro-rata share of the LP redemption pool (losing/pool winning side value
    /// plus accrued fees). Returns `(usdc_paid, fees_component)`.
    pub fn withdraw_liquidity(env: Env, provider: Address, lp_amount: i128) -> (i128, i128) {
        provider.require_auth();
        let status: MarketStatus = Self::get(&env, &MarketKey::Status);
        if !matches!(
            status,
            MarketStatus::ResolvedYes | MarketStatus::ResolvedNo | MarketStatus::Invalid
        ) {
            panic_with_error!(&env, MarketError::NotResolved);
        }
        if lp_amount <= 0 {
            panic_with_error!(&env, MarketError::InvalidAmount);
        }

        let total_lp: i128 = Self::get(&env, &MarketKey::TotalLpSupply);
        let redemption_pool: i128 = Self::get(&env, &MarketKey::LpRedemptionPool);
        let fee_pool: i128 = Self::get(&env, &MarketKey::FeePool);

        // Burn the LP tokens (provider must hold them).
        Self::lp_client(&env).burn(&provider, &lp_amount);

        let usdc_out = mul_div(redemption_pool, lp_amount, total_lp);
        let fees_component = mul_div(fee_pool, lp_amount, total_lp);

        Self::set(&env, &MarketKey::TotalLpSupply, &(total_lp - lp_amount));
        Self::set(&env, &MarketKey::LpRedemptionPool, &(redemption_pool - usdc_out));
        Self::set(&env, &MarketKey::FeePool, &(fee_pool - fees_component));

        if usdc_out > 0 {
            Self::usdc(&env).transfer(&env.current_contract_address(), &provider, &usdc_out);
        }
        bump(&env);

        env.events().publish(
            (symbol_short!("market"), symbol_short!("liq_out")),
            (provider, lp_amount, usdc_out, fees_component),
        );
        (usdc_out, fees_component)
    }

    // ── View functions ──────────────────────────────────────────────────

    pub fn get_market_info(env: Env) -> MarketInfo {
        MarketInfo {
            creator: Self::get(&env, &MarketKey::Creator),
            question: Self::get(&env, &MarketKey::Question),
            description: Self::get(&env, &MarketKey::Description),
            expiry_timestamp: Self::get(&env, &MarketKey::ExpiryTimestamp),
            condition: Self::get(&env, &MarketKey::Condition),
            status: Self::get(&env, &MarketKey::Status),
            created_at: Self::get(&env, &MarketKey::CreatedAt),
            resolved_at: Self::get(&env, &MarketKey::ResolvedAt),
        }
    }

    pub fn get_amm_state(env: Env) -> AmmState {
        let yes_reserve: i128 = Self::get(&env, &MarketKey::YesReserve);
        let no_reserve: i128 = Self::get(&env, &MarketKey::NoReserve);
        AmmState {
            yes_reserve,
            no_reserve,
            usdc_reserve: Self::get(&env, &MarketKey::UsdcReserve),
            total_lp_supply: Self::get(&env, &MarketKey::TotalLpSupply),
            fee_pool: Self::get(&env, &MarketKey::FeePool),
            yes_price: price_of(no_reserve, yes_reserve, no_reserve),
            no_price: price_of(yes_reserve, yes_reserve, no_reserve),
            total_volume: Self::get(&env, &MarketKey::TotalVolume),
            total_trades: Self::get(&env, &MarketKey::TotalTrades),
        }
    }

    pub fn get_user_position(env: Env, user: Address) -> UserPosition {
        UserPosition {
            yes_balance: Self::yes_client(&env).balance(&user),
            no_balance: Self::no_client(&env).balance(&user),
            lp_balance: Self::lp_client(&env).balance(&user),
            claimed: Self::is_claimed(&env, &user),
        }
    }

    pub fn get_yes_price(env: Env) -> i128 {
        let yes_reserve: i128 = Self::get(&env, &MarketKey::YesReserve);
        let no_reserve: i128 = Self::get(&env, &MarketKey::NoReserve);
        price_of(no_reserve, yes_reserve, no_reserve)
    }

    pub fn get_no_price(env: Env) -> i128 {
        let yes_reserve: i128 = Self::get(&env, &MarketKey::YesReserve);
        let no_reserve: i128 = Self::get(&env, &MarketKey::NoReserve);
        price_of(yes_reserve, yes_reserve, no_reserve)
    }

    pub fn get_status(env: Env) -> MarketStatus {
        Self::get(&env, &MarketKey::Status)
    }

    /// Quote a YES buy: `(yes_out, price_impact_bps)`.
    pub fn quote_buy_yes(env: Env, usdc_in: i128) -> (i128, i128) {
        Self::quote_buy(&env, usdc_in, true)
    }
    pub fn quote_buy_no(env: Env, usdc_in: i128) -> (i128, i128) {
        Self::quote_buy(&env, usdc_in, false)
    }
    pub fn quote_sell_yes(env: Env, yes_in: i128) -> (i128, i128) {
        Self::quote_sell(&env, yes_in, true)
    }
    pub fn quote_sell_no(env: Env, no_in: i128) -> (i128, i128) {
        Self::quote_sell(&env, no_in, false)
    }

    // ── Internal: trading ───────────────────────────────────────────────

    fn buy(env: &Env, trader: Address, usdc_in: i128, min_out: i128, is_yes: bool) -> i128 {
        Self::require_status(env, MarketStatus::Open, MarketError::NotOpen);
        trader.require_auth();
        if usdc_in < MIN_TRADE_USDC {
            panic_with_error!(env, MarketError::TradeTooSmall);
        }
        let usdc_reserve: i128 = Self::get(env, &MarketKey::UsdcReserve);
        Self::check_max_trade(env, usdc_in, usdc_reserve);

        let (fee_total, fee_protocol, fee_pool_add) = Self::split_fee(env, usdc_in);
        let usdc_net = usdc_in - fee_total;

        let yes_reserve: i128 = Self::get(env, &MarketKey::YesReserve);
        let no_reserve: i128 = Self::get(env, &MarketKey::NoReserve);
        let k = checked_mul(yes_reserve, no_reserve);

        // Buying YES adds USDC to NO reserve, removes YES; vice-versa for NO.
        let (out, new_yes, new_no) = if is_yes {
            let new_no = no_reserve + usdc_net;
            let new_yes = k / new_no;
            (yes_reserve - new_yes, new_yes, new_no)
        } else {
            let new_yes = yes_reserve + usdc_net;
            let new_no = k / new_yes;
            (no_reserve - new_no, new_yes, new_no)
        };

        if out <= 0 {
            panic_with_error!(env, MarketError::ZeroOutput);
        }
        if out < min_out {
            panic_with_error!(env, MarketError::SlippageExceeded);
        }

        // Pull USDC, route protocol fee, keep net + LP fee.
        Self::usdc(env).transfer(&trader, &env.current_contract_address(), &usdc_in);
        Self::route_protocol_fee(env, fee_protocol);

        Self::set(env, &MarketKey::YesReserve, &new_yes);
        Self::set(env, &MarketKey::NoReserve, &new_no);
        Self::set(env, &MarketKey::UsdcReserve, &(usdc_reserve + usdc_net));
        Self::add_fee_pool(env, fee_pool_add);
        Self::bump_stats(env, usdc_in);

        // Mint outcome tokens to the trader.
        let token = if is_yes {
            Self::yes_client(env)
        } else {
            Self::no_client(env)
        };
        token.mint(&trader, &out);
        bump(env);

        Self::emit_trade(env, &trader, is_yes, true, usdc_in, out, fee_total, new_yes, new_no);
        out
    }

    fn sell(env: &Env, trader: Address, token_in: i128, min_usdc_out: i128, is_yes: bool) -> i128 {
        Self::require_status(env, MarketStatus::Open, MarketError::NotOpen);
        trader.require_auth();
        if token_in <= 0 {
            panic_with_error!(env, MarketError::InvalidAmount);
        }

        let yes_reserve: i128 = Self::get(env, &MarketKey::YesReserve);
        let no_reserve: i128 = Self::get(env, &MarketKey::NoReserve);
        let k = checked_mul(yes_reserve, no_reserve);

        // Cap relative to the same-side reserve.
        let side_reserve = if is_yes { yes_reserve } else { no_reserve };
        Self::check_max_trade(env, token_in, side_reserve);

        // Selling YES returns YES to the pool, USDC leaves the NO side.
        let (usdc_gross, new_yes, new_no) = if is_yes {
            let new_yes = yes_reserve + token_in;
            let new_no = k / new_yes;
            (no_reserve - new_no, new_yes, new_no)
        } else {
            let new_no = no_reserve + token_in;
            let new_yes = k / new_no;
            (yes_reserve - new_yes, new_yes, new_no)
        };

        if usdc_gross <= 0 {
            panic_with_error!(env, MarketError::ZeroOutput);
        }

        let (fee_total, fee_protocol, fee_pool_add) = Self::split_fee(env, usdc_gross);
        let usdc_out = usdc_gross - fee_total;
        if usdc_out < min_usdc_out {
            panic_with_error!(env, MarketError::SlippageExceeded);
        }

        // Burn trader's tokens, pay out, route fees.
        let token = if is_yes {
            Self::yes_client(env)
        } else {
            Self::no_client(env)
        };
        token.burn(&trader, &token_in);

        let usdc_reserve: i128 = Self::get(env, &MarketKey::UsdcReserve);
        if usdc_reserve < usdc_gross {
            panic_with_error!(env, MarketError::InsufficientLiquidity);
        }
        Self::route_protocol_fee(env, fee_protocol);
        Self::usdc(env).transfer(&env.current_contract_address(), &trader, &usdc_out);

        Self::set(env, &MarketKey::YesReserve, &new_yes);
        Self::set(env, &MarketKey::NoReserve, &new_no);
        Self::set(env, &MarketKey::UsdcReserve, &(usdc_reserve - usdc_gross));
        Self::add_fee_pool(env, fee_pool_add);
        Self::bump_stats(env, usdc_gross);
        bump(env);

        Self::emit_trade(env, &trader, is_yes, false, usdc_out, token_in, fee_total, new_yes, new_no);
        usdc_out
    }

    fn quote_buy(env: &Env, usdc_in: i128, is_yes: bool) -> (i128, i128) {
        let yes_reserve: i128 = Self::get(env, &MarketKey::YesReserve);
        let no_reserve: i128 = Self::get(env, &MarketKey::NoReserve);
        if usdc_in <= 0 {
            return (0, 0);
        }
        let (_, _, fee_pool_add) = (0i128, 0i128, 0i128);
        let _ = fee_pool_add;
        let fee_rate: i128 = Self::get(env, &MarketKey::TradingFeeRate);
        let fee_total = mul_div(usdc_in, fee_rate, BPS);
        let usdc_net = usdc_in - fee_total;
        let k = checked_mul(yes_reserve, no_reserve);
        let price_before = price_of(no_reserve, yes_reserve, no_reserve);
        let (out, new_yes, new_no) = if is_yes {
            let new_no = no_reserve + usdc_net;
            let new_yes = k / new_no;
            (yes_reserve - new_yes, new_yes, new_no)
        } else {
            let new_yes = yes_reserve + usdc_net;
            let new_no = k / new_yes;
            (no_reserve - new_no, new_yes, new_no)
        };
        let price_after = price_of(new_no, new_yes, new_no);
        (out, price_impact_bps(price_before, price_after))
    }

    fn quote_sell(env: &Env, token_in: i128, is_yes: bool) -> (i128, i128) {
        let yes_reserve: i128 = Self::get(env, &MarketKey::YesReserve);
        let no_reserve: i128 = Self::get(env, &MarketKey::NoReserve);
        if token_in <= 0 {
            return (0, 0);
        }
        let fee_rate: i128 = Self::get(env, &MarketKey::TradingFeeRate);
        let k = checked_mul(yes_reserve, no_reserve);
        let price_before = price_of(no_reserve, yes_reserve, no_reserve);
        let (usdc_gross, new_yes, new_no) = if is_yes {
            let new_yes = yes_reserve + token_in;
            let new_no = k / new_yes;
            (no_reserve - new_no, new_yes, new_no)
        } else {
            let new_no = no_reserve + token_in;
            let new_yes = k / new_no;
            (yes_reserve - new_yes, new_yes, new_no)
        };
        let fee_total = mul_div(usdc_gross, fee_rate, BPS);
        let usdc_out = usdc_gross - fee_total;
        let price_after = price_of(new_no, new_yes, new_no);
        (usdc_out, price_impact_bps(price_before, price_after))
    }

    // ── Internal: settlement ────────────────────────────────────────────

    fn finalize(env: &Env, status: MarketStatus, oracle_price: i128) {
        let yes_reserve: i128 = Self::get(env, &MarketKey::YesReserve);
        let no_reserve: i128 = Self::get(env, &MarketKey::NoReserve);
        let usdc_reserve: i128 = Self::get(env, &MarketKey::UsdcReserve);
        let fee_pool: i128 = Self::get(env, &MarketKey::FeePool);

        let yes_supply = Self::yes_client(env).total_supply();
        let no_supply = Self::no_client(env).total_supply();

        // Determine the winning-token supply (trader-held + pool reserve) and the
        // reward per token. The pool's winning reserve belongs to LPs.
        let (winning_supply, pool_winning_reserve) = match status {
            MarketStatus::ResolvedYes => (yes_supply + yes_reserve, yes_reserve),
            MarketStatus::ResolvedNo => (no_supply + no_reserve, no_reserve),
            _ => (
                yes_supply + no_supply + yes_reserve + no_reserve,
                yes_reserve + no_reserve,
            ),
        };

        let rpt = if winning_supply > 0 {
            mul_div(usdc_reserve, SCALE, winning_supply)
        } else {
            0
        };

        // LP redemption pool = value of pool-owned winning tokens + all fees.
        let pool_value = mul_div(pool_winning_reserve, rpt, SCALE);
        let lp_redemption_pool = pool_value + fee_pool;

        Self::set(env, &MarketKey::RewardPerToken, &rpt);
        Self::set(env, &MarketKey::LpRedemptionPool, &lp_redemption_pool);
        Self::set(env, &MarketKey::Status, &status);
        Self::set(env, &MarketKey::ResolvedAt, &env.ledger().timestamp());
        bump(env);

        let outcome = match status {
            MarketStatus::ResolvedYes => symbol_short!("YES"),
            MarketStatus::ResolvedNo => symbol_short!("NO"),
            _ => symbol_short!("INVALID"),
        };
        env.events().publish(
            (symbol_short!("market"), symbol_short!("resolved")),
            (outcome, oracle_price, rpt),
        );
    }

    // ── Internal: fee helpers ───────────────────────────────────────────

    /// Returns `(fee_total, fee_to_protocol, fee_to_pool)`.
    fn split_fee(env: &Env, amount: i128) -> (i128, i128, i128) {
        let fee_rate: i128 = Self::get(env, &MarketKey::TradingFeeRate);
        let protocol_share: i128 = Self::get(env, &MarketKey::ProtocolFeeShare);
        let fee_total = mul_div(amount, fee_rate, BPS);
        let fee_protocol = mul_div(fee_total, protocol_share, BPS);
        let fee_pool = fee_total - fee_protocol;
        (fee_total, fee_protocol, fee_pool)
    }

    fn route_protocol_fee(env: &Env, fee_protocol: i128) {
        if fee_protocol > 0 {
            let treasury: Address = Self::get(env, &MarketKey::ProtocolTreasury);
            Self::usdc(env).transfer(&env.current_contract_address(), &treasury, &fee_protocol);
        }
    }

    fn add_fee_pool(env: &Env, amount: i128) {
        let fee_pool: i128 = Self::get(env, &MarketKey::FeePool);
        Self::set(env, &MarketKey::FeePool, &(fee_pool + amount));
    }

    fn bump_stats(env: &Env, volume: i128) {
        let v: i128 = Self::get(env, &MarketKey::TotalVolume);
        let t: u64 = Self::get(env, &MarketKey::TotalTrades);
        Self::set(env, &MarketKey::TotalVolume, &(v + volume));
        Self::set(env, &MarketKey::TotalTrades, &(t + 1));
    }

    fn check_max_trade(env: &Env, amount: i128, reserve: i128) {
        let max_pct: i128 = Self::get(env, &MarketKey::MaxSingleTradePct);
        if max_pct > 0 {
            let cap = mul_div(reserve, max_pct, BPS);
            if amount > cap {
                panic_with_error!(env, MarketError::TradeTooLarge);
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn emit_trade(
        env: &Env,
        trader: &Address,
        is_yes: bool,
        is_buy: bool,
        usdc_amount: i128,
        token_amount: i128,
        fee: i128,
        new_yes: i128,
        new_no: i128,
    ) {
        let dir = match (is_buy, is_yes) {
            (true, true) => symbol_short!("BUY_YES"),
            (true, false) => symbol_short!("BUY_NO"),
            (false, true) => symbol_short!("SELL_YES"),
            (false, false) => symbol_short!("SELL_NO"),
        };
        let yes_price = price_of(new_no, new_yes, new_no);
        env.events().publish(
            (symbol_short!("market"), symbol_short!("trade")),
            (
                trader.clone(),
                dir,
                usdc_amount,
                token_amount,
                fee,
                yes_price,
            ),
        );
    }

    // ── Internal: storage & client helpers ──────────────────────────────

    fn usdc(env: &Env) -> token::Client<'static> {
        let addr: Address = Self::get(env, &MarketKey::UsdcToken);
        token::Client::new(env, &addr)
    }

    fn yes_client(env: &Env) -> OutcomeTokenClient<'static> {
        let addr: Address = Self::get(env, &MarketKey::YesToken);
        OutcomeTokenClient::new(env, &addr)
    }

    fn no_client(env: &Env) -> OutcomeTokenClient<'static> {
        let addr: Address = Self::get(env, &MarketKey::NoToken);
        OutcomeTokenClient::new(env, &addr)
    }

    fn lp_client(env: &Env) -> OutcomeTokenClient<'static> {
        let addr: Address = Self::get(env, &MarketKey::LpToken);
        OutcomeTokenClient::new(env, &addr)
    }

    fn is_claimed(env: &Env, who: &Address) -> bool {
        env.storage()
            .persistent()
            .get(&MarketKey::Claimed(who.clone()))
            .unwrap_or(false)
    }

    fn set_claimed(env: &Env, who: &Address) {
        env.storage()
            .persistent()
            .set(&MarketKey::Claimed(who.clone()), &true);
    }

    fn require_status(env: &Env, expected: MarketStatus, err: MarketError) {
        let status: MarketStatus = env
            .storage()
            .instance()
            .get(&MarketKey::Status)
            .unwrap_or_else(|| panic_with_error!(env, MarketError::NotInitialized));
        if status != expected {
            panic_with_error!(env, err);
        }
    }

    fn get<T: soroban_sdk::TryFromVal<Env, soroban_sdk::Val> + soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(
        env: &Env,
        key: &MarketKey,
    ) -> T {
        env.storage()
            .instance()
            .get(key)
            .unwrap_or_else(|| panic_with_error!(env, MarketError::NotInitialized))
    }

    fn set<T: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &MarketKey, value: &T) {
        env.storage().instance().set(key, value);
    }
}

// ─────────────────────────────────────────────────────────────────────────
// Client (feature `contract` off)
// ─────────────────────────────────────────────────────────────────────────
//
// When the `contract` feature is on, `#[contractimpl]` above already generates a
// `MarketClient`. When it is off (dependents linking this crate for its types,
// e.g. the factory), we still need a client to cross-contract-call a deployed
// market — so generate an identical one from the interface trait. The two are
// mutually exclusive via `cfg`, so the name never collides.
#[cfg(not(feature = "contract"))]
#[contractclient(name = "MarketClient")]
pub trait MarketInterface {
    fn initialize(env: Env, params: MarketParams, contracts: MarketContracts, fees: FeeConfig);
    fn initialize_pool(env: Env, initial_usdc: i128, initial_yes_price_bps: i128);
    fn add_liquidity(env: Env, provider: Address, usdc_amount: i128) -> i128;
    fn buy_yes(env: Env, trader: Address, usdc_in: i128, min_yes_out: i128) -> i128;
    fn buy_no(env: Env, trader: Address, usdc_in: i128, min_no_out: i128) -> i128;
    fn sell_yes(env: Env, trader: Address, yes_in: i128, min_usdc_out: i128) -> i128;
    fn sell_no(env: Env, trader: Address, no_in: i128, min_usdc_out: i128) -> i128;
    fn lock_market(env: Env);
    fn request_resolution(env: Env);
    fn mark_invalid(env: Env, grace_period: u64);
    fn claim_reward(env: Env, claimer: Address) -> i128;
    fn withdraw_liquidity(env: Env, provider: Address, lp_amount: i128) -> (i128, i128);
    fn get_market_info(env: Env) -> MarketInfo;
    fn get_amm_state(env: Env) -> AmmState;
    fn get_user_position(env: Env, user: Address) -> UserPosition;
    fn get_yes_price(env: Env) -> i128;
    fn get_no_price(env: Env) -> i128;
    fn get_status(env: Env) -> MarketStatus;
    fn quote_buy_yes(env: Env, usdc_in: i128) -> (i128, i128);
    fn quote_buy_no(env: Env, usdc_in: i128) -> (i128, i128);
    fn quote_sell_yes(env: Env, yes_in: i128) -> (i128, i128);
    fn quote_sell_no(env: Env, no_in: i128) -> (i128, i128);
}

// ─────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────

/// Evaluate a resolution condition against an oracle price → YES (true) / NO.
fn evaluate(price: i128, condition: &ResolutionCondition) -> bool {
    match condition.comparison {
        Comparison::Gt => price > condition.threshold,
        Comparison::Gte => price >= condition.threshold,
        Comparison::Lt => price < condition.threshold,
        Comparison::Lte => price <= condition.threshold,
        Comparison::Eq => price == condition.threshold,
    }
}

/// Price of one side = (other reserve) / (yes + no), scaled by 10^7.
fn price_of(numerator_reserve: i128, yes_reserve: i128, no_reserve: i128) -> i128 {
    let total = yes_reserve + no_reserve;
    if total <= 0 {
        return 0;
    }
    mul_div(numerator_reserve, SCALE, total)
}

/// Relative price move in basis points: |after - before| * 10000 / before.
fn price_impact_bps(before: i128, after: i128) -> i128 {
    if before <= 0 {
        return 0;
    }
    let diff = if after > before { after - before } else { before - after };
    mul_div(diff, BPS, before)
}

/// `(a * b) / c` with checked 128-bit intermediate; panics on overflow / div0.
fn mul_div(a: i128, b: i128, c: i128) -> i128 {
    a.checked_mul(b)
        .expect("mul overflow")
        .checked_div(c)
        .expect("div by zero")
}

fn checked_mul(a: i128, b: i128) -> i128 {
    a.checked_mul(b).expect("mul overflow")
}

fn bump(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

#[cfg(feature = "contract")]
mod test;
