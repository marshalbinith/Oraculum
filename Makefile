# StellarPredict — contract workspace tasks.
# The Rust workspace root is the repo root (Cargo.toml / Cargo.lock live here);
# individual contracts are under contracts/*.

STELLAR ?= stellar
NETWORK ?= testnet
SOURCE  ?= deployer
WASM_DIR = target/wasm32v1-none/release

.PHONY: build test deploy fmt clean wasm

## Compile all contracts to deployable Soroban wasm (wasm32v1-none).
build:
	$(STELLAR) contract build

## Alias for build.
wasm: build

## Run the full contract test suite (all workspace crates).
test:
	cargo test --workspace

## Format all Rust sources.
fmt:
	cargo fmt --all

## Deploy the factory contract to the network (SOURCE must be a funded identity).
## Example: make deploy SOURCE=deployer NETWORK=testnet
deploy: build
	$(STELLAR) contract deploy \
		--wasm $(WASM_DIR)/factory.wasm \
		--source $(SOURCE) \
		--network $(NETWORK)

## Remove build artifacts.
clean:
	cargo clean
