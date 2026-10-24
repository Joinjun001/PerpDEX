-- M5-T3-C3-C2-A: signed account aggregate M3 conservation (SIMULATION_ONLY).
-- 001,008~019 required. Does not enable partial fills, funding or live custody.
-- AVAILABLE has fixture-seeded opening credit, so only RESERVED and POSITION
-- can be checked against their complete append-only posting history.
CREATE OR REPLACE FUNCTION assert_signed_account_margin_conservation(
  p_chain BIGINT,p_verifier VARCHAR,p_market VARCHAR,p_token VARCHAR,p_account VARCHAR)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  open_im NUMERIC; filled_im NUMERIC; held_reserved NUMERIC; held_position NUMERIC;
  booked_reserved NUMERIC; booked_position NUMERIC;
  other_reserved NUMERIC; other_position NUMERIC;
  bad_operations INT; foreign_entries INT; max_u NUMERIC :=
    115792089237316195423570985008687907853269984665640564039457584007913129639935;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM perp_sim_orders WHERE chain_id=p_chain AND verifying_contract=p_verifier
     AND market=p_market AND collateral_token=p_token AND account=p_account
  ) THEN RETURN; END IF;

  SELECT COALESCE(SUM(initial_margin::NUMERIC) FILTER (WHERE status='OPEN'),0),
         COALESCE(SUM(initial_margin::NUMERIC) FILTER (WHERE status='FILLED'),0)
    INTO open_im,filled_im FROM perp_sim_orders
   WHERE chain_id=p_chain AND verifying_contract=p_verifier AND market=p_market
     AND collateral_token=p_token AND account=p_account;
  IF open_im>max_u OR filled_im>max_u THEN
    RAISE EXCEPTION 'signed account aggregate liability exceeds uint256';
  END IF;
  SELECT balance::NUMERIC INTO held_reserved FROM perp_margin_balances
    WHERE chain_id=p_chain AND verifying_contract=p_verifier AND market=p_market
     AND collateral_token=p_token AND account=p_account AND bucket='RESERVED';
  SELECT balance::NUMERIC INTO held_position FROM perp_margin_balances
    WHERE chain_id=p_chain AND verifying_contract=p_verifier AND market=p_market
     AND collateral_token=p_token AND account=p_account AND bucket='POSITION';

  SELECT COALESCE(SUM(signed_delta::NUMERIC) FILTER (WHERE bucket='RESERVED'),0),
         COALESCE(SUM(signed_delta::NUMERIC) FILTER (WHERE bucket='POSITION'),0)
    INTO booked_reserved,booked_position FROM perp_margin_entries
    WHERE chain_id=p_chain AND verifying_contract=p_verifier AND market=p_market
     AND collateral_token=p_token AND account=p_account;
  IF held_reserved IS NULL OR held_position IS NULL OR
    held_reserved<>booked_reserved OR held_position<>booked_position THEN
    RAISE EXCEPTION 'signed account RESERVED/POSITION balance differs from M3 postings';
  END IF;
  IF held_reserved<open_im OR held_position<filled_im THEN
    RAISE EXCEPTION 'signed account OPEN/FILLED margin obligations underfunded';
  END IF;

  -- Every M3 operation for a signed account must have exactly its two matching
  -- posting legs and the action-specific bucket path. Deferred checking allows
  -- both legs to be created in the same transaction.
  SELECT COUNT(*) INTO bad_operations FROM perp_margin_operations op
  LEFT JOIN perp_margin_entries d ON
    (d.chain_id,d.verifying_contract,d.market,d.collateral_token,d.operation_id,d.leg)
    =(op.chain_id,op.verifying_contract,op.market,op.collateral_token,op.operation_id,0)
  LEFT JOIN perp_margin_entries c ON
    (c.chain_id,c.verifying_contract,c.market,c.collateral_token,c.operation_id,c.leg)
    =(op.chain_id,op.verifying_contract,op.market,op.collateral_token,op.operation_id,1)
  WHERE op.chain_id=p_chain AND op.verifying_contract=p_verifier AND op.market=p_market
    AND op.collateral_token=p_token AND op.account=p_account AND
   (d.account IS DISTINCT FROM op.account OR c.account IS DISTINCT FROM op.account
    OR d.bucket IS DISTINCT FROM op.from_bucket
    OR c.bucket IS DISTINCT FROM op.to_bucket
    OR d.signed_delta IS DISTINCT FROM '-'||op.amount
    OR c.signed_delta IS DISTINCT FROM op.amount
    OR NOT (
      (op.action='RESERVE' AND op.from_bucket='AVAILABLE' AND op.to_bucket='RESERVED') OR
      (op.action='RELEASE' AND op.from_bucket='RESERVED' AND op.to_bucket='AVAILABLE') OR
      (op.action='ALLOCATE' AND op.from_bucket='RESERVED' AND op.to_bucket='POSITION') OR
      (op.action='UNALLOCATE' AND op.from_bucket='POSITION' AND op.to_bucket='AVAILABLE')
    ));
  IF bad_operations>0 THEN
    RAISE EXCEPTION 'signed account M3 operation lacks matching double-entry posting';
  END IF;
  SELECT COUNT(*) INTO foreign_entries FROM perp_margin_entries e
    JOIN perp_margin_operations op USING
      (chain_id,verifying_contract,market,collateral_token,operation_id)
    WHERE e.chain_id=p_chain AND e.verifying_contract=p_verifier AND e.market=p_market
      AND e.collateral_token=p_token AND e.account=p_account AND op.account<>p_account;
  IF foreign_entries>0 THEN
    RAISE EXCEPTION 'signed account M3 posting belongs to different operation owner';
  END IF;

  -- Separate the signed-order movements (RESERVE and mutually exclusive
  -- RELEASE/ALLOCATE) from OTHER M3 reservations/position holdings.
  -- Never label the remaining balance as free or withdrawable funds.
  WITH signed_ids AS (
    SELECT substring(order_id from 3) AS op_id
    FROM perp_sim_orders WHERE chain_id=p_chain AND verifying_contract=p_verifier
      AND market=p_market AND collateral_token=p_token AND account=p_account
    UNION
    SELECT r.release_id
    FROM perp_signed_cancel_receipts r WHERE r.chain_id=p_chain
      AND r.verifying_contract=p_verifier AND r.market=p_market
      AND r.collateral_token=p_token AND r.account=p_account
    UNION
    SELECT CASE WHEN prep.buyer_account=p_account THEN ex.buyer_allocation_id
                ELSE ex.seller_allocation_id END
    FROM perp_signed_pair_executions ex JOIN perp_signed_pair_preparations prep
      ON prep.chain_id=ex.chain_id AND prep.verifying_contract=ex.verifying_contract
      AND prep.fill_id=ex.fill_id
    WHERE ex.chain_id=p_chain AND ex.verifying_contract=p_verifier
      AND ex.market=p_market AND ex.collateral_token=p_token
      AND p_account IN(prep.buyer_account,prep.seller_account)
  )
  SELECT COALESCE(SUM(e.signed_delta::NUMERIC) FILTER (WHERE e.bucket='RESERVED'),0),
         COALESCE(SUM(e.signed_delta::NUMERIC) FILTER (WHERE e.bucket='POSITION'),0)
    INTO other_reserved,other_position
    FROM perp_margin_entries e
    WHERE e.chain_id=p_chain AND e.verifying_contract=p_verifier
      AND e.market=p_market AND e.collateral_token=p_token AND e.account=p_account
      AND e.bucket IN ('RESERVED','POSITION')
      AND NOT EXISTS(SELECT 1 FROM signed_ids i WHERE i.op_id=e.operation_id);

  IF other_reserved<0 OR other_position<0 OR
     open_im+other_reserved<>held_reserved OR
     filled_im+other_position<>held_position THEN
    RAISE EXCEPTION 'signed account aggregate reserve allocation conservation violated';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION signed_account_margin_on_order_commit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM assert_signed_account_margin_conservation(
   NEW.chain_id,NEW.verifying_contract,NEW.market,NEW.collateral_token,NEW.account);
 RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS signed_account_margin_order_commit ON perp_sim_orders;
