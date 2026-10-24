-- M5-T3-C2-B1: fail-closed signed shadow order fences (SIMULATION_ONLY).
-- IMPORTANT: does not implement/authorize fills, allocation, or any live funds.
-- A trusted table owner or role able to disable triggers can bypass these constraints.
-- Requires 001, 008, 009, 010, 011, 012, 013, 014.

-- Signature-committed order fields are immutable even to an internal SQL writer.
-- Until the atomic C2-B2 settlement receipt exists, only OPEN -> CANCELED is legal.
CREATE OR REPLACE FUNCTION perp_signed_order_reject_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'signed shadow order cannot be deleted';
  END IF;
  IF (NEW.chain_id,NEW.verifying_contract,NEW.account,NEW.nonce,NEW.order_id,
      NEW.market,NEW.collateral_token,NEW.side,NEW.price,NEW.quantity,
      NEW.expires_at,NEW.config_revision,NEW.market_config_hash,
      NEW.policy_source,NEW.oracle_sequence,NEW.initial_margin,NEW.created_at)
    IS DISTINCT FROM
     (OLD.chain_id,OLD.verifying_contract,OLD.account,OLD.nonce,OLD.order_id,
      OLD.market,OLD.collateral_token,OLD.side,OLD.price,OLD.quantity,
      OLD.expires_at,OLD.config_revision,OLD.market_config_hash,
      OLD.policy_source,OLD.oracle_sequence,OLD.initial_margin,OLD.created_at) THEN
    RAISE EXCEPTION 'signed shadow order identity is immutable';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND
     NOT (OLD.status='OPEN' AND NEW.status='CANCELED') THEN
    RAISE EXCEPTION 'signed shadow order status transition is not authorized';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS perp_signed_order_immutable_identity ON perp_sim_orders;
CREATE TRIGGER perp_signed_order_immutable_identity
  BEFORE UPDATE OR DELETE ON perp_sim_orders
  FOR EACH ROW EXECUTE FUNCTION perp_signed_order_reject_mutation();

CREATE OR REPLACE FUNCTION perp_signed_order_commit_check()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  od RECORD;
  tombstone RECORD;
  reserved RECORD;
  postings INTEGER;
BEGIN
  -- BEFORE trigger forbids deletion, so final row must exist.
  SELECT * INTO od FROM perp_sim_orders
   WHERE chain_id=NEW.chain_id AND verifying_contract=NEW.verifying_contract
     AND account=NEW.account AND nonce=NEW.nonce;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'signed shadow order missing at commit';
  END IF;
  SELECT status,order_id,expires_at INTO tombstone FROM order_nonces
   WHERE chain_id=od.chain_id AND verifying_contract=od.verifying_contract
     AND account=od.account AND nonce=od.nonce;
  IF NOT FOUND OR tombstone.order_id IS DISTINCT FROM od.order_id
      OR tombstone.expires_at IS DISTINCT FROM od.expires_at
      OR (od.status='OPEN' AND tombstone.status<>'USED')
      OR (od.status='CANCELED' AND tombstone.status<>'CANCELED') THEN
    RAISE EXCEPTION 'signed shadow order status differs from nonce tombstone';
  END IF;
  SELECT action,amount,account,from_bucket,to_bucket INTO reserved
    FROM perp_margin_operations
    WHERE chain_id=od.chain_id AND verifying_contract=od.verifying_contract
      AND market=od.market AND collateral_token=od.collateral_token
      AND operation_id=substring(od.order_id from 3);
  IF NOT FOUND OR reserved.action<>'RESERVE' OR reserved.amount<>od.initial_margin
    OR reserved.account<>od.account OR reserved.from_bucket<>'AVAILABLE'
    OR reserved.to_bucket<>'RESERVED' THEN
    RAISE EXCEPTION 'signed order must retain original reserve operation';
  END IF;
  SELECT COUNT(*) INTO postings FROM perp_margin_entries
   WHERE chain_id=od.chain_id AND verifying_contract=od.verifying_contract
     AND market=od.market AND collateral_token=od.collateral_token
     AND operation_id=substring(od.order_id from 3)
     AND account=od.account
     AND ((leg=0 AND bucket='AVAILABLE' AND signed_delta=('-'||od.initial_margin))
       OR (leg=1 AND bucket='RESERVED' AND signed_delta=od.initial_margin));
  IF postings<>2 THEN
    RAISE EXCEPTION 'signed order must retain both reserve posting legs';
  END IF;
  PERFORM perp_signed_reserve_coverage(od.chain_id,od.verifying_contract,
    od.market,od.collateral_token,od.account);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS perp_signed_order_commit ON perp_sim_orders;
