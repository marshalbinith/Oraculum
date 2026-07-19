-- Per-market discussion / comments feed.
CREATE TABLE IF NOT EXISTS comments (
    comment_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id      UUID NOT NULL REFERENCES markets(market_id) ON DELETE CASCADE,
    author_address TEXT NOT NULL,
    body           TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_market ON comments(market_id, created_at DESC);
