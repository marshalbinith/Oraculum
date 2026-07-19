#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token, Address, Env, String, Symbol,
};

// Scaled constants for readability.
const USDC: i128 = 10_000_000; // 1 USDC in stroops (10^7)
const FEE_RATE: i128 = 200; // 2%
const PROTO_SHARE: i128 = 1000; // 10% of fees
const MAX_TRADE_PCT: i128 = 2000; // 20% of reserve

const BASE_TIME: u64 = 1_000_000;
const EXPIRY: u64 = BASE_TIME + 1_000;
const THRESHOLD: i128 = 1 * USDC; // $1.00

#[allow(dead_code)]
struct Harness {
    env: Env,
    market: MarketClient<'static>,
    usdc: token::TokenClient<'static>,
    usdc_admin: token::StellarAssetClient<'static>,
    yes: yes_token::YesTokenClient<'static>,
    no: no_token::NoTokenClient<'static>,
    lp: lp_token::LpTokenClient<'static>,
    oracle: oracle_registry::OracleRegistryClient<'static>,
    operator: Address,
    treasury: Address,
    creator: Address,
    feed: Symbol,
}

fn comparison_market(comparison: Comparison) -> Harness {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = BASE_TIME);

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let treasury = Address::generate(&env);
    let operator = Address::generate(&env);
    let feed = Symbol::new(&env, "XLM_USD");

    // USDC (Stellar Asset Contract).
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let usdc_addr = sac.address();
    let usdc = token::TokenClient::new(&env, &usdc_addr);
    let usdc_admin = token::StellarAssetClient::new(&env, &usdc_addr);

    // Oracle registry.
    let oracle_addr = env.register(oracle_registry::OracleRegistry, ());
    let oracle = oracle_registry::OracleRegistryClient::new(&env, &oracle_addr);
    oracle.initialize(&admin, &86_400u64);
    oracle.register_feed(&feed, &String::from_str(&env, "XLM/USD"), &7u32);
    oracle.set_operator(&operator, &true);

    // Market contract.
    let market_addr = env.register(Market, ());
    let market = MarketClient::new(&env, &market_addr);

    // Outcome + LP tokens (admin = market).
    let yes_addr = env.register(yes_token::YesToken, ());
    let yes = yes_token::YesTokenClient::new(&env, &yes_addr);
    yes.initialize(
        &market_addr,
        &String::from_str(&env, "YES"),
        &String::from_str(&env, "YES"),
        &7u32,
    );
    let no_addr = env.register(no_token::NoToken, ());
    let no = no_token::NoTokenClient::new(&env, &no_addr);
    no.initialize(
        &market_addr,
        &String::from_str(&env, "NO"),
        &String::from_str(&env, "NO"),
        &7u32,
    );
    let lp_addr = env.register(lp_token::LpToken, ());
    let lp = lp_token::LpTokenClient::new(&env, &lp_addr);
    lp.initialize(
        &market_addr,
        &String::from_str(&env, "LP"),
        &String::from_str(&env, "LP"),
        &7u32,
    );

    let condition = ResolutionCondition {
        feed_id: feed.clone(),
        comparison,
        threshold: THRESHOLD,
        resolution_timestamp: EXPIRY,
    };
    market.initialize(
        &MarketParams {
            creator: creator.clone(),
            question: String::from_str(&env, "Will XLM/USD be above $1?"),
            description: String::from_str(&env, ""),
            expiry_timestamp: EXPIRY,
            condition,
        },
        &MarketContracts {
            yes_token: yes_addr,
            no_token: no_addr,
            lp_token: lp_addr,
            usdc_token: usdc_addr,
            oracle_registry: oracle_addr,
            factory: admin.clone(),
        },
        &FeeConfig {
            trading_fee_rate: FEE_RATE,
            protocol_fee_share: PROTO_SHARE,
            protocol_treasury: treasury.clone(),
            max_single_trade_pct: MAX_TRADE_PCT,
        },
    );

    Harness {
        env,
        market,
        usdc,
        usdc_admin,
        yes,
        no,
        lp,
        oracle,
        operator,
        treasury,
        creator,
        feed,
    }
}