CREATE CONSTRAINT TRIGGER perp_signed_order_commit
  AFTER INSERT OR UPDATE ON perp_sim_orders
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION perp_signed_order_commit_check();

-- The nonce can be changed independently; its final state must also agree
-- with signed shadow rows even if the order itself was not updated.
CREATE OR REPLACE FUNCTION perp_signed_nonce_commit_check()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  od RECORD;
BEGIN
  SELECT status,order_id,expires_at INTO od FROM perp_sim_orders
   WHERE chain_id=NEW.chain_id AND verifying_contract=NEW.verifying_contract
     AND account=NEW.account AND nonce=NEW.nonce;
  IF FOUND AND (NEW.order_id IS DISTINCT FROM od.order_id
     OR NEW.expires_at IS DISTINCT FROM od.expires_at
     OR (od.status='OPEN' AND NEW.status<>'USED')
     OR (od.status='CANCELED' AND NEW.status<>'CANCELED')) THEN
    RAISE EXCEPTION 'signed nonce mutation contradicts shadow order';
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS perp_signed_nonce_commit ON order_nonces;
CREATE CONSTRAINT TRIGGER perp_signed_nonce_commit
  AFTER INSERT OR UPDATE ON order_nonces
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION perp_signed_nonce_commit_check();

-- An old M4 single-account or paired writer cannot move a position while
-- an OPEN signed v2 reserve still exists. An eventual full-pair writer must
-- first settle the order and reserve atomically, then install its own receipt
-- constraints before any opening execution is enabled.
CREATE OR REPLACE FUNCTION perp_signed_position_commit_fence()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  a VARCHAR(42);
  c BIGINT;
  v VARCHAR(42);
  m VARCHAR(32);
  t VARCHAR(42);
BEGIN
  IF TG_OP='DELETE' THEN
    a:=OLD.account;c:=OLD.chain_id;v:=OLD.verifying_contract;
    m:=OLD.market;t:=OLD.collateral_token;
  ELSE
    a:=NEW.account;c:=NEW.chain_id;v:=NEW.verifying_contract;
    m:=NEW.market;t:=NEW.collateral_token;
  END IF;
  IF (TG_OP='DELETE' OR
     (TG_OP='INSERT' AND (NEW.version<>0 OR NEW.size_signed_atomic<>'0')) OR
     (TG_OP='UPDATE' AND
       (NEW.version IS DISTINCT FROM OLD.version OR
        NEW.size_signed_atomic IS DISTINCT FROM OLD.size_signed_atomic OR
        NEW.open_cost_numerator IS DISTINCT FROM OLD.open_cost_numerator OR
        NEW.realized_pnl_numerator IS DISTINCT FROM OLD.realized_pnl_numerator OR
        NEW.last_fill_id IS DISTINCT FROM OLD.last_fill_id)))
     AND EXISTS (SELECT 1 FROM perp_sim_orders od
       WHERE od.chain_id=c AND od.verifying_contract=v
       AND od.market=m AND od.collateral_token=t AND od.account=a
       AND od.status='OPEN') THEN
    RAISE EXCEPTION 'signed OPEN order blocks unbound position execution';
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS perp_signed_position_commit ON perp_position_snapshots;
CREATE CONSTRAINT TRIGGER perp_signed_position_commit
  AFTER INSERT OR UPDATE OR DELETE ON perp_position_snapshots
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION perp_signed_position_commit_fence();

