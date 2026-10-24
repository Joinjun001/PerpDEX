-- M2-T5-C. LOCAL ONLY. No signed transaction, RPC, gas or chain settlement status.
-- FK and uniqueness prevent two intents for a single committed outbox fill.
CREATE TABLE IF NOT EXISTS settlement_intents (
  fill_id BIGINT PRIMARY KEY,
  chain_id BIGINT NOT NULL,
  verifying_contract VARCHAR(42) NOT NULL,
  trade_id VARCHAR(66) NOT NULL UNIQUE CHECK (trade_id ~ '^0x[0-9a-f]{64}$'),
  instruction_hash VARCHAR(66) NOT NULL CHECK (instruction_hash ~ '^0x[0-9a-f]{64}$'),
  instruction_json JSONB NOT NULL CHECK (jsonb_typeof(instruction_json) = 'object'),
  status VARCHAR(24) NOT NULL DEFAULT 'PREPARED'
    CHECK (status IN ('PREPARED','SIMULATING','SIMULATED','UNKNOWN')),
  simulation_token VARCHAR(36),
  simulation_started_at TIMESTAMPTZ,
  result_hash VARCHAR(66) CHECK (result_hash IS NULL OR result_hash ~ '^0x[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (chain_id, verifying_contract, fill_id)
    REFERENCES settlement_outbox(chain_id, verifying_contract, fill_id) ON DELETE RESTRICT,
  CHECK (
    (status='SIMULATING' AND simulation_token IS NOT NULL AND simulation_started_at IS NOT NULL)
    OR (status <> 'SIMULATING' AND simulation_token IS NULL AND simulation_started_at IS NULL)
  ),
  CHECK (status <> 'SIMULATED' OR result_hash IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS settlement_intents_status_idx
  ON settlement_intents(chain_id, verifying_contract, status, fill_id);