impl Harness {
    fn fund(&self, who: &Address, amount: i128) {
        self.usdc_admin.mint(who, &amount);
    }

    fn open_pool(&self, initial_usdc: i128, yes_price_bps: i128) {
        self.fund(&self.creator, initial_usdc);
        self.market
            .initialize_pool(&initial_usdc, &yes_price_bps);
    }

    fn new_funded_account(&self, amount: i128) -> Address {
        let a = Address::generate(&self.env);
        self.fund(&a, amount);
        a
    }

    fn submit_price(&self, price: i128, timestamp: u64) {
        self.oracle
            .submit_price(&self.operator, &self.feed, &price, &0i128, &timestamp);
    }

    fn advance_to(&self, t: u64) {
        self.env.ledger().with_mut(|li| li.timestamp = t);
    }
}

fn k_of(state: &AmmState) -> i128 {
    state.yes_reserve * state.no_reserve
}

// ── Seeding & pricing ───────────────────────────────────────────────────

#[test]
fn seeding_realizes_target_price() {
    let h = comparison_market(Comparison::Gt);
    h.open_pool(1_000 * USDC, 7_000); // 70%
    assert_eq!(h.market.get_yes_price(), 7_000_000); // 0.70 scaled 10^7
    assert_eq!(h.market.get_no_price(), 3_000_000);
}

#[test]
fn prices_always_sum_to_one() {
    let h = comparison_market(Comparison::Gt);
    h.open_pool(1_000 * USDC, 5_000);
    let trader = h.new_funded_account(500 * USDC);
    h.market.buy_yes(&trader, &(100 * USDC), &0);
    let s = h.market.get_amm_state();
    // Independent floor-rounding of each side may leave 1 stroop of dust.
    assert!((s.yes_price + s.no_price - SCALE).abs() <= 1);
}

// ── Trading & invariants ────────────────────────────────────────────────

#[test]
fn buy_yes_raises_price_and_preserves_k() {
    let h = comparison_market(Comparison::Gt);
    h.open_pool(1_000 * USDC, 5_000);
    let before = h.market.get_amm_state();
    let k_before = k_of(&before);

    let trader = h.new_funded_account(500 * USDC);
    let yes_out = h.market.buy_yes(&trader, &(100 * USDC), &0);
    assert!(yes_out > 0);
    assert_eq!(h.yes.balance(&trader), yes_out);

    let after = h.market.get_amm_state();
    assert!(after.yes_price > before.yes_price, "YES price should rise");
    // k preserved up to integer truncation (never increases).
    let k_after = k_of(&after);
    assert!(k_after <= k_before);
    assert!(k_before - k_after < k_before / 1_000_000); // < 1e-6 drift
}

#[test]
fn buy_no_raises_no_price() {
    let h = comparison_market(Comparison::Gt);
    h.open_pool(1_000 * USDC, 5_000);
    let before = h.market.get_no_price();
    let trader = h.new_funded_account(500 * USDC);
    h.market.buy_no(&trader, &(100 * USDC), &0);
    assert!(h.market.get_no_price() > before);
}

#[test]
fn fee_accrues_to_pool_and_protocol() {
    let h = comparison_market(Comparison::Gt);
    h.open_pool(1_000 * USDC, 5_000);
    let trader = h.new_funded_account(500 * USDC);

    let treasury_before = h.usdc.balance(&h.treasury);
    h.market.buy_yes(&trader, &(100 * USDC), &0);
    let s = h.market.get_amm_state();

    // 2% of 100 USDC = 2 USDC; 10% to protocol = 0.2, 90% to pool = 1.8.
    let fee_total = 100 * USDC * FEE_RATE / BPS;
    let fee_protocol = fee_total * PROTO_SHARE / BPS;
    let fee_pool = fee_total - fee_protocol;
    assert_eq!(s.fee_pool, fee_pool);
    assert_eq!(h.usdc.balance(&h.treasury) - treasury_before, fee_protocol);
}

