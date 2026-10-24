-- M5-T3-C2-B2-A: immutable paired opening PREPARATION only.
-- NO committed fill, margin allocation, order consumption, or execution rights.
-- Requires SQL 001,008,009,011,015. Existing 015 fences are unchanged.
CREATE TABLE IF NOT EXISTS perp_signed_pair_preparations (
  chain_id BIGINT NOT NULL CHECK (chain_id > 0),
  verifying_contract VARCHAR(42) NOT NULL CHECK (verifying_contract ~ '^0x[0-9a-f]{40}$'),
  market VARCHAR(32) NOT NULL,
  collateral_token VARCHAR(42) NOT NULL CHECK (collateral_token ~ '^0x[0-9a-f]{40}$'),
  fill_id VARCHAR(66) NOT NULL CHECK (fill_id ~ '^0x[0-9a-f]{64}$'),
  buyer_order_id VARCHAR(66) NOT NULL CHECK (buyer_order_id ~ '^0x[0-9a-f]{64}$'),
  seller_order_id VARCHAR(66) NOT NULL CHECK (seller_order_id ~ '^0x[0-9a-f]{64}$'),
  buyer_account VARCHAR(42) NOT NULL CHECK (buyer_account ~ '^0x[0-9a-f]{40}$'),
  seller_account VARCHAR(42) NOT NULL CHECK (seller_account ~ '^0x[0-9a-f]{40}$'),
  quantity_atomic VARCHAR(78) NOT NULL CHECK (quantity_atomic ~ '^[1-9][0-9]*$'),
  price_atomic VARCHAR(78) NOT NULL CHECK (price_atomic ~ '^[1-9][0-9]*$'),
  config_revision BIGINT NOT NULL CHECK (config_revision > 0),
  config_hash VARCHAR(66) NOT NULL CHECK (config_hash ~ '^0x[0-9a-f]{64}$'),
  oracle_sequence VARCHAR(78) NOT NULL CHECK (oracle_sequence ~ '^[1-9][0-9]*$'),
  market_oi_version BIGINT NOT NULL CHECK (market_oi_version >= 0),
  buyer_position_version BIGINT NOT NULL CHECK (buyer_position_version = 0),
  seller_position_version BIGINT NOT NULL CHECK (seller_position_version = 0),
  buyer_reserved_margin VARCHAR(78) NOT NULL CHECK (buyer_reserved_margin ~ '^[1-9][0-9]*$'),
  seller_reserved_margin VARCHAR(78) NOT NULL CHECK (seller_reserved_margin ~ '^[1-9][0-9]*$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id,verifying_contract,fill_id),
  FOREIGN KEY (chain_id,verifying_contract,buyer_order_id)
    REFERENCES perp_sim_orders (chain_id,verifying_contract,order_id) ON DELETE RESTRICT,
  FOREIGN KEY (chain_id,verifying_contract,seller_order_id)
    REFERENCES perp_sim_orders (chain_id,verifying_contract,order_id) ON DELETE RESTRICT,
  CHECK (buyer_account <> seller_account),
  CHECK (buyer_order_id <> seller_order_id),
  FOREIGN KEY (chain_id,verifying_contract,market,collateral_token)
    REFERENCES perp_market_open_interest (chain_id,verifying_contract,market,collateral_token)
);

-- Even after the signed orders are canceled or market moves, PREPARED evidence
-- remains a historical candidate, never proof of CURRENT authority.
CREATE OR REPLACE FUNCTION reject_signed_pair_preparation_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'signed pair preparation history is append-only';
END;
$$;
DROP TRIGGER IF EXISTS perp_signed_pair_preparation_immutable ON perp_signed_pair_preparations;
CREATE TRIGGER perp_signed_pair_preparation_immutable
 BEFORE UPDATE OR DELETE ON perp_signed_pair_preparations
 FOR EACH ROW EXECUTE FUNCTION reject_signed_pair_preparation_mutation();

CREATE OR REPLACE FUNCTION check_signed_pair_preparation_commit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  b RECORD;
  s RECORD;
  m RECORD;
BEGIN
  SELECT * INTO b FROM perp_sim_orders WHERE chain_id=NEW.chain_id
    AND verifying_contract=NEW.verifying_contract AND order_id=NEW.buyer_order_id;
  SELECT * INTO s FROM perp_sim_orders WHERE chain_id=NEW.chain_id
    AND verifying_contract=NEW.verifying_contract AND order_id=NEW.seller_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'prepared signed seller order missing'; END IF;
  IF b.order_id IS NULL OR b.status<>'OPEN' OR s.status<>'OPEN'
    OR b.side<>'BUY' OR s.side<>'SELL'
    OR b.account<>NEW.buyer_account OR s.account<>NEW.seller_account
    OR b.market<>NEW.market OR s.market<>NEW.market
    OR b.collateral_token<>NEW.collateral_token OR s.collateral_token<>NEW.collateral_token
    OR b.config_revision<>NEW.config_revision OR s.config_revision<>NEW.config_revision
    OR b.market_config_hash<>NEW.config_hash OR s.market_config_hash<>NEW.config_hash
    OR b.oracle_sequence<>NEW.oracle_sequence OR s.oracle_sequence<>NEW.oracle_sequence
    OR b.quantity<>NEW.quantity_atomic OR s.quantity<>NEW.quantity_atomic
    OR b.initial_margin<>NEW.buyer_reserved_margin
    OR s.initial_margin<>NEW.seller_reserved_margin
    OR b.price::numeric < NEW.price_atomic::numeric
    OR s.price::numeric > NEW.price_atomic::numeric THEN
    RAISE EXCEPTION 'signed pair preparation differs from durable open orders or limits';
  END IF;
  SELECT * INTO m FROM perp_market_open_interest WHERE chain_id=NEW.chain_id
    AND verifying_contract=NEW.verifying_contract
    AND market=NEW.market AND collateral_token=NEW.collateral_token;
  IF NOT FOUND OR m.mode<>'PAIRED' OR m.version<>NEW.market_oi_version
    OR m.config_revision<>NEW.config_revision THEN
    RAISE EXCEPTION 'prepared signed pair market state changed before commit';
  END IF;
  IF EXISTS(SELECT 1 FROM perp_sim_paired_fills
     WHERE chain_id=NEW.chain_id AND verifying_contract=NEW.verifying_contract
       AND fill_id=NEW.fill_id) THEN
    RAISE EXCEPTION 'already committed paired fill cannot be prepared';
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS perp_signed_pair_preparation_commit ON perp_signed_pair_preparations;
CREATE CONSTRAINT TRIGGER perp_signed_pair_preparation_commit
 AFTER INSERT ON perp_signed_pair_preparations
 DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION check_signed_pair_preparation_commit();
