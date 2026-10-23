-- M2-T2: signed orders must share a transaction with the nonce claim.
-- The order identifier is computed from canonical order fields and deliberately
-- NOT globally unique: the same payload can be signed in another EIP-712 domain.
CREATE TABLE IF NOT EXISTS orders (
    chain_id BIGINT NOT NULL CHECK (chain_id > 0),
    verifying_contract VARCHAR(42) NOT NULL
        CHECK (verifying_contract ~ '^0x[0-9a-f]{40}$'),
    account VARCHAR(42) NOT NULL
        CHECK (account ~ '^0x[0-9a-f]{40}$'),
    nonce VARCHAR(78) NOT NULL
        CHECK (nonce ~ '^(0|[1-9][0-9]*)$'),
    order_id VARCHAR(66) NOT NULL
        CHECK (order_id ~ '^0x[0-9a-f]{64}$'),
    market VARCHAR(32) NOT NULL,
    side VARCHAR(4) NOT NULL CHECK (side IN ('BUY','SELL')),
    price VARCHAR(78) NOT NULL
        CHECK (price ~ '^[1-9][0-9]*$'),
    quantity VARCHAR(78) NOT NULL
        CHECK (quantity ~ '^[1-9][0-9]*$'),
    filled_quantity VARCHAR(78) NOT NULL DEFAULT '0'
        CHECK (filled_quantity ~ '^(0|[1-9][0-9]*)$'),
    expires_at BIGINT NOT NULL,
    signature VARCHAR(132) NOT NULL
        CHECK (signature ~ '^0x([0-9a-f]{128}|[0-9a-f]{130})$'),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN','PARTIALLY_FILLED','FILLED','CANCELED','EXPIRED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (chain_id, verifying_contract, account, nonce),
    CONSTRAINT orders_nonce_fk FOREIGN KEY (chain_id, verifying_contract, account, nonce)
        REFERENCES order_nonces (chain_id, verifying_contract, account, nonce)
        ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS orders_market_status_created_idx
    ON orders (market, status, created_at);