-- No unbound paired receipt or margin ALLOCATE is legal for an account
-- with OPEN signed orders under the current simulation-only design.
CREATE OR REPLACE FUNCTION perp_signed_paired_commit_fence()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM perp_sim_orders od
    WHERE od.chain_id=NEW.chain_id AND od.verifying_contract=NEW.verifying_contract
      AND od.market=NEW.market AND od.collateral_token=NEW.collateral_token
      AND od.status='OPEN'
      AND od.account IN (NEW.buyer_account,NEW.seller_account)) THEN
    RAISE EXCEPTION 'signed OPEN order blocks unbound paired fill';
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS perp_signed_paired_commit ON perp_sim_paired_fills;
CREATE CONSTRAINT TRIGGER perp_signed_paired_commit
  AFTER INSERT ON perp_sim_paired_fills
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION perp_signed_paired_commit_fence();

CREATE OR REPLACE FUNCTION perp_signed_allocation_commit_fence()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.action='ALLOCATE' AND EXISTS (SELECT 1 FROM perp_sim_orders od
    WHERE od.chain_id=NEW.chain_id AND od.verifying_contract=NEW.verifying_contract
      AND od.market=NEW.market AND od.collateral_token=NEW.collateral_token
      AND od.account=NEW.account AND od.status='OPEN') THEN
    RAISE EXCEPTION 'signed OPEN order blocks unbound margin allocation';
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS perp_signed_allocation_commit ON perp_margin_operations;
CREATE CONSTRAINT TRIGGER perp_signed_allocation_commit
  AFTER INSERT ON perp_margin_operations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION perp_signed_allocation_commit_fence();

-- All margin history is append-only once this migration is installed;
-- no privileged direct edit may masquerade as a legitimate prior reserve.
CREATE OR REPLACE FUNCTION perp_signed_margin_history_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'perpetual margin operation and entries are append-only';
END;
$$;
DROP TRIGGER IF EXISTS perp_margin_operations_immutable ON perp_margin_operations;
CREATE TRIGGER perp_margin_operations_immutable
  BEFORE UPDATE OR DELETE ON perp_margin_operations
  FOR EACH ROW EXECUTE FUNCTION perp_signed_margin_history_immutable();
DROP TRIGGER IF EXISTS perp_margin_entries_immutable ON perp_margin_entries;
CREATE TRIGGER perp_margin_entries_immutable
  BEFORE UPDATE OR DELETE ON perp_margin_entries
  FOR EACH ROW EXECUTE FUNCTION perp_signed_margin_history_immutable();

-- Aggregate obligation fence also runs when a bucket changes without touching
-- the signed order row. Signed orders may coexist with OTHER M3 reservations;
-- hence a conservative lower bound rather than false equality.
CREATE OR REPLACE FUNCTION perp_signed_reserve_coverage(
  p_chain BIGINT,p_verifier VARCHAR,p_market VARCHAR,p_token VARCHAR,p_account VARCHAR)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  obligation NUMERIC;
  available_reserved NUMERIC;
BEGIN
  SELECT COALESCE(SUM(initial_margin::NUMERIC),0) INTO obligation
    FROM perp_sim_orders WHERE chain_id=p_chain AND verifying_contract=p_verifier
    AND market=p_market AND collateral_token=p_token AND account=p_account
    AND status='OPEN';
  IF obligation=0 THEN RETURN; END IF;
  SELECT balance::NUMERIC INTO available_reserved FROM perp_margin_balances
    WHERE chain_id=p_chain AND verifying_contract=p_verifier
      AND market=p_market AND collateral_token=p_token AND account=p_account
      AND bucket='RESERVED';
  IF available_reserved IS NULL OR obligation>available_reserved THEN
    RAISE EXCEPTION 'signed OPEN margin reservation exceeds reserved bucket';
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION perp_signed_margin_balance_commit_check()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  b RECORD;
BEGIN
  IF TG_OP='DELETE' THEN b:=OLD; ELSE b:=NEW; END IF;
  IF b.bucket='RESERVED' THEN
    PERFORM perp_signed_reserve_coverage(b.chain_id,b.verifying_contract,
      b.market,b.collateral_token,b.account);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS perp_signed_margin_balance_commit ON perp_margin_balances;
CREATE CONSTRAINT TRIGGER perp_signed_margin_balance_commit
  AFTER INSERT OR UPDATE OR DELETE ON perp_margin_balances
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION perp_signed_margin_balance_commit_check();
