-- M4-T2: SIMULATION_ONLY position snapshots and append-only applications.
-- No FK to M2 fills: these are independent untrusted simulation events, NOT settled trades.
CREATE TABLE IF NOT EXISTS perp_position_snapshots (
  chain_id BIGINT NOT NULL CHECK (chain_id > 0),
  verifying_contract VARCHAR(42) NOT NULL CHECK (verifying_contract ~ '^0x[0-9a-f]{40}$'),
  market VARCHAR(32) NOT NULL,
  collateral_token VARCHAR(42) NOT NULL CHECK (collateral_token ~ '^0x[0-9a-f]{40}$'),
  account VARCHAR(42) NOT NULL CHECK (account ~ '^0x[0-9a-f]{40}$'),
  config_revision BIGINT NOT NULL CHECK (config_revision > 0),
  size_signed_atomic VARCHAR(79) NOT NULL CHECK (size_signed_atomic ~ '^(0|[1-9][0-9]*|-[1-9][0-9]*)$'),
  open_cost_numerator VARCHAR(78) NOT NULL CHECK (open_cost_numerator ~ '^(0|[1-9][0-9]*)$'),
  realized_pnl_numerator VARCHAR(79) NOT NULL CHECK (realized_pnl_numerator ~ '^(0|[1-9][0-9]*|-[1-9][0-9]*)$'),
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
  last_fill_id VARCHAR(66),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id,verifying_contract,market,collateral_token,account),
  CHECK ((version = 0 AND last_fill_id IS NULL) OR (version > 0 AND last_fill_id ~ '^0x[0-9a-f]{64}$')),
  CHECK ((size_signed_atomic = '0' AND open_cost_numerator = '0') OR
         (size_signed_atomic <> '0' AND open_cost_numerator <> '0'))
);

CREATE TABLE IF NOT EXISTS perp_position_applications (
  chain_id BIGINT NOT NULL,
  verifying_contract VARCHAR(42) NOT NULL,
  market VARCHAR(32) NOT NULL,
  collateral_token VARCHAR(42) NOT NULL,
  account VARCHAR(42) NOT NULL,
  fill_id VARCHAR(66) NOT NULL CHECK (fill_id ~ '^0x[0-9a-f]{64}$'),
  applied_version BIGINT NOT NULL CHECK (applied_version > 0),
  side VARCHAR(4) NOT NULL CHECK (side IN ('BUY','SELL')),
  price_atomic VARCHAR(78) NOT NULL CHECK (price_atomic ~ '^[1-9][0-9]*$'),
  quantity_atomic VARCHAR(78) NOT NULL CHECK (quantity_atomic ~ '^[1-9][0-9]*$'),
  config_revision BIGINT NOT NULL CHECK (config_revision > 0),
  config_hash VARCHAR(66) NOT NULL CHECK (config_hash ~ '^0x[0-9a-f]{64}$'),
  oracle_sequence VARCHAR(78) NOT NULL CHECK (oracle_sequence ~ '^[1-9][0-9]*$'),
  closed_quantity_atomic VARCHAR(78) NOT NULL,
  opened_quantity_atomic VARCHAR(78) NOT NULL,
  realized_delta_atomic VARCHAR(79) NOT NULL,
  size_signed_atomic VARCHAR(79) NOT NULL,
  open_cost_numerator VARCHAR(78) NOT NULL,
  realized_pnl_numerator VARCHAR(79) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Same fill may legitimately appear in both counterparty accounts, never twice
  -- in one account even when another market/token is used in the same domain.
  PRIMARY KEY (chain_id,verifying_contract,account,fill_id),
  UNIQUE (chain_id,verifying_contract,market,collateral_token,account,applied_version),
  FOREIGN KEY (chain_id,verifying_contract,market,collateral_token,account)
    REFERENCES perp_position_snapshots (chain_id,verifying_contract,market,collateral_token,account)
    ON DELETE RESTRICT
);

-- Reject any accidental mutation of historical position applications, including
-- independent writers that bypass the typed application service.
CREATE OR REPLACE FUNCTION reject_perp_position_application_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'perp_position_applications is append-only';
END;
$$;
DROP TRIGGER IF EXISTS perp_position_applications_immutable ON perp_position_applications;
CREATE TRIGGER perp_position_applications_immutable
BEFORE UPDATE OR DELETE ON perp_position_applications
FOR EACH ROW EXECUTE FUNCTION reject_perp_position_application_mutation();
