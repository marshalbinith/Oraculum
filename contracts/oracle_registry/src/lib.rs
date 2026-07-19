#![no_std]
//! # Oracle Registry Contract
//!
//! On-chain aggregation point for StellarPredict price feeds. Approved oracle
//! operators submit signed price attestations; Market contracts read the latest
//! price (or a price near a target timestamp) to resolve outcomes.
//!
//! All prices are integers scaled by 10^7 (Stellar stroop precision).

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, Address,
    Env, String, Symbol, Vec,
};

// ─────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────

/// A submitted attestation's timestamp may not be older than this (seconds).
const MAX_SUBMIT_AGE: u64 = 7_200; // 2 hours
/// Allowance for small clock skew when validating future-dated timestamps.
const MAX_FUTURE_SKEW: u64 = 60;

/// TTL management (ledgers). ~17,280 ledgers/day at 5s close time.
const DAY_IN_LEDGERS: u32 = 17_280;
const INSTANCE_BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
const INSTANCE_LIFETIME_THRESHOLD: u32 = INSTANCE_BUMP_AMOUNT - DAY_IN_LEDGERS;
const PERSISTENT_BUMP_AMOUNT: u32 = 90 * DAY_IN_LEDGERS;
const PERSISTENT_LIFETIME_THRESHOLD: u32 = PERSISTENT_BUMP_AMOUNT - DAY_IN_LEDGERS;

// ─────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum OracleError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NotAuthorized = 3,
    FeedNotFound = 4,
    FeedInactive = 5,
    FeedAlreadyExists = 6,
    InvalidPrice = 7,
    StaleTimestamp = 8,
    FutureTimestamp = 9,
    NoPriceData = 10,
    PriceTooStale = 11,
    InvalidThreshold = 12,
}

// ─────────────────────────────────────────────────────────────────────────
// Storage keys & data types
// ─────────────────────────────────────────────────────────────────────────

#[derive(Clone)]
#[contracttype]
pub enum OracleKey {
    Admin,
    StalenessThreshold,
    FeedConfig(Symbol),
    LatestPrice(Symbol),
    Operator(Address),
    FeedList,
}

#[contracttype]
#[derive(Clone)]
pub struct FeedConfig {
    pub feed_id: Symbol,
    pub description: String,
    pub decimals: u32,
    pub active: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct PriceData {
    pub price: i128,
    pub confidence: i128,
    pub timestamp: u64,
    pub operator: Address,
}

// ─────────────────────────────────────────────────────────────────────────
// Contract
// ─────────────────────────────────────────────────────────────────────────

#[contract]
pub struct OracleRegistry;

#[contractimpl]
impl OracleRegistry {
    /// Initialize the registry with an admin and a staleness threshold (seconds).
    /// The admin may register feeds, manage operators, and tune the threshold.
    pub fn initialize(env: Env, admin: Address, staleness_threshold: u64) {
        if env.storage().instance().has(&OracleKey::Admin) {
            panic_with_error!(&env, OracleError::AlreadyInitialized);
        }
        if staleness_threshold == 0 {
            panic_with_error!(&env, OracleError::InvalidThreshold);
        }
        env.storage().instance().set(&OracleKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&OracleKey::StalenessThreshold, &staleness_threshold);
        env.storage()
            .instance()
            .set(&OracleKey::FeedList, &Vec::<Symbol>::new(&env));
        bump_instance(&env);
    }

    /// Register a new price feed. Admin only.
    pub fn register_feed(env: Env, feed_id: Symbol, description: String, decimals: u32) {
        Self::require_admin(&env);
        if env
            .storage()
            .persistent()
            .has(&OracleKey::FeedConfig(feed_id.clone()))
        {
            panic_with_error!(&env, OracleError::FeedAlreadyExists);
        }

        let config = FeedConfig {
            feed_id: feed_id.clone(),
            description,
            decimals,
            active: true,
        };
        env.storage()
            .persistent()
            .set(&OracleKey::FeedConfig(feed_id.clone()), &config);
        bump_persistent(&env, &OracleKey::FeedConfig(feed_id.clone()));

        let mut feeds: Vec<Symbol> = env
            .storage()
            .instance()
            .get(&OracleKey::FeedList)
            .unwrap_or_else(|| Vec::new(&env));
        feeds.push_back(feed_id.clone());
        env.storage().instance().set(&OracleKey::FeedList, &feeds);
        bump_instance(&env);

        env.events()
            .publish((symbol_short!("oracle"), symbol_short!("feed_reg")), feed_id);
    }

    /// Approve or revoke an oracle operator's ability to submit prices. Admin only.
    pub fn set_operator(env: Env, operator: Address, approved: bool) {
        Self::require_admin(&env);
        env.storage()
            .persistent()
            .set(&OracleKey::Operator(operator.clone()), &approved);
        bump_persistent(&env, &OracleKey::Operator(operator.clone()));
        env.events().publish(
            (symbol_short!("oracle"), symbol_short!("operator")),
            (operator, approved),
        );
    }

