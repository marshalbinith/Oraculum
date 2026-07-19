#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Env, String, Symbol,
};

fn setup() -> (Env, OracleRegistryClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 1_000_000);

    let contract_id = env.register(OracleRegistry, ());
    let client = OracleRegistryClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin, &3_600u64);
    (env, client, admin)
}

fn xlm_feed(env: &Env) -> Symbol {
    Symbol::new(env, "XLM_USD")
}

#[test]
fn initialize_sets_admin_and_threshold() {
    let (_env, client, admin) = setup();
    assert_eq!(client.admin(), admin);
    assert_eq!(client.staleness_threshold(), 3_600);
}

#[test]
#[should_panic]
fn double_initialize_panics() {
    let (_env, client, admin) = setup();
    client.initialize(&admin, &3_600u64);
}

#[test]
fn register_feed_and_list() {
    let (env, client, _admin) = setup();
    let feed = xlm_feed(&env);
    client.register_feed(&feed, &String::from_str(&env, "XLM/USD Price"), &7u32);

    let feeds = client.list_feeds();
    assert_eq!(feeds.len(), 1);
    assert_eq!(feeds.get(0).unwrap(), feed);

    let config = client.get_feed(&feed);
    assert_eq!(config.decimals, 7);
    assert!(config.active);
}

#[test]
fn register_duplicate_feed_fails() {
    let (env, client, _admin) = setup();
    let feed = xlm_feed(&env);
    client.register_feed(&feed, &String::from_str(&env, "XLM/USD"), &7u32);
    let res = client.try_register_feed(&feed, &String::from_str(&env, "XLM/USD"), &7u32);
    assert_eq!(res, Err(Ok(OracleError::FeedAlreadyExists.into())));
}

#[test]
fn approved_operator_can_submit_and_get_price() {
    let (env, client, _admin) = setup();
    let feed = xlm_feed(&env);
    client.register_feed(&feed, &String::from_str(&env, "XLM/USD"), &7u32);

    let operator = Address::generate(&env);
    client.set_operator(&operator, &true);
    assert!(client.is_operator(&operator));

    let now = env.ledger().timestamp();
    // $0.12 scaled by 10^7 = 1_200_000
    client.submit_price(&operator, &feed, &1_200_000i128, &1_000i128, &now);

    let (price, ts) = client.get_price(&feed);
    assert_eq!(price, 1_200_000);
    assert_eq!(ts, now);
}

#[test]
fn non_operator_cannot_submit() {
    let (env, client, _admin) = setup();
    let feed = xlm_feed(&env);
    client.register_feed(&feed, &String::from_str(&env, "XLM/USD"), &7u32);

    let rando = Address::generate(&env);
    let now = env.ledger().timestamp();
    let res = client.try_submit_price(&rando, &feed, &1_200_000i128, &0i128, &now);
    assert_eq!(res, Err(Ok(OracleError::NotAuthorized.into())));
}

#[test]
fn submit_negative_price_fails() {
    let (env, client, _admin) = setup();
    let feed = xlm_feed(&env);
    client.register_feed(&feed, &String::from_str(&env, "XLM/USD"), &7u32);
    let operator = Address::generate(&env);
    client.set_operator(&operator, &true);

    let now = env.ledger().timestamp();
    let res = client.try_submit_price(&operator, &feed, &-5i128, &0i128, &now);
    assert_eq!(res, Err(Ok(OracleError::InvalidPrice.into())));
}

#[test]
fn submit_future_timestamp_fails() {
    let (env, client, _admin) = setup();
    let feed = xlm_feed(&env);
    client.register_feed(&feed, &String::from_str(&env, "XLM/USD"), &7u32);
    let operator = Address::generate(&env);
    client.set_operator(&operator, &true);

    let future = env.ledger().timestamp() + 10_000;
    let res = client.try_submit_price(&operator, &feed, &1_200_000i128, &0i128, &future);
    assert_eq!(res, Err(Ok(OracleError::FutureTimestamp.into())));
}

