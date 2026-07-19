#![cfg(test)]

//! NO token shares `token_base` with YES/LP; the exhaustive suite lives in
//! `yes_token`. Here we smoke-test the wrapper wires up correctly.

use super::*;
use soroban_sdk::{testutils::Address as _, Env, String};
use token_base::TokenError;

fn setup() -> (Env, NoTokenClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(NoToken, ());
    let client = NoTokenClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(
        &admin,
        &String::from_str(&env, "NO"),
        &String::from_str(&env, "NO"),
        &7u32,
    );
    (env, client)
}

#[test]
fn mint_burn_and_transfer() {
    let (env, client) = setup();
    assert_eq!(client.symbol(), String::from_str(&env, "NO"));

    let a = Address::generate(&env);
    let b = Address::generate(&env);
    client.mint(&a, &1_000i128);
    assert_eq!(client.total_supply(), 1_000);

    client.transfer(&a, &b, &250i128);
    assert_eq!(client.balance(&b), 250);

    client.burn(&a, &750i128);
    assert_eq!(client.balance(&a), 0);
    assert_eq!(client.total_supply(), 250);
}

#[test]
fn overdraw_burn_fails() {
    let (env, client) = setup();
    let a = Address::generate(&env);
    client.mint(&a, &10i128);
    let res = client.try_burn(&a, &11i128);
    assert_eq!(res, Err(Ok(TokenError::InsufficientBalance.into())));
}