    /// Submit a price attestation for a feed. Only approved operators may call.
    ///
    /// Note: the operator `Address` is an explicit parameter (a necessary
    /// refinement of the spec's bare signature) because Soroban authorization is
    /// per-`Address` via `require_auth` — there is no generic "message caller".
    ///
    /// * `operator` — the submitting operator; must be approved and authorize.
    /// * `price` — feed price scaled by 10^7, must be strictly positive.
    /// * `confidence` — ±confidence interval scaled by 10^7.
    /// * `timestamp` — observation time; must be recent (≤ 2h old, not future).
    pub fn submit_price(
        env: Env,
        operator: Address,
        feed_id: Symbol,
        price: i128,
        confidence: i128,
        timestamp: u64,
    ) {
        // Auth: caller must authorize and be an approved operator.
        operator.require_auth();
        if !Self::is_operator(env.clone(), operator.clone()) {
            panic_with_error!(&env, OracleError::NotAuthorized);
        }

        // Feed must exist and be active.
        let config = Self::load_feed(&env, &feed_id);
        if !config.active {
            panic_with_error!(&env, OracleError::FeedInactive);
        }

        // Sanity bounds.
        if price <= 0 || confidence < 0 {
            panic_with_error!(&env, OracleError::InvalidPrice);
        }

        let now = env.ledger().timestamp();
        if timestamp > now + MAX_FUTURE_SKEW {
            panic_with_error!(&env, OracleError::FutureTimestamp);
        }
        if now.saturating_sub(timestamp) > MAX_SUBMIT_AGE {
            panic_with_error!(&env, OracleError::StaleTimestamp);
        }

        let data = PriceData {
            price,
            confidence,
            timestamp,
            operator: operator.clone(),
        };
        env.storage()
            .persistent()
            .set(&OracleKey::LatestPrice(feed_id.clone()), &data);
        bump_persistent(&env, &OracleKey::LatestPrice(feed_id.clone()));

        env.events().publish(
            (symbol_short!("oracle"), symbol_short!("price")),
            (feed_id, price, timestamp),
        );
    }

    /// Read the latest price for a feed. Reverts if no data exists or the latest
    /// price is older than the configured staleness threshold.
    /// Returns `(price, timestamp)`.
    pub fn get_price(env: Env, feed_id: Symbol) -> (i128, u64) {
        let data = Self::load_price(&env, &feed_id);
        let threshold: u64 = env
            .storage()
            .instance()
            .get(&OracleKey::StalenessThreshold)
            .unwrap_or(0);
        let now = env.ledger().timestamp();
        if now.saturating_sub(data.timestamp) > threshold {
            panic_with_error!(&env, OracleError::PriceTooStale);
        }
        (data.price, data.timestamp)
    }

    /// Return the latest price if its timestamp is within `tolerance` seconds of
    /// `target_timestamp`, otherwise `None`. Used by Market contracts to resolve
    /// at a specific resolution time. Returns `None` rather than reverting so the
    /// caller can fall back to INVALID resolution.
    pub fn get_price_at(
        env: Env,
        feed_id: Symbol,
        target_timestamp: u64,
        tolerance: u64,
    ) -> Option<i128> {
        let data: Option<PriceData> = env
            .storage()
            .persistent()
            .get(&OracleKey::LatestPrice(feed_id));
        match data {
            Some(d) => {
                let delta = if d.timestamp > target_timestamp {
                    d.timestamp - target_timestamp
                } else {
                    target_timestamp - d.timestamp
                };
                if delta <= tolerance {
                    Some(d.price)
                } else {
                    None
                }
            }
            None => None,
        }
    }

    /// List all registered feed identifiers.
    pub fn list_feeds(env: Env) -> Vec<Symbol> {
        env.storage()
            .instance()
            .get(&OracleKey::FeedList)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Fetch a feed's configuration.
    pub fn get_feed(env: Env, feed_id: Symbol) -> FeedConfig {
        Self::load_feed(&env, &feed_id)
    }

    /// Whether an address is an approved operator.
    pub fn is_operator(env: Env, operator: Address) -> bool {
        env.storage()
            .persistent()
            .get(&OracleKey::Operator(operator))
            .unwrap_or(false)
    }

    /// Current staleness threshold (seconds).
    pub fn staleness_threshold(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&OracleKey::StalenessThreshold)
            .unwrap_or(0)
    }

    /// Update the staleness threshold. Admin only.
    pub fn update_staleness_threshold(env: Env, threshold: u64) {
        Self::require_admin(&env);
        if threshold == 0 {
            panic_with_error!(&env, OracleError::InvalidThreshold);
        }
        env.storage()
            .instance()
            .set(&OracleKey::StalenessThreshold, &threshold);
        bump_instance(&env);
    }

    /// The configured admin address.
    pub fn admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&OracleKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, OracleError::NotInitialized))
    }

    // ── Internal helpers ────────────────────────────────────────────────

    fn require_admin(env: &Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&OracleKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, OracleError::NotInitialized));
        admin.require_auth();
    }

    fn load_feed(env: &Env, feed_id: &Symbol) -> FeedConfig {
        env.storage()
            .persistent()
            .get(&OracleKey::FeedConfig(feed_id.clone()))
            .unwrap_or_else(|| panic_with_error!(env, OracleError::FeedNotFound))
    }

    fn load_price(env: &Env, feed_id: &Symbol) -> PriceData {
        env.storage()
            .persistent()
            .get(&OracleKey::LatestPrice(feed_id.clone()))
            .unwrap_or_else(|| panic_with_error!(env, OracleError::NoPriceData))
    }
}

// ─────────────────────────────────────────────────────────────────────────
// TTL helpers
// ─────────────────────────────────────────────────────────────────────────

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

fn bump_persistent(env: &Env, key: &OracleKey) {
    env.storage().persistent().extend_ttl(
        key,
        PERSISTENT_LIFETIME_THRESHOLD,
        PERSISTENT_BUMP_AMOUNT,
    );
}

mod test;
