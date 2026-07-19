#![no_std]
//! # Token Base
//!
//! Shared SEP-41 (Soroban Token Interface) implementation used by the YES, NO,
//! and LP token contracts. Each concrete token is a thin `#[contract]` wrapper
//! that delegates to these free functions, so all three share one audited code
//! path while still exposing their own contract spec + generated client.
//!
//! Authorization model (StellarPredict-specific):
//! - `mint` / `burn` are **admin-only**. The Market contract is the admin and is
//!   the sole minter/burner of outcome and LP tokens. A contract is always
//!   authorized for sub-calls it makes itself, so the Market can mint/burn
//!   without holding a key.
//! - `transfer` / `approve` / `transfer_from` / `burn_from` follow standard
//!   SEP-41 holder/spender authorization (used by v2 transferable tokens).

use soroban_sdk::{
    contracterror, contracttype, panic_with_error, symbol_short, Address, Env, String,
};

// ── TTL management ──────────────────────────────────────────────────────
const DAY_IN_LEDGERS: u32 = 17_280;
const INSTANCE_BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
const INSTANCE_LIFETIME_THRESHOLD: u32 = INSTANCE_BUMP_AMOUNT - DAY_IN_LEDGERS;
const PERSISTENT_BUMP_AMOUNT: u32 = 90 * DAY_IN_LEDGERS;
const PERSISTENT_LIFETIME_THRESHOLD: u32 = PERSISTENT_BUMP_AMOUNT - DAY_IN_LEDGERS;

// ── Errors ──────────────────────────────────────────────────────────────
#[contracterror]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum TokenError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    NotAuthorized = 3,
    InsufficientBalance = 4,
    InsufficientAllowance = 5,
    InvalidAmount = 6,
    AllowanceExpired = 7,
    InvalidExpiration = 8,
}

// ── Storage keys & types ────────────────────────────────────────────────
#[derive(Clone)]
#[contracttype]
pub enum TokenKey {
    Admin,
    Balance(Address),
    Allowance(Address, Address), // (from, spender)
    TotalSupply,
    Name,
    Symbol,
    Decimals,
}

#[contracttype]
#[derive(Clone)]
pub struct AllowanceValue {
    pub amount: i128,
    pub expiration_ledger: u32,
}

// ── Lifecycle ───────────────────────────────────────────────────────────

/// Initialize token metadata and set the admin (the Market contract).
pub fn initialize(env: &Env, admin: Address, name: String, symbol: String, decimals: u32) {
    if env.storage().instance().has(&TokenKey::Admin) {
        panic_with_error!(env, TokenError::AlreadyInitialized);
    }
    env.storage().instance().set(&TokenKey::Admin, &admin);
    env.storage().instance().set(&TokenKey::Name, &name);
    env.storage().instance().set(&TokenKey::Symbol, &symbol);
    env.storage().instance().set(&TokenKey::Decimals, &decimals);
    env.storage().instance().set(&TokenKey::TotalSupply, &0i128);
    bump_instance(env);
}

// ── Read-only ───────────────────────────────────────────────────────────

pub fn balance(env: &Env, id: Address) -> i128 {
    env.storage()
        .persistent()
        .get(&TokenKey::Balance(id))
        .unwrap_or(0)
}

pub fn total_supply(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&TokenKey::TotalSupply)
        .unwrap_or(0)
}

pub fn allowance(env: &Env, from: Address, spender: Address) -> i128 {
    match load_allowance(env, &from, &spender) {
        Some(a) if a.expiration_ledger >= env.ledger().sequence() => a.amount,
        _ => 0,
    }
}

pub fn name(env: &Env) -> String {
    env.storage()
        .instance()
        .get(&TokenKey::Name)
        .unwrap_or_else(|| panic_with_error!(env, TokenError::NotInitialized))
}

pub fn symbol(env: &Env) -> String {
    env.storage()
        .instance()
        .get(&TokenKey::Symbol)
        .unwrap_or_else(|| panic_with_error!(env, TokenError::NotInitialized))
}

pub fn decimals(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&TokenKey::Decimals)
        .unwrap_or_else(|| panic_with_error!(env, TokenError::NotInitialized))
}

pub fn admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&TokenKey::Admin)
        .unwrap_or_else(|| panic_with_error!(env, TokenError::NotInitialized))
}

// ── Transfers & allowances ──────────────────────────────────────────────

pub fn transfer(env: &Env, from: Address, to: Address, amount: i128) {
    from.require_auth();
    check_positive(env, amount);
    decrease_balance(env, &from, amount);
    increase_balance(env, &to, amount);
    bump_instance(env);
    env.events()
        .publish((symbol_short!("transfer"), from, to), amount);
}