CREATE CONSTRAINT TRIGGER signed_account_margin_order_commit
 AFTER INSERT OR UPDATE ON perp_sim_orders DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION signed_account_margin_on_order_commit();

CREATE OR REPLACE FUNCTION signed_account_margin_on_bucket_commit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b RECORD;
BEGIN
 IF TG_OP='DELETE' THEN b:=OLD; ELSE b:=NEW; END IF;
 IF b.bucket IN ('RESERVED','POSITION') THEN
  PERFORM assert_signed_account_margin_conservation(
   b.chain_id,b.verifying_contract,b.market,b.collateral_token,b.account);
 END IF;
 RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS signed_account_margin_bucket_commit ON perp_margin_balances;
CREATE CONSTRAINT TRIGGER signed_account_margin_bucket_commit
 AFTER INSERT OR UPDATE OR DELETE ON perp_margin_balances DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION signed_account_margin_on_bucket_commit();

CREATE OR REPLACE FUNCTION signed_account_margin_on_operation_commit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM assert_signed_account_margin_conservation(
   NEW.chain_id,NEW.verifying_contract,NEW.market,NEW.collateral_token,NEW.account);
 RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS signed_account_margin_operation_commit ON perp_margin_operations;
CREATE CONSTRAINT TRIGGER signed_account_margin_operation_commit
 AFTER INSERT ON perp_margin_operations DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION signed_account_margin_on_operation_commit();

CREATE OR REPLACE FUNCTION signed_account_margin_on_entry_commit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE op RECORD;
BEGIN
 PERFORM assert_signed_account_margin_conservation(
   NEW.chain_id,NEW.verifying_contract,NEW.market,NEW.collateral_token,NEW.account);
 SELECT account INTO op FROM perp_margin_operations
  WHERE chain_id=NEW.chain_id AND verifying_contract=NEW.verifying_contract
    AND market=NEW.market AND collateral_token=NEW.collateral_token
    AND operation_id=NEW.operation_id;
 IF FOUND AND op.account<>NEW.account THEN
  PERFORM assert_signed_account_margin_conservation(
   NEW.chain_id,NEW.verifying_contract,NEW.market,NEW.collateral_token,op.account);
 END IF;
 RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS signed_account_margin_entry_commit ON perp_margin_entries;
CREATE CONSTRAINT TRIGGER signed_account_margin_entry_commit
 AFTER INSERT ON perp_margin_entries DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION signed_account_margin_on_entry_commit();

-- Never silently bless a legacy signed account with inconsistent booked margin.
DO $$
DECLARE k RECORD;
BEGIN
 FOR k IN SELECT DISTINCT chain_id,verifying_contract,market,collateral_token,account
   FROM perp_sim_orders LOOP
  PERFORM assert_signed_account_margin_conservation(
    k.chain_id,k.verifying_contract,k.market,k.collateral_token,k.account);
 END LOOP;
END $$;
