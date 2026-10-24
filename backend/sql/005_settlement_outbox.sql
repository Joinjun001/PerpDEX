-- M2-T5-A: durable, policy-gated settlement preparation outbox.
-- This table NEVER authorizes transfers, broadcasts, or confirms a chain receipt.
-- Tokens only fence local preparation workers; no private keys or RPC data are stored.
CREATE TABLE IF NOT EXISTS settlement_outbox (
  fill_id BIGINT PRIMARY KEY REFERENCES order_fills(fill_id) ON DELETE RESTRICT,
  chain_id BIGINT NOT NULL CHECK (chain_id > 0),
  verifying_contract VARCHAR(42) NOT NULL,
  market VARCHAR(32) NOT NULL,
  trade_id VARCHAR(66) NOT NULL UNIQUE CHECK (trade_id ~ '^0x[0-9a-f]{64}$'),
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING_POLICY'
    CHECK (status IN ('PENDING_POLICY', 'PREPARING', 'RETRYABLE', 'WAITING_POLICY')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  lease_token VARCHAR(36),
  lease_expires_at TIMESTAMPTZ,
  retry_after TIMESTAMPTZ,
  last_error VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (status = 'PREPARING' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL) OR
    (status <> 'PREPARING' AND lease_token IS NULL AND lease_expires_at IS NULL)
  ),
  CHECK (status <> 'RETRYABLE' OR retry_after IS NOT NULL),
  CHECK (status = 'RETRYABLE' OR retry_after IS NULL),
  UNIQUE (chain_id, verifying_contract, fill_id)
);
CREATE INDEX IF NOT EXISTS settlement_outbox_claim_idx
  ON settlement_outbox (chain_id, verifying_contract, status, retry_after, fill_id);
