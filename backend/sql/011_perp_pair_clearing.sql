-- M4-T3. ONLY local simulation, no financial assets or production execution.
CREATE TABLE IF NOT EXISTS perp_market_open_interest (
  chain_id BIGINT NOT NULL CHECK (chain_id > 0),
  verifying_contract VARCHAR(42) NOT NULL CHECK (verifying_contract ~ '^0x[0-9a-f]{40}$'),
  market VARCHAR(32) NOT NULL,
  collateral_token VARCHAR(42) NOT NULL CHECK (collateral_token ~ '^0x[0-9a-f]{40}$'),
  config_revision BIGINT NOT NULL CHECK (config_revision > 0),
  mode VARCHAR(8) NOT NULL DEFAULT 'PAIRED' CHECK (mode IN ('PAIRED','UNPAIRED')),
  open_interest_atomic VARCHAR(78) NOT NULL CHECK (open_interest_atomic ~ '^(0|[1-9][0-9]*)$'),
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
  PRIMARY KEY (chain_id,verifying_contract,market,collateral_token)
);

CREATE TABLE IF NOT EXISTS perp_sim_paired_fills (
  chain_id BIGINT NOT NULL,
  verifying_contract VARCHAR(42) NOT NULL,
  market VARCHAR(32) NOT NULL,
  collateral_token VARCHAR(42) NOT NULL,
  fill_id VARCHAR(66) NOT NULL CHECK (fill_id ~ '^0x[0-9a-f]{64}$'),
  buyer_account VARCHAR(42) NOT NULL,
  seller_account VARCHAR(42) NOT NULL,
  quantity_atomic VARCHAR(78) NOT NULL CHECK (quantity_atomic ~ '^[1-9][0-9]*$'),
  price_atomic VARCHAR(78) NOT NULL CHECK (price_atomic ~ '^[1-9][0-9]*$'),
  config_revision BIGINT NOT NULL CHECK (config_revision > 0),
  config_hash VARCHAR(66) NOT NULL CHECK (config_hash ~ '^0x[0-9a-f]{64}$'),
  oracle_sequence VARCHAR(78) NOT NULL CHECK (oracle_sequence ~ '^[1-9][0-9]*$'),
  open_interest_after VARCHAR(78) NOT NULL CHECK (open_interest_after ~ '^(0|[1-9][0-9]*)$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id,verifying_contract,fill_id),
  CHECK (buyer_account <> seller_account),
  FOREIGN KEY (chain_id,verifying_contract,market,collateral_token)
    REFERENCES perp_market_open_interest(chain_id,verifying_contract,market,collateral_token) ON DELETE RESTRICT,
  FOREIGN KEY (chain_id,verifying_contract,buyer_account,fill_id)
    REFERENCES perp_position_applications(chain_id,verifying_contract,account,fill_id) ON DELETE RESTRICT,
  FOREIGN KEY (chain_id,verifying_contract,seller_account,fill_id)
    REFERENCES perp_position_applications(chain_id,verifying_contract,account,fill_id) ON DELETE RESTRICT
);

DROP TRIGGER IF EXISTS perp_sim_paired_fills_immutable ON perp_sim_paired_fills;
CREATE TRIGGER perp_sim_paired_fills_immutable
BEFORE UPDATE OR DELETE ON perp_sim_paired_fills
FOR EACH ROW EXECUTE FUNCTION reject_perp_position_application_mutation();