#[test]
fn buy_then_sell_roundtrip_costs_fees() {
    let h = comparison_market(Comparison::Gt);
    h.open_pool(1_000 * USDC, 5_000);
    let trader = h.new_funded_account(500 * USDC);

    let spend = 100 * USDC;
    let yes_out = h.market.buy_yes(&trader, &spend, &0);
    let usdc_back = h.market.sell_yes(&trader, &yes_out, &0);
    // Round trip returns strictly less than spent (two fee legs + slippage).
    assert!(usdc_back < spend);
    assert!(usdc_back > 0);
    assert_eq!(h.yes.balance(&trader), 0);
}

#[test]
fn slippage_protection_reverts() {
    let h = comparison_market(Comparison::Gt);
    h.open_pool(1_000 * USDC, 5_000);
    let trader = h.new_funded_account(500 * USDC);
    // Demand an impossibly high YES output.
    let res = h.market.try_buy_yes(&trader, &(100 * USDC), &(1_000_000 * USDC));
    assert_eq!(res, Err(Ok(MarketError::SlippageExceeded.into())));
}

#[test]
fn trade_below_minimum_reverts() {
    let h = comparison_market(Comparison::Gt);
    h.open_pool(1_000 * USDC, 5_000);
    let trader = h.new_funded_account(500 * USDC);
    let res = h.market.try_buy_yes(&trader, &1_000i128, &0); // 0.0001 USDC
    assert_eq!(res, Err(Ok(MarketError::TradeTooSmall.into())));
}

#[test]
fn trade_above_cap_reverts() {
    let h = comparison_market(Comparison::Gt);
    h.open_pool(1_000 * USDC, 5_000);
    let trader = h.new_funded_account(10_000 * USDC);
    // usdc_reserve = 1000 USDC; cap = 20% = 200 USDC. 300 exceeds it.
    let res = h.market.try_buy_yes(&trader, &(300 * USDC), &0);
    assert_eq!(res, Err(Ok(MarketError::TradeTooLarge.into())));
}

#[test]
fn quote_matches_execution() {
    let h = comparison_market(Comparison::Gt);
    h.open_pool(1_000 * USDC, 5_000);
    let trader = h.new_funded_account(500 * USDC);
    let (quoted, _impact) = h.market.quote_buy_yes(&(100 * USDC));
    let actual = h.market.buy_yes(&trader, &(100 * USDC), &0);
    assert_eq!(quoted, actual);
}

// ── Liquidity ───────────────────────────────────────────────────────────

#[test]
fn add_liquidity_preserves_price_and_mints_lp() {
    let h = comparison_market(Comparison::Gt);
    h.open_pool(1_000 * USDC, 6_000);
    let price_before = h.market.get_yes_price();

    let lp2 = h.new_funded_account(1_000 * USDC);
    let minted = h.market.add_liquidity(&lp2, &(500 * USDC));
    assert!(minted > 0);
    assert_eq!(h.lp.balance(&lp2), minted);
    // Price unchanged (within rounding) by proportional add.
    let price_after = h.market.get_yes_price();
    assert!((price_before - price_after).abs() <= 1);
}

// ── Lifecycle gating ────────────────────────────────────────────────────

#[test]
fn cannot_trade_before_open() {
    let h = comparison_market(Comparison::Gt);
    let trader = h.new_funded_account(500 * USDC);
    let res = h.market.try_buy_yes(&trader, &(100 * USDC), &0);
    assert_eq!(res, Err(Ok(MarketError::NotOpen.into())));
}

