-- M3-T2: isolated collateral bookkeeping only. NO deposits, withdrawals or token mint.
-- A funding credit must NOT be invented by this service: opening balances for
-- PGlite tests are seeded directly by test fixtures and are not an audit of custody.
CREATE TABLE IF NOT EXISTS perp_margin_balances (
  chain_id BIGINT NOT NULL CHECK (chain_id > 0),
  verifying_contract VARCHAR(42) NOT NULL CHECK (verifying_contract ~ '^0x[0-9a-f]{40}$'),
  market VARCHAR(32) NOT NULL,
  collateral_token VARCHAR(42) NOT NULL CHECK (collateral_token ~ '^0x[0-9a-f]{40}$'),
  account VARCHAR(42) NOT NULL CHECK (account ~ '^0x[0-9a-f]{40}$'),
  bucket VARCHAR(16) NOT NULL CHECK (bucket IN ('AVAILABLE','RESERVED','POSITION')),
  balance VARCHAR(78) NOT NULL DEFAULT '0' CHECK (balance ~ '^(0|[1-9][0-9]*)$'),
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
  PRIMARY KEY (chain_id,verifying_contract,market,collateral_token,account,bucket)
);

CREATE TABLE IF NOT EXISTS perp_margin_operations (
  chain_id BIGINT NOT NULL CHECK (chain_id > 0),
  verifying_contract VARCHAR(42) NOT NULL,
  market VARCHAR(32) NOT NULL,
  collateral_token VARCHAR(42) NOT NULL,
  operation_id VARCHAR(64) NOT NULL CHECK (operation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  account VARCHAR(42) NOT NULL,
  action VARCHAR(16) NOT NULL CHECK (action IN ('RESERVE','RELEASE','ALLOCATE','UNALLOCATE')),
  from_bucket VARCHAR(16) NOT NULL CHECK (from_bucket IN ('AVAILABLE','RESERVED','POSITION')),
  to_bucket VARCHAR(16) NOT NULL CHECK (to_bucket IN ('AVAILABLE','RESERVED','POSITION')),
  amount VARCHAR(78) NOT NULL CHECK (amount ~ '^[1-9][0-9]*$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id,verifying_contract,market,collateral_token,operation_id),
  CHECK (from_bucket <> to_bucket)
);

CREATE TABLE IF NOT EXISTS perp_margin_entries (
  chain_id BIGINT NOT NULL,
  verifying_contract VARCHAR(42) NOT NULL,
  market VARCHAR(32) NOT NULL,
  collateral_token VARCHAR(42) NOT NULL,
  operation_id VARCHAR(64) NOT NULL,
  leg SMALLINT NOT NULL CHECK (leg IN (0,1)),
  account VARCHAR(42) NOT NULL,
  bucket VARCHAR(16) NOT NULL CHECK (bucket IN ('AVAILABLE','RESERVED','POSITION')),
  signed_delta VARCHAR(79) NOT NULL CHECK (
    (leg=0 AND signed_delta ~ '^-[1-9][0-9]*$') OR
    (leg=1 AND signed_delta ~ '^[1-9][0-9]*$')
  ),
  PRIMARY KEY (chain_id,verifying_contract,market,collateral_token,operation_id,leg),
  FOREIGN KEY (chain_id,verifying_contract,market,collateral_token,operation_id)
    REFERENCES perp_margin_operations (chain_id,verifying_contract,market,collateral_token,operation_id)
    ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS perp_margin_entries_account_idx ON perp_margin_entries
  (chain_id,verifying_contract,market,collateral_token,account,operation_id);
