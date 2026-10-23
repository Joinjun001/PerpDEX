-- M2-T2: Keep a permanent tombstone for every accepted or canceled nonce.
-- Scope is the server-controlled EIP-712 domain + signer + uint256 nonce.
-- Do not delete tombstones on cancellation/expiry: that would permit replay.
CREATE TABLE IF NOT EXISTS order_nonces (
    chain_id BIGINT NOT NULL CHECK (chain_id > 0),
    verifying_contract VARCHAR(42) NOT NULL
        CHECK (verifying_contract ~ '^0x[0-9a-f]{40}$'),
    account VARCHAR(42) NOT NULL
        CHECK (account ~ '^0x[0-9a-f]{40}$'),
    nonce VARCHAR(78) NOT NULL
        CHECK (nonce ~ '^(0|[1-9][0-9]*)$'),
    order_id VARCHAR(66)
        CHECK (order_id IS NULL OR order_id ~ '^0x[0-9a-f]{64}$'),
    expires_at BIGINT,
    status VARCHAR(8) NOT NULL
        CHECK (status IN ('USED', 'CANCELED', 'EXPIRED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT order_nonces_scope_unique
        PRIMARY KEY (chain_id, verifying_contract, account, nonce),
    CONSTRAINT order_nonces_order_payload
        CHECK ((status = 'USED' AND order_id IS NOT NULL AND expires_at IS NOT NULL)
               OR (status <> 'USED'))
);
CREATE INDEX IF NOT EXISTS order_nonces_order_id_idx ON order_nonces (order_id);