pub fn approve(env: &Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32) {
    from.require_auth();
    if amount < 0 {
        panic_with_error!(env, TokenError::InvalidAmount);
    }
    // A non-zero allowance must not already be expired.
    if amount > 0 && expiration_ledger < env.ledger().sequence() {
        panic_with_error!(env, TokenError::InvalidExpiration);
    }
    let value = AllowanceValue {
        amount,
        expiration_ledger,
    };
    env.storage().persistent().set(
        &TokenKey::Allowance(from.clone(), spender.clone()),
        &value,
    );
    if amount > 0 {
        bump_persistent(env, &TokenKey::Allowance(from.clone(), spender.clone()));
    }
    bump_instance(env);
    env.events().publish(
        (symbol_short!("approve"), from, spender),
        (amount, expiration_ledger),
    );
}

pub fn transfer_from(env: &Env, spender: Address, from: Address, to: Address, amount: i128) {
    spender.require_auth();
    check_positive(env, amount);
    spend_allowance(env, &from, &spender, amount);
    decrease_balance(env, &from, amount);
    increase_balance(env, &to, amount);
    bump_instance(env);
    env.events()
        .publish((symbol_short!("transfer"), from, to), amount);
}

// ── Admin mint / burn ───────────────────────────────────────────────────

/// Mint `amount` to `to`. Admin (Market) only.
pub fn mint(env: &Env, to: Address, amount: i128) {
    let admin = admin(env);
    admin.require_auth();
    check_positive(env, amount);
    increase_balance(env, &to, amount);
    set_total_supply(env, total_supply(env).checked_add(amount).unwrap());
    bump_instance(env);
    env.events()
        .publish((symbol_short!("mint"), admin, to), amount);
}

/// Burn `amount` from `from`. Admin (Market) only — used during sells, reward
/// claims, and LP withdrawals where the protocol controls token lifecycle.
pub fn burn(env: &Env, from: Address, amount: i128) {
    let admin = admin(env);
    admin.require_auth();
    check_positive(env, amount);
    decrease_balance(env, &from, amount);
    set_total_supply(env, total_supply(env).checked_sub(amount).unwrap());
    bump_instance(env);
    env.events()
        .publish((symbol_short!("burn"), from), amount);
}

/// Standard SEP-41 allowance-based burn (spender authorizes).
pub fn burn_from(env: &Env, spender: Address, from: Address, amount: i128) {
    spender.require_auth();
    check_positive(env, amount);
    spend_allowance(env, &from, &spender, amount);
    decrease_balance(env, &from, amount);
    set_total_supply(env, total_supply(env).checked_sub(amount).unwrap());
    bump_instance(env);
    env.events()
        .publish((symbol_short!("burn"), from), amount);
}

// ── Internal helpers ────────────────────────────────────────────────────

fn check_positive(env: &Env, amount: i128) {
    if amount <= 0 {
        panic_with_error!(env, TokenError::InvalidAmount);
    }
}

fn increase_balance(env: &Env, addr: &Address, amount: i128) {
    let new = balance(env, addr.clone()).checked_add(amount).unwrap();
    env.storage()
        .persistent()
        .set(&TokenKey::Balance(addr.clone()), &new);
    bump_persistent(env, &TokenKey::Balance(addr.clone()));
}

fn decrease_balance(env: &Env, addr: &Address, amount: i128) {
    let current = balance(env, addr.clone());
    if current < amount {
        panic_with_error!(env, TokenError::InsufficientBalance);
    }
    let new = current.checked_sub(amount).unwrap();
    env.storage()
        .persistent()
        .set(&TokenKey::Balance(addr.clone()), &new);
    bump_persistent(env, &TokenKey::Balance(addr.clone()));
}

fn set_total_supply(env: &Env, value: i128) {
    env.storage()
        .instance()
        .set(&TokenKey::TotalSupply, &value);
}

fn load_allowance(env: &Env, from: &Address, spender: &Address) -> Option<AllowanceValue> {
    env.storage()
        .persistent()
        .get(&TokenKey::Allowance(from.clone(), spender.clone()))
}

fn spend_allowance(env: &Env, from: &Address, spender: &Address, amount: i128) {
    let current = match load_allowance(env, from, spender) {
        Some(a) => a,
        None => panic_with_error!(env, TokenError::InsufficientAllowance),
    };
    if current.expiration_ledger < env.ledger().sequence() {
        panic_with_error!(env, TokenError::AllowanceExpired);
    }
    if current.amount < amount {
        panic_with_error!(env, TokenError::InsufficientAllowance);
    }
    let remaining = current.amount.checked_sub(amount).unwrap();
    let value = AllowanceValue {
        amount: remaining,
        expiration_ledger: current.expiration_ledger,
    };
    env.storage()
        .persistent()
        .set(&TokenKey::Allowance(from.clone(), spender.clone()), &value);
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

fn bump_persistent(env: &Env, key: &TokenKey) {
    env.storage().persistent().extend_ttl(
        key,
        PERSISTENT_LIFETIME_THRESHOLD,
        PERSISTENT_BUMP_AMOUNT,
    );
}