#[test]
fn submit_old_timestamp_fails() {
    let (env, client, _admin) = setup();
    let feed = xlm_feed(&env);
    client.register_feed(&feed, &String::from_str(&env, "XLM/USD"), &7u32);
    let operator = Address::generate(&env);
    client.set_operator(&operator, &true);

    // 3 hours old > MAX_SUBMIT_AGE (2h)
    let old = env.ledger().timestamp() - 10_800;
    let res = client.try_submit_price(&operator, &feed, &1_200_000i128, &0i128, &old);
    assert_eq!(res, Err(Ok(OracleError::StaleTimestamp.into())));
}

#[test]
fn get_price_fails_when_stale() {
    let (env, client, _admin) = setup();
    let feed = xlm_feed(&env);
    client.register_feed(&feed, &String::from_str(&env, "XLM/USD"), &7u32);
    let operator = Address::generate(&env);
    client.set_operator(&operator, &true);

    let submit_ts = env.ledger().timestamp();
    client.submit_price(&operator, &feed, &1_200_000i128, &0i128, &submit_ts);

    // Advance ledger time beyond staleness threshold (3600s).
    env.ledger().with_mut(|li| li.timestamp = submit_ts + 7_200);
    let res = client.try_get_price(&feed);
    assert_eq!(res, Err(Ok(OracleError::PriceTooStale.into())));
}

#[test]
fn get_price_at_respects_tolerance() {
    let (env, client, _admin) = setup();
    let feed = xlm_feed(&env);
    client.register_feed(&feed, &String::from_str(&env, "XLM/USD"), &7u32);
    let operator = Address::generate(&env);
    client.set_operator(&operator, &true);

    let submit_ts = env.ledger().timestamp();
    client.submit_price(&operator, &feed, &1_200_000i128, &0i128, &submit_ts);

    // Target within tolerance → Some
    assert_eq!(
        client.get_price_at(&feed, &(submit_ts + 1_000), &3_600u64),
        Some(1_200_000)
    );
    // Target outside tolerance → None
    assert_eq!(
        client.get_price_at(&feed, &(submit_ts + 10_000), &3_600u64),
        None
    );
    // Unknown feed → None
    assert_eq!(
        client.get_price_at(&Symbol::new(&env, "BTC_USD"), &submit_ts, &3_600u64),
        None
    );
}

#[test]
fn latest_price_overwrites() {
    let (env, client, _admin) = setup();
    let feed = xlm_feed(&env);
    client.register_feed(&feed, &String::from_str(&env, "XLM/USD"), &7u32);
    let operator = Address::generate(&env);
    client.set_operator(&operator, &true);

    let t0 = env.ledger().timestamp();
    client.submit_price(&operator, &feed, &1_200_000i128, &0i128, &t0);
    let t1 = t0 + 100;
    env.ledger().with_mut(|li| li.timestamp = t1);
    client.submit_price(&operator, &feed, &1_500_000i128, &0i128, &t1);

    let (price, ts) = client.get_price(&feed);
    assert_eq!(price, 1_500_000);
    assert_eq!(ts, t1);
}

#[test]
fn update_staleness_threshold_works() {
    let (_env, client, _admin) = setup();
    client.update_staleness_threshold(&1_800u64);
    assert_eq!(client.staleness_threshold(), 1_800);
}

#[test]
fn submit_to_unregistered_feed_fails() {
    let (env, client, _admin) = setup();
    let operator = Address::generate(&env);
    client.set_operator(&operator, &true);
    let now = env.ledger().timestamp();
    let res = client.try_submit_price(
        &operator,
        &Symbol::new(&env, "NOPE"),
        &1_200_000i128,
        &0i128,
        &now,
    );
    assert_eq!(res, Err(Ok(OracleError::FeedNotFound.into())));
}

#[test]
fn revoked_operator_cannot_submit() {
    let (env, client, _admin) = setup();
    let feed = xlm_feed(&env);
    client.register_feed(&feed, &String::from_str(&env, "XLM/USD"), &7u32);
    let operator = Address::generate(&env);
    client.set_operator(&operator, &true);
    client.set_operator(&operator, &false);

    let now = env.ledger().timestamp();
    let res = client.try_submit_price(&operator, &feed, &1_200_000i128, &0i128, &now);
    assert_eq!(res, Err(Ok(OracleError::NotAuthorized.into())));
}
