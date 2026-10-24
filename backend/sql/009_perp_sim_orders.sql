-- M3-T3-A isolated SIMULATION_ONLY v2 signed order admissions.
-- No public HTTP route, no matching, fills, execution, live collateral or withdrawal.
CREATE TABLE IF NOT EXISTS perp_sim_orders (
  chain_id BIGINT NOT NULL CHECK (chain_id > 0),
  verifying_contract VARCHAR(42) NOT NULL CHECK (verifying_contract ~ '^0x[0-9a-f]{40}$'),
  account VARCHAR(42) NOT NULL CHECK (account ~ '^0x[0-9a-f]{40}$'),
  nonce VARCHAR(78) NOT NULL CHECK (nonce ~ '^(0|[1-9][0-9]*)$'),
  order_id VARCHAR(66) NOT NULL CHECK (order_id ~ '^0x[0-9a-f]{64}$'),
  market VARCHAR(32) NOT NULL,
  collateral_token VARCHAR(42) NOT NULL,
  side VARCHAR(4) NOT NULL CHECK (side IN ('BUY','SELL')),
  price VARCHAR(78) NOT NULL,
  quantity VARCHAR(78) NOT NULL,
  expires_at BIGINT NOT NULL,
  config_revision BIGINT NOT NULL CHECK (config_revision > 0),
  market_config_hash VARCHAR(66) NOT NULL CHECK (market_config_hash ~ '^0x[0-9a-f]{64}$'),
  policy_source VARCHAR(64) NOT NULL,
  oracle_sequence VARCHAR(78) NOT NULL,
  initial_margin VARCHAR(78) NOT NULL CHECK (initial_margin ~ '^[1-9][0-9]*$'),
  status VARCHAR(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CANCELED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id,verifying_contract,account,nonce),
  UNIQUE (chain_id,verifying_contract,order_id),
  FOREIGN KEY (chain_id,verifying_contract,account,nonce)
    REFERENCES order_nonces (chain_id,verifying_contract,account,nonce) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS perp_sim_orders_market_idx ON perp_sim_orders
  (chain_id,verifying_contract,market,status);
