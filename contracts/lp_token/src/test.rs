#![cfg(test)]

//! LP token shares `token_base` with YES/NO; the exhaustive suite lives in
//! `yes_token`. Here we smoke-test the wrapper wires up correctly.

use super::*;
use soroban_sdk::{testutils::Address as _, Env, String};
use token_base::TokenError;

fn setup() -> (Env, LpTokenClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(LpToken, ());
    let client = LpTokenClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(
        &admin,
        &String::from_str(&env, "SP-LP"),
        &String::from_str(&env, "SPLP"),
        &7u32,
    );
    (env, client)
}

#[test]
fn mint_burn_and_supply() {
    let (env, client) = setup();
    assert_eq!(client.symbol(), String::from_str(&env, "SPLP"));

    let lp = Address::generate(&env);
    client.mint(&lp, &5_000i128);
    assert_eq!(client.balance(&lp), 5_000);
    assert_eq!(client.total_supply(), 5_000);

    client.burn(&lp, &2_000i128);
    assert_eq!(client.balance(&lp), 3_000);
    assert_eq!(client.total_supply(), 3_000);
}

#[test]
fn mint_negative_fails() {
    let (env, client) = setup();
    let lp = Address::generate(&env);
    let res = client.try_mint(&lp, &-1i128);
    assert_eq!(res, Err(Ok(TokenError::InvalidAmount.into())));
}
