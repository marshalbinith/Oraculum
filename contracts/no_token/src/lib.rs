#![no_std]
//! NO outcome token — SEP-41 token wrapping the shared [`token_base`] logic.
//! Minted to traders who buy NO; burned on sell, reward claim, or settlement.
//! The Market contract is the admin (sole minter/burner).

use soroban_sdk::{contract, contractimpl, Address, Env, String};
use token_base as base;

#[contract]
pub struct NoToken;

#[contractimpl]
impl NoToken {
    /// Initialize token metadata. `admin` is the Market contract.
    pub fn initialize(env: Env, admin: Address, name: String, symbol: String, decimals: u32) {
        base::initialize(&env, admin, name, symbol, decimals);
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        base::transfer(&env, from, to, amount);
    }

    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        base::transfer_from(&env, spender, from, to, amount);
    }

    pub fn approve(env: Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32) {
        base::approve(&env, from, spender, amount, expiration_ledger);
    }

    pub fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        base::allowance(&env, from, spender)
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        base::balance(&env, id)
    }

    pub fn total_supply(env: Env) -> i128 {
        base::total_supply(&env)
    }

    pub fn name(env: Env) -> String {
        base::name(&env)
    }

    pub fn symbol(env: Env) -> String {
        base::symbol(&env)
    }

    pub fn decimals(env: Env) -> u32 {
        base::decimals(&env)
    }

    pub fn mint(env: Env, to: Address, amount: i128) {
        base::mint(&env, to, amount);
    }

    pub fn burn(env: Env, from: Address, amount: i128) {
        base::burn(&env, from, amount);
    }

    pub fn burn_from(env: Env, spender: Address, from: Address, amount: i128) {
        base::burn_from(&env, spender, from, amount);
    }
}

mod test;