#[test]
fn lock_before_expiry_reverts() {
    let h = comparison_market(Comparison::Gt);
    h.open_pool(1_000 * USDC, 5_000);
    let res = h.market.try_lock_market();
    assert_eq!(res, Err(Ok(MarketError::NotExpired.into())));
}

#[test]
fn cannot_trade_after_lock() {
    let h = comparison_market(Comparison::Gt);
    h.open_pool(1_000 * USDC, 5_000);
    h.advance_to(EXPIRY);
    h.market.lock_market();
    let trader = h.new_funded_account(500 * USDC);
    let res = h.market.try_buy_yes(&trader, &(100 * USDC), &0);
    assert_eq!(res, Err(Ok(MarketError::NotOpen.into())));
}

#[test]
fn claim_before_resolution_reverts() {
    let h = comparison_market(Comparison::Gt);
    h.open_pool(1_000 * USDC, 5_000);
    let trader = h.new_funded_account(500 * USDC);
    h.market.buy_yes(&trader, &(100 * USDC), &0);
    let res = h.market.try_claim_reward(&trader);
    assert_eq!(res, Err(Ok(MarketError::NotResolved.into())));
}

// ── Full resolution flows ───────────────────────────────────────────────

#[test]
fn full_lifecycle_resolves_yes_and_pays_winners() {
    let h = comparison_market(Comparison::Gt);
    h.open_pool(1_000 * USDC, 5_000);

    let alice = h.new_funded_account(500 * USDC); // buys YES
    let bob = h.new_funded_account(500 * USDC); // buys NO
    h.market.buy_yes(&alice, &(100 * USDC), &0);
    h.market.buy_no(&bob, &(80 * USDC), &0);

    // Expire, lock, resolve with price above threshold → YES wins.
    h.advance_to(EXPIRY);
    h.submit_price(120 * USDC / 100, EXPIRY); // $1.20 > $1.00
    h.market.lock_market();
    h.market.request_resolution();
    assert_eq!(h.market.get_status(), MarketStatus::ResolvedYes);

    let alice_before = h.usdc.balance(&alice);
    let alice_payout = h.market.claim_reward(&alice);
    assert!(alice_payout > 0);
    assert_eq!(h.usdc.balance(&alice) - alice_before, alice_payout);
    assert_eq!(h.yes.balance(&alice), 0); // tokens burned

    // Bob held NO → nothing to claim.
    let bob_payout = h.market.claim_reward(&bob);
    assert_eq!(bob_payout, 0);

    // LP (creator) withdraws everything.
    let lp_bal = h.lp.balance(&h.creator);
    let (lp_usdc, _fees) = h.market.withdraw_liquidity(&h.creator, &lp_bal);
    assert!(lp_usdc > 0);

    // Contract should be drained to rounding dust after all claims/withdrawals.
    // Dust is bounded by ~pool/SCALE; assert solvency and < 1e-6 of the pool.
    let residual = h.usdc.balance(&h.market.address);
    assert!(residual >= 0);
    assert!(
        residual < (1_000 * USDC) / 1_000_000,
        "residual dust too high: {}",
        residual
    );
}

#[test]
fn full_lifecycle_resolves_no() {
    let h = comparison_market(Comparison::Gt);
    h.open_pool(1_000 * USDC, 5_000);

    let alice = h.new_funded_account(500 * USDC);
    let bob = h.new_funded_account(500 * USDC);
    h.market.buy_yes(&alice, &(100 * USDC), &0);
    h.market.buy_no(&bob, &(100 * USDC), &0);

    h.advance_to(EXPIRY);
    h.submit_price(80 * USDC / 100, EXPIRY); // $0.80 < $1.00 → NO wins
    h.market.lock_market();
    h.market.request_resolution();
    assert_eq!(h.market.get_status(), MarketStatus::ResolvedNo);

    assert!(h.market.claim_reward(&bob) > 0); // NO holder wins
    assert_eq!(h.market.claim_reward(&alice), 0); // YES holder loses
}

