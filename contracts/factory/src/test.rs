#![cfg(test)]

use super::*;
use market::{Comparison, MarketClient, MarketStatus, ResolutionCondition};
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token, Address, Bytes, Env, String, Symbol,
};

// Compiled contract artifacts (build with:
//   cargo build --target wasm32v1-none --release -p market -p yes_token)
// The wasm32v1-none target avoids post-MVP wasm features (reference-types,
// multivalue) that the soroban-env-host VM rejects.
mod market_wasm {
    soroban_sdk::contractimport!(file = "../../target/wasm32v1-none/release/market.wasm");
}
mod token_wasm {
    soroban_sdk::contractimport!(file = "../../target/wasm32v1-none/release/yes_token.wasm");
}

const USDC: i128 = 10_000_000;
const BASE_TIME: u64 = 1_000_000;
const EXPIRY: u64 = BASE_TIME + 7_200; // 2 hours
const CREATION_FEE: i128 = 10 * USDC;
const MIN_LIQ: i128 = 100 * USDC;

struct Fix {
    env: Env,
    factory: FactoryClient<'static>,
    usdc: token::TokenClient<'static>,
    usdc_admin: token::StellarAssetClient<'static>,
    treasury: Address,
    creator: Address,
    feed: Symbol,
}

fn setup() -> Fix {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = BASE_TIME);

    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let creator = Address::generate(&env);
    let feed = Symbol::new(&env, "XLM_USD");

    // USDC SAC.
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let usdc_addr = sac.address();
    let usdc = token::TokenClient::new(&env, &usdc_addr);
    let usdc_admin = token::StellarAssetClient::new(&env, &usdc_addr);

    // Oracle registry.
    let oracle_addr = env.register(oracle_registry::OracleRegistry, ());
    let oracle = oracle_registry::OracleRegistryClient::new(&env, &oracle_addr);
    oracle.initialize(&admin, &86_400u64);
    oracle.register_feed(&feed, &String::from_str(&env, "XLM/USD"), &7u32);

    // Upload market + token wasm, get hashes.
    let market_hash = env
        .deployer()
        .upload_contract_wasm(Bytes::from_slice(&env, market_wasm::WASM));
    let token_hash = env
        .deployer()
        .upload_contract_wasm(Bytes::from_slice(&env, token_wasm::WASM));

    // Factory.
    let factory_addr = env.register(Factory, ());
    let factory = FactoryClient::new(&env, &factory_addr);
    factory.initialize(&FactoryConfig {
        admin: admin.clone(),
        oracle_registry: oracle_addr,
        protocol_treasury: treasury.clone(),
        usdc_token: usdc_addr,
        market_creation_fee: CREATION_FEE,
        trading_fee_rate: 200,
        protocol_fee_share: 1000,
        min_initial_liquidity: MIN_LIQ,
        max_single_trade_pct: 2000,
        market_wasm_hash: market_hash,
        token_wasm_hash: token_hash,
    });

    Fix {
        env,
        factory,
        usdc,
        usdc_admin,
        treasury,
        creator,
        feed,
    }
}

impl Fix {
    fn condition(&self) -> ResolutionCondition {
        ResolutionCondition {
            feed_id: self.feed.clone(),
            comparison: Comparison::Gt,
            threshold: USDC,
            resolution_timestamp: EXPIRY,
        }
    }

    fn create(&self, initial_usdc: i128, yes_bps: i128) -> Address {
        self.factory.create_market(
            &self.creator,
            &String::from_str(&self.env, "Will XLM/USD be above $1?"),
            &String::from_str(&self.env, "desc"),
            &EXPIRY,
            &self.condition(),
            &initial_usdc,
            &yes_bps,
        )
    }
}

#[test]
fn create_market_deploys_and_registers() {
    let f = setup();
    f.usdc_admin.mint(&f.creator, &(2_000 * USDC));

    let market_addr = f.create(1_000 * USDC, 5_000);
    assert_eq!(f.factory.get_market_count(), 1);
    assert_eq!(f.factory.get_market(&0), market_addr);

    // The deployed market is live and priced as requested.
    let market = MarketClient::new(&f.env, &market_addr);
    assert_eq!(market.get_status(), MarketStatus::Open);
    assert_eq!(market.get_yes_price(), 5_000_000);
}

#[test]
fn creation_fee_is_collected() {
    let f = setup();
    f.usdc_admin.mint(&f.creator, &(2_000 * USDC));
    let treasury_before = f.usdc.balance(&f.treasury);
    f.create(1_000 * USDC, 5_000);
    assert_eq!(f.usdc.balance(&f.treasury) - treasury_before, CREATION_FEE);
}

