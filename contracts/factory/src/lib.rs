#![no_std]
//! # Factory Contract
//!
//! Permissionless entry point for market creation. Deploys a Market instance and
//! its YES/NO/LP token contracts (all from pre-uploaded wasm hashes), wires them
//! together, collects the creation fee, seeds the pool, and records the market in
//! a paginated registry.

use market::{FeeConfig, MarketClient, MarketContracts, MarketParams, ResolutionCondition};
use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, panic_with_error,
    symbol_short, token, Address, BytesN, Env, String, Vec,
};

// ── Duration bounds (seconds) ───────────────────────────────────────────
const MIN_DURATION: u64 = 60; // 1 minute
const MAX_DURATION: u64 = 365 * 86_400; // 365 days

const DAY_IN_LEDGERS: u32 = 17_280;
const INSTANCE_BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
const INSTANCE_LIFETIME_THRESHOLD: u32 = INSTANCE_BUMP_AMOUNT - DAY_IN_LEDGERS;

// ─────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────
#[contracterror]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum FactoryError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NotAuthorized = 3,
    ExpiryInPast = 4,
    DurationTooShort = 5,
    DurationTooLong = 6,
    InsufficientLiquidity = 7,
    InvalidPrice = 8,
    EmptyQuestion = 9,
    MarketNotFound = 10,
}

// ─────────────────────────────────────────────────────────────────────────
// Config & storage
// ─────────────────────────────────────────────────────────────────────────

/// Full factory configuration (grouped — Soroban caps contract fns at 10 params).
#[contracttype]
#[derive(Clone)]
pub struct FactoryConfig {
    pub admin: Address,
    pub oracle_registry: Address,
    pub protocol_treasury: Address,
    pub usdc_token: Address,
    pub market_creation_fee: i128,
    pub trading_fee_rate: i128,
    pub protocol_fee_share: i128,
    pub min_initial_liquidity: i128,
    pub max_single_trade_pct: i128,
    pub market_wasm_hash: BytesN<32>,
    pub token_wasm_hash: BytesN<32>,
}

#[derive(Clone)]
#[contracttype]
pub enum FactoryKey {
    Config,
    MarketCount,
    Market(u64),
    MarketByAddress(Address),
}

/// Minimal client to initialize a freshly-deployed token contract.
#[contractclient(name = "TokenInitClient")]
pub trait TokenInit {
    fn initialize(env: Env, admin: Address, name: String, symbol: String, decimals: u32);
}

// ─────────────────────────────────────────────────────────────────────────
// Contract
// ─────────────────────────────────────────────────────────────────────────
#[contract]
pub struct Factory;

#[contractimpl]
impl Factory {
    /// Initialize the factory with protocol configuration and the wasm hashes
    /// used to deploy markets and tokens.
    pub fn initialize(env: Env, config: FactoryConfig) {
        if env.storage().instance().has(&FactoryKey::Config) {
            panic_with_error!(&env, FactoryError::AlreadyInitialized);
        }
        env.storage().instance().set(&FactoryKey::Config, &config);
        env.storage().instance().set(&FactoryKey::MarketCount, &0u64);
        bump(&env);
    }

