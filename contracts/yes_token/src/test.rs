#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Env, String,
};
use token_base::TokenError;

fn setup() -> (Env, YesTokenClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.sequence_number = 100);

    let contract_id = env.register(YesToken, ());
    let client = YesTokenClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(
        &admin,
        &String::from_str(&env, "YES"),
        &String::from_str(&env, "YES"),
        &7u32,
    );
    (env, client, admin)
}

#[test]
fn initialize_sets_metadata() {
    let (env, client, _admin) = setup();
    assert_eq!(client.name(), String::from_str(&env, "YES"));
    assert_eq!(client.symbol(), String::from_str(&env, "YES"));
    assert_eq!(client.decimals(), 7);
    assert_eq!(client.total_supply(), 0);
}

#[test]
#[should_panic]
fn double_initialize_panics() {
    let (env, client, admin) = setup();
    client.initialize(
        &admin,
        &String::from_str(&env, "YES"),
        &String::from_str(&env, "YES"),
        &7u32,
    );
}

#[test]
fn mint_increases_balance_and_supply() {
    let (env, client, _admin) = setup();
    let user = Address::generate(&env);
    client.mint(&user, &1_000i128);
    assert_eq!(client.balance(&user), 1_000);
    assert_eq!(client.total_supply(), 1_000);
}

#[test]
fn burn_decreases_balance_and_supply() {
    let (env, client, _admin) = setup();
    let user = Address::generate(&env);
    client.mint(&user, &1_000i128);
    client.burn(&user, &400i128);
    assert_eq!(client.balance(&user), 600);
    assert_eq!(client.total_supply(), 600);
}

#[test]
fn cannot_burn_more_than_balance() {
    let (env, client, _admin) = setup();
    let user = Address::generate(&env);
    client.mint(&user, &100i128);
    let res = client.try_burn(&user, &200i128);
    assert_eq!(res, Err(Ok(TokenError::InsufficientBalance.into())));
}

#[test]
fn mint_zero_fails() {
    let (env, client, _admin) = setup();
    let user = Address::generate(&env);
    let res = client.try_mint(&user, &0i128);
    assert_eq!(res, Err(Ok(TokenError::InvalidAmount.into())));
}

#[test]
fn transfer_moves_tokens() {
    let (env, client, _admin) = setup();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    client.mint(&a, &1_000i128);
    client.transfer(&a, &b, &300i128);
    assert_eq!(client.balance(&a), 700);
    assert_eq!(client.balance(&b), 300);
    // Total supply unchanged by transfers.
    assert_eq!(client.total_supply(), 1_000);
}

#[test]
fn cannot_transfer_more_than_balance() {
    let (env, client, _admin) = setup();
    let a = Address::generate(&env);
    let b = Address::generate(&env);
    client.mint(&a, &100i128);
    let res = client.try_transfer(&a, &b, &500i128);
    assert_eq!(res, Err(Ok(TokenError::InsufficientBalance.into())));
}

#[test]
fn approve_and_transfer_from() {
    let (env, client, _admin) = setup();
    let owner = Address::generate(&env);
    let spender = Address::generate(&env);
    let recipient = Address::generate(&env);
    client.mint(&owner, &1_000i128);

    let expiration = env.ledger().sequence() + 1_000;
    client.approve(&owner, &spender, &500i128, &expiration);
    assert_eq!(client.allowance(&owner, &spender), 500);

    client.transfer_from(&spender, &owner, &recipient, &200i128);
    assert_eq!(client.balance(&owner), 800);
    assert_eq!(client.balance(&recipient), 200);
    // Allowance decremented.
    assert_eq!(client.allowance(&owner, &spender), 300);
}

#[test]
fn transfer_from_exceeding_allowance_fails() {
    let (env, client, _admin) = setup();
    let owner = Address::generate(&env);
    let spender = Address::generate(&env);
    let recipient = Address::generate(&env);
    client.mint(&owner, &1_000i128);

    let expiration = env.ledger().sequence() + 1_000;
    client.approve(&owner, &spender, &100i128, &expiration);
    let res = client.try_transfer_from(&spender, &owner, &recipient, &200i128);
    assert_eq!(res, Err(Ok(TokenError::InsufficientAllowance.into())));
}

#[test]
fn expired_allowance_is_zero() {
    let (env, client, _admin) = setup();
    let owner = Address::generate(&env);
    let spender = Address::generate(&env);
    client.mint(&owner, &1_000i128);

    let expiration = env.ledger().sequence() + 10;
    client.approve(&owner, &spender, &500i128, &expiration);
    // Advance past expiration.
    env.ledger().with_mut(|li| li.sequence_number += 50);
    assert_eq!(client.allowance(&owner, &spender), 0);
}

#[test]
fn burn_from_with_allowance() {
    let (env, client, _admin) = setup();
    let owner = Address::generate(&env);
    let spender = Address::generate(&env);
    client.mint(&owner, &1_000i128);

    let expiration = env.ledger().sequence() + 1_000;
    client.approve(&owner, &spender, &500i128, &expiration);
    client.burn_from(&spender, &owner, &300i128);
    assert_eq!(client.balance(&owner), 700);
    assert_eq!(client.total_supply(), 700);
    assert_eq!(client.allowance(&owner, &spender), 200);
}