#[test]
fn deployed_market_is_tradeable() {
    let f = setup();
    f.usdc_admin.mint(&f.creator, &(2_000 * USDC));
    let market_addr = f.create(1_000 * USDC, 5_000);
    let market = MarketClient::new(&f.env, &market_addr);

    let trader = Address::generate(&f.env);
    f.usdc_admin.mint(&trader, &(500 * USDC));
    let yes_out = market.buy_yes(&trader, &(100 * USDC), &0);
    assert!(yes_out > 0);
    assert!(market.get_yes_price() > 5_000_000);
}

#[test]
fn past_expiry_reverts() {
    let f = setup();
    f.usdc_admin.mint(&f.creator, &(2_000 * USDC));
    let res = f.factory.try_create_market(
        &f.creator,
        &String::from_str(&f.env, "q"),
        &String::from_str(&f.env, "d"),
        &(BASE_TIME - 1),
        &f.condition(),
        &(1_000 * USDC),
        &5_000,
    );
    assert_eq!(res, Err(Ok(FactoryError::ExpiryInPast.into())));
}

#[test]
fn duration_too_short_reverts() {
    let f = setup();
    f.usdc_admin.mint(&f.creator, &(2_000 * USDC));
    let res = f.factory.try_create_market(
        &f.creator,
        &String::from_str(&f.env, "q"),
        &String::from_str(&f.env, "d"),
        &(BASE_TIME + 30), // 30s < 60s (MIN_DURATION) min
        &f.condition(),
        &(1_000 * USDC),
        &5_000,
    );
    assert_eq!(res, Err(Ok(FactoryError::DurationTooShort.into())));
}

#[test]
fn insufficient_liquidity_reverts() {
    let f = setup();
    f.usdc_admin.mint(&f.creator, &(2_000 * USDC));
    let res = f.factory.try_create_market(
        &f.creator,
        &String::from_str(&f.env, "q"),
        &String::from_str(&f.env, "d"),
        &EXPIRY,
        &f.condition(),
        &(50 * USDC), // below MIN_LIQ (100)
        &5_000,
    );
    assert_eq!(res, Err(Ok(FactoryError::InsufficientLiquidity.into())));
}

#[test]
fn invalid_price_reverts() {
    let f = setup();
    f.usdc_admin.mint(&f.creator, &(2_000 * USDC));
    let res = f.factory.try_create_market(
        &f.creator,
        &String::from_str(&f.env, "q"),
        &String::from_str(&f.env, "d"),
        &EXPIRY,
        &f.condition(),
        &(1_000 * USDC),
        &10_000, // 100% not allowed
    );
    assert_eq!(res, Err(Ok(FactoryError::InvalidPrice.into())));
}

#[test]
fn multiple_markets_listed() {
    let f = setup();
    f.usdc_admin.mint(&f.creator, &(10_000 * USDC));
    let m0 = f.create(1_000 * USDC, 5_000);
    let m1 = f.create(1_000 * USDC, 6_000);
    let m2 = f.create(1_000 * USDC, 4_000);

    assert_eq!(f.factory.get_market_count(), 3);
    let page = f.factory.list_markets(&0, &10);
    assert_eq!(page.len(), 3);
    assert_eq!(page.get(0).unwrap(), m0);
    assert_eq!(page.get(1).unwrap(), m1);
    assert_eq!(page.get(2).unwrap(), m2);

    // Pagination: second page of size 2 has 1 entry.
    let page2 = f.factory.list_markets(&1, &2);
    assert_eq!(page2.len(), 1);
    assert_eq!(page2.get(0).unwrap(), m2);
}

#[test]
fn double_initialize_reverts() {
    let f = setup();
    let admin = Address::generate(&f.env);
    let dummy = env_dummy_config(&f, &admin);
    let res = f.factory.try_initialize(&dummy);
    assert_eq!(res, Err(Ok(FactoryError::AlreadyInitialized.into())));
}

fn env_dummy_config(f: &Fix, admin: &Address) -> FactoryConfig {
    let zero_hash = soroban_sdk::BytesN::from_array(&f.env, &[0u8; 32]);
    FactoryConfig {
        admin: admin.clone(),
        oracle_registry: admin.clone(),
        protocol_treasury: f.treasury.clone(),
        usdc_token: f.usdc.address.clone(),
        market_creation_fee: 0,
        trading_fee_rate: 200,
        protocol_fee_share: 1000,
        min_initial_liquidity: MIN_LIQ,
        max_single_trade_pct: 2000,
        market_wasm_hash: zero_hash.clone(),
        token_wasm_hash: zero_hash,
    }
}
