-- StellarPredict indexer schema (PostgreSQL 15)

CREATE TABLE IF NOT EXISTS markets (
    market_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_index         BIGINT UNIQUE,
    contract_address     VARCHAR(64) UNIQUE NOT NULL,
    creator_address      VARCHAR(64) NOT NULL,
    question             TEXT NOT NULL,
    description          TEXT,
    expiry_timestamp     BIGINT NOT NULL,
    oracle_feed_id       VARCHAR(64) NOT NULL,
    comparison           VARCHAR(4) NOT NULL,
    threshold            NUMERIC(38,0) NOT NULL,
    resolution_timestamp BIGINT NOT NULL,
    status               VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    winning_outcome      VARCHAR(10),
    yes_token_address    VARCHAR(64),
    no_token_address     VARCHAR(64),
    lp_token_address     VARCHAR(64),
    created_at           BIGINT NOT NULL,
    resolved_at          BIGINT,
    ledger_sequence      BIGINT NOT NULL,
    CONSTRAINT status_check CHECK (status IN
        ('PENDING','OPEN','LOCKED','RESOLVED_YES','RESOLVED_NO','INVALID'))
);
CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);
CREATE INDEX IF NOT EXISTS idx_markets_creator ON markets(creator_address);
CREATE INDEX IF NOT EXISTS idx_markets_feed ON markets(oracle_feed_id);

-- Latest AMM snapshot per market (upserted on every state-changing event).
CREATE TABLE IF NOT EXISTS market_amm_state (
    market_id        UUID PRIMARY KEY REFERENCES markets(market_id) ON DELETE CASCADE,
    yes_reserve      NUMERIC(38,0) NOT NULL,
    no_reserve       NUMERIC(38,0) NOT NULL,
    usdc_reserve     NUMERIC(38,0) NOT NULL,
    total_lp_supply  NUMERIC(38,0) NOT NULL,
    fee_pool         NUMERIC(38,0) NOT NULL,
    yes_price        BIGINT NOT NULL,
    no_price         BIGINT NOT NULL,
    total_volume     NUMERIC(38,0) NOT NULL DEFAULT 0,
    total_trades     BIGINT NOT NULL DEFAULT 0,
    updated_at       BIGINT NOT NULL,
    ledger_sequence  BIGINT NOT NULL
);

-- Time-series of YES price points for charting.
CREATE TABLE IF NOT EXISTS price_points (
    id               BIGSERIAL PRIMARY KEY,
    market_id        UUID NOT NULL REFERENCES markets(market_id) ON DELETE CASCADE,
    yes_price        BIGINT NOT NULL,
    volume           NUMERIC(38,0) NOT NULL DEFAULT 0,
    timestamp        BIGINT NOT NULL,
    UNIQUE (market_id, timestamp)
);
CREATE INDEX IF NOT EXISTS idx_price_points_market_time ON price_points(market_id, timestamp);

CREATE TABLE IF NOT EXISTS trades (
    trade_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id        UUID NOT NULL REFERENCES markets(market_id) ON DELETE CASCADE,
    trader_address   VARCHAR(64) NOT NULL,
    direction        VARCHAR(10) NOT NULL,
    usdc_amount      NUMERIC(38,0) NOT NULL,
    token_amount     NUMERIC(38,0) NOT NULL,
    fee_paid         NUMERIC(38,0) NOT NULL,
    yes_price_after  BIGINT NOT NULL,
    transaction_hash VARCHAR(128) NOT NULL,
    ledger_sequence  BIGINT NOT NULL,
    timestamp        BIGINT NOT NULL,
    UNIQUE (transaction_hash)
);
CREATE INDEX IF NOT EXISTS idx_trades_market ON trades(market_id);
CREATE INDEX IF NOT EXISTS idx_trades_trader ON trades(trader_address);
CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp);

CREATE TABLE IF NOT EXISTS liquidity_events (
    id               BIGSERIAL PRIMARY KEY,
    market_id        UUID NOT NULL REFERENCES markets(market_id) ON DELETE CASCADE,
    provider_address VARCHAR(64) NOT NULL,
    event_type       VARCHAR(10) NOT NULL, -- ADD, REMOVE
    usdc_amount      NUMERIC(38,0) NOT NULL,
    lp_tokens        NUMERIC(38,0) NOT NULL,
    fees_amount      NUMERIC(38,0) NOT NULL DEFAULT 0,
    transaction_hash VARCHAR(128) NOT NULL,
    timestamp        BIGINT NOT NULL,
    UNIQUE (transaction_hash, event_type)
);
CREATE INDEX IF NOT EXISTS idx_liq_market ON liquidity_events(market_id);
CREATE INDEX IF NOT EXISTS idx_liq_provider ON liquidity_events(provider_address);

CREATE TABLE IF NOT EXISTS reward_claims (
    claim_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id        UUID NOT NULL REFERENCES markets(market_id) ON DELETE CASCADE,
    claimer_address  VARCHAR(64) NOT NULL,
    tokens_burned    NUMERIC(38,0) NOT NULL,
    usdc_received    NUMERIC(38,0) NOT NULL,
    transaction_hash VARCHAR(128) NOT NULL,
    timestamp        BIGINT NOT NULL,
    UNIQUE (market_id, claimer_address)
);

CREATE TABLE IF NOT EXISTS oracle_prices (
    id               BIGSERIAL PRIMARY KEY,
    feed_id          VARCHAR(64) NOT NULL,
    price            NUMERIC(38,0) NOT NULL,
    confidence       NUMERIC(38,0),
    operator_address VARCHAR(64),
    transaction_hash VARCHAR(128),
    timestamp        BIGINT NOT NULL,
    ledger_sequence  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oracle_feed_time ON oracle_prices(feed_id, timestamp);

-- Single-row indexer checkpoint.
CREATE TABLE IF NOT EXISTS indexer_state (
    id                   INT PRIMARY KEY DEFAULT 1,
    last_ledger_sequence BIGINT NOT NULL DEFAULT 0,
    last_processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT singleton CHECK (id = 1)
);
INSERT INTO indexer_state (id, last_ledger_sequence)
VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
