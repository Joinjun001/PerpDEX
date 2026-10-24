-- M2-T5-D: local MOCK observation journal. These rows are NOT chain confirmations.
-- No transaction sender, RPC credential or live chain access is connected.
CREATE UNIQUE INDEX IF NOT EXISTS settlement_intents_scope_unique_idx
  ON settlement_intents(chain_id,verifying_contract,fill_id);

CREATE TABLE IF NOT EXISTS settlement_reconciliations (
  fill_id BIGINT PRIMARY KEY,
  chain_id BIGINT NOT NULL,
  verifying_contract VARCHAR(42) NOT NULL,
  trade_id VARCHAR(66) NOT NULL UNIQUE CHECK (trade_id ~ '^0x[0-9a-f]{64}$'),
  source VARCHAR(16) NOT NULL DEFAULT 'MOCK_READONLY' CHECK (source='MOCK_READONLY'),
  status VARCHAR(24) NOT NULL
    CHECK (status IN ('UNCONFIRMED','RECHECK_REQUIRED','MOCK_VERIFIED','MOCK_FAILED','UNKNOWN')),
  tx_hash VARCHAR(66) CHECK (tx_hash IS NULL OR tx_hash ~ '^0x[0-9a-f]{64}$'),
  block_hash VARCHAR(66) CHECK (block_hash IS NULL OR block_hash ~ '^0x[0-9a-f]{64}$'),
  block_number BIGINT CHECK (block_number IS NULL OR block_number > 0),
  evidence_hash VARCHAR(66) CHECK (evidence_hash IS NULL OR evidence_hash ~ '^0x[0-9a-f]{64}$'),
  observation_count INTEGER NOT NULL DEFAULT 1 CHECK (observation_count > 0),
  last_error VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (chain_id, verifying_contract, fill_id)
    REFERENCES settlement_intents(chain_id, verifying_contract, fill_id) ON DELETE RESTRICT,
  CHECK (status NOT IN ('MOCK_VERIFIED','MOCK_FAILED') OR
         (tx_hash IS NOT NULL AND block_hash IS NOT NULL AND block_number IS NOT NULL AND evidence_hash IS NOT NULL)),
  CHECK (status <> 'UNCONFIRMED' OR tx_hash IS NULL)
);
CREATE INDEX IF NOT EXISTS settlement_reconciliation_state_idx
  ON settlement_reconciliations(chain_id,verifying_contract,status,fill_id);