    /// Create a new binary market. Deploys the Market + YES/NO/LP tokens, collects
    /// the creation fee, seeds the pool with `initial_usdc`, and registers it.
    /// Returns the new Market contract address.
    pub fn create_market(
        env: Env,
        creator: Address,
        question: String,
        description: String,
        expiry_timestamp: u64,
        condition: ResolutionCondition,
        initial_usdc: i128,
        initial_yes_price_bps: i128,
    ) -> Address {
        creator.require_auth();
        let config = Self::config(&env);

        // ── Validation ──────────────────────────────────────────────────
        let now = env.ledger().timestamp();
        if expiry_timestamp <= now {
            panic_with_error!(&env, FactoryError::ExpiryInPast);
        }
        let duration = expiry_timestamp - now;
        if duration < MIN_DURATION {
            panic_with_error!(&env, FactoryError::DurationTooShort);
        }
        if duration > MAX_DURATION {
            panic_with_error!(&env, FactoryError::DurationTooLong);
        }
        if initial_usdc < config.min_initial_liquidity {
            panic_with_error!(&env, FactoryError::InsufficientLiquidity);
        }
        if initial_yes_price_bps <= 0 || initial_yes_price_bps >= 10_000 {
            panic_with_error!(&env, FactoryError::InvalidPrice);
        }
        if question.len() == 0 {
            panic_with_error!(&env, FactoryError::EmptyQuestion);
        }

        let index: u64 = env
            .storage()
            .instance()
            .get(&FactoryKey::MarketCount)
            .unwrap_or(0);
        let base = index.checked_mul(10).expect("index overflow");

        // ── Collect the creation fee ────────────────────────────────────
        if config.market_creation_fee > 0 {
            token::Client::new(&env, &config.usdc_token).transfer(
                &creator,
                &config.protocol_treasury,
                &config.market_creation_fee,
            );
        }

        // ── Deploy market + token contracts ─────────────────────────────
        let market_addr = env
            .deployer()
            .with_current_contract(salt(&env, base))
            .deploy_v2(config.market_wasm_hash.clone(), ());
        let yes_addr = env
            .deployer()
            .with_current_contract(salt(&env, base + 1))
            .deploy_v2(config.token_wasm_hash.clone(), ());
        let no_addr = env
            .deployer()
            .with_current_contract(salt(&env, base + 2))
            .deploy_v2(config.token_wasm_hash.clone(), ());
        let lp_addr = env
            .deployer()
            .with_current_contract(salt(&env, base + 3))
            .deploy_v2(config.token_wasm_hash.clone(), ());

        // ── Initialize tokens (Market is admin) ─────────────────────────
        let dec = 7u32;
        TokenInitClient::new(&env, &yes_addr).initialize(
            &market_addr,
            &String::from_str(&env, "StellarPredict YES"),
            &String::from_str(&env, "YES"),
            &dec,
        );
        TokenInitClient::new(&env, &no_addr).initialize(
            &market_addr,
            &String::from_str(&env, "StellarPredict NO"),
            &String::from_str(&env, "NO"),
            &dec,
        );
        TokenInitClient::new(&env, &lp_addr).initialize(
            &market_addr,
            &String::from_str(&env, "StellarPredict LP"),
            &String::from_str(&env, "SPLP"),
            &dec,
        );

        // ── Initialize + seed the market ────────────────────────────────
        let market = MarketClient::new(&env, &market_addr);
        market.initialize(
            &MarketParams {
                creator: creator.clone(),
                question: question.clone(),
                description,
                expiry_timestamp,
                condition,
            },
            &MarketContracts {
                yes_token: yes_addr,
                no_token: no_addr,
                lp_token: lp_addr,
                usdc_token: config.usdc_token.clone(),
                oracle_registry: config.oracle_registry.clone(),
                factory: env.current_contract_address(),
            },
            &FeeConfig {
                trading_fee_rate: config.trading_fee_rate,
                protocol_fee_share: config.protocol_fee_share,
                protocol_treasury: config.protocol_treasury.clone(),
                max_single_trade_pct: config.max_single_trade_pct,
            },
        );
        // Market pulls `initial_usdc` from the creator and opens the pool.
        market.initialize_pool(&initial_usdc, &initial_yes_price_bps);

        // ── Register ────────────────────────────────────────────────────
        env.storage()
            .instance()
            .set(&FactoryKey::Market(index), &market_addr);
        env.storage()
            .instance()
            .set(&FactoryKey::MarketByAddress(market_addr.clone()), &index);
        env.storage()
            .instance()
            .set(&FactoryKey::MarketCount, &(index + 1));
        bump(&env);

        env.events().publish(
            (symbol_short!("factory"), symbol_short!("created")),
            (
                index,
                market_addr.clone(),
                creator,
                question,
                expiry_timestamp,
            ),
        );
        market_addr
    }

    /// Market address by index.
    pub fn get_market(env: Env, index: u64) -> Address {
        env.storage()
            .instance()
            .get(&FactoryKey::Market(index))
            .unwrap_or_else(|| panic_with_error!(&env, FactoryError::MarketNotFound))
    }

    /// Total number of markets created.
    pub fn get_market_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&FactoryKey::MarketCount)
            .unwrap_or(0)
    }

    /// Paginated list of market addresses.
    pub fn list_markets(env: Env, page: u32, page_size: u32) -> Vec<Address> {
        let count: u64 = env
            .storage()
            .instance()
            .get(&FactoryKey::MarketCount)
            .unwrap_or(0);
        let start = (page as u64) * (page_size as u64);
        let mut out = Vec::new(&env);
        let mut i = start;
        while i < start + page_size as u64 && i < count {
            if let Some(addr) = env.storage().instance().get(&FactoryKey::Market(i)) {
                out.push_back(addr);
            }
            i += 1;
        }
        out
    }

    /// Read the protocol configuration.
    pub fn get_config(env: Env) -> FactoryConfig {
        Self::config(&env)
    }

    // ── Admin ───────────────────────────────────────────────────────────

    /// Update the trading fee rate applied to *new* markets. Admin only.
    pub fn update_trading_fee_rate(env: Env, new_rate: i128) {
        let mut config = Self::config(&env);
        config.admin.require_auth();
        config.trading_fee_rate = new_rate;
        env.storage().instance().set(&FactoryKey::Config, &config);
        bump(&env);
    }

    /// Update the market creation fee. Admin only.
    pub fn update_market_creation_fee(env: Env, new_fee: i128) {
        let mut config = Self::config(&env);
        config.admin.require_auth();
        config.market_creation_fee = new_fee;
        env.storage().instance().set(&FactoryKey::Config, &config);
        bump(&env);
    }

    /// Upgrade the factory contract itself. Admin only.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let config = Self::config(&env);
        config.admin.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    // ── Internal ────────────────────────────────────────────────────────
    fn config(env: &Env) -> FactoryConfig {
        env.storage()
            .instance()
            .get(&FactoryKey::Config)
            .unwrap_or_else(|| panic_with_error!(env, FactoryError::NotInitialized))
    }
}

/// Deterministic 32-byte deployment salt derived from a counter.
fn salt(env: &Env, n: u64) -> BytesN<32> {
    let mut bytes = [0u8; 32];
    let b = n.to_be_bytes();
    let mut i = 0;
    while i < 8 {
        bytes[i] = b[i];
        i += 1;
    }
    BytesN::from_array(env, &bytes)
}

fn bump(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

mod test;