#[test]
fn double_claim_reverts() {
    let h = comparison_market(Comparison::Gt);
    h.open_pool(1_000 * USDC, 5_000);
    let alice = h.new_funded_account(500 * USDC);
    h.market.buy_yes(&alice, &(100 * USDC), &0);

    h.advance_to(EXPIRY);
    h.submit_price(120 * USDC / 100, EXPIRY);
    h.market.lock_market();
    h.market.request_resolution();

    h.market.claim_reward(&alice);
    let res = h.market.try_claim_reward(&alice);
    assert_eq!(res, Err(Ok(MarketError::AlreadyClaimed.into())));
}

#[test]
fn invalid_resolution_refunds_all() {
    let h = comparison_market(Comparison::Gt);
    h.open_pool(1_000 * USDC, 5_000);
    let alice = h.new_funded_account(500 * USDC);
    let bob = h.new_funded_account(500 * USDC);
    h.market.buy_yes(&alice, &(100 * USDC), &0);
    h.market.buy_no(&bob, &(100 * USDC), &0);

    h.advance_to(EXPIRY);
    // No usable oracle price is submitted → resolution falls through to INVALID.
    h.market.lock_market();
    h.market.request_resolution();
    assert_eq!(h.market.get_status(), MarketStatus::Invalid);

    // Both sides get a proportional refund.
    assert!(h.market.claim_reward(&alice) > 0);
    assert!(h.market.claim_reward(&bob) > 0);
}

#[test]
fn multiple_lps_share_proportionally() {
    let h = comparison_market(Comparison::Gt);
    h.open_pool(1_000 * USDC, 5_000); // creator gets 1000 LP
    let lp2 = h.new_funded_account(1_000 * USDC);
    let minted2 = h.market.add_liquidity(&lp2, &(1_000 * USDC));

    // Generate fees via a trade.
    let trader = h.new_funded_account(500 * USDC);
    h.market.buy_yes(&trader, &(100 * USDC), &0);

    h.advance_to(EXPIRY);
    h.submit_price(120 * USDC / 100, EXPIRY);
    h.market.lock_market();
    h.market.request_resolution();
    // Trader claims first to settle the winning pot.
    h.market.claim_reward(&trader);

    let creator_lp = h.lp.balance(&h.creator);
    let (creator_usdc, _) = h.market.withdraw_liquidity(&h.creator, &creator_lp);
    let (lp2_usdc, _) = h.market.withdraw_liquidity(&lp2, &minted2);

    // Creator (1000 LP) and lp2 (minted2 ≈ 1000 LP) get near-equal payouts.
    let diff = (creator_usdc - lp2_usdc).abs();
    assert!(diff < creator_usdc / 100, "LP payouts should be within 1%");
}

#[test]
fn resolves_no_when_price_equals_threshold_under_gt() {
    let h = comparison_market(Comparison::Gt);
    h.open_pool(1_000 * USDC, 5_000);
    let alice = h.new_funded_account(500 * USDC);
    h.market.buy_yes(&alice, &(100 * USDC), &0);

    h.advance_to(EXPIRY);
    h.submit_price(THRESHOLD, EXPIRY); // exactly $1.00, GT → NO
    h.market.lock_market();
    h.market.request_resolution();
    assert_eq!(h.market.get_status(), MarketStatus::ResolvedNo);
}

#[test]
fn resolves_yes_when_price_equals_threshold_under_gte() {
    let h = comparison_market(Comparison::Gte);
    h.open_pool(1_000 * USDC, 5_000);
    let alice = h.new_funded_account(500 * USDC);
    h.market.buy_yes(&alice, &(100 * USDC), &0);

    h.advance_to(EXPIRY);
    h.submit_price(THRESHOLD, EXPIRY); // exactly $1.00, GTE → YES
    h.market.lock_market();
    h.market.request_resolution();
    assert_eq!(h.market.get_status(), MarketStatus::ResolvedYes);
}
