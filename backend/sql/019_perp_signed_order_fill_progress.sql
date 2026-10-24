-- M5-T3-C3-C1: durable quantity projection, FULL-only fail-closed fence.
-- SIMULATION_ONLY; NO partial-fill write path, allocation policy or settlement.
-- Completed fills are derived solely from immutable SQL 017 terminal receipts
-- linked to SQL 016 preparations, never from mutable caller counters.
CREATE OR REPLACE VIEW perp_signed_order_fill_progress AS
WITH executed_legs AS (
  SELECT e.chain_id,e.verifying_contract,p.buyer_order_id AS order_id,
         p.quantity_atomic::numeric AS filled_qty
  FROM perp_signed_pair_executions e
  JOIN perp_signed_pair_preparations p
    ON e.chain_id=p.chain_id AND e.verifying_contract=p.verifying_contract
   AND e.fill_id=p.fill_id
  UNION ALL
  SELECT e.chain_id,e.verifying_contract,p.seller_order_id AS order_id,
         p.quantity_atomic::numeric AS filled_qty
  FROM perp_signed_pair_executions e
  JOIN perp_signed_pair_preparations p
    ON e.chain_id=p.chain_id AND e.verifying_contract=p.verifying_contract
   AND e.fill_id=p.fill_id
), executed_sums AS (
  SELECT chain_id,verifying_contract,order_id,
         count(*)::integer AS committed_fill_count,
         sum(filled_qty) AS filled_qty
  FROM executed_legs GROUP BY chain_id,verifying_contract,order_id
)
SELECT o.chain_id,o.verifying_contract,o.account,o.nonce,o.order_id,
       o.market,o.collateral_token,o.status,
       o.quantity AS total_quantity_atomic,
       COALESCE(s.committed_fill_count,0) AS committed_fill_count,
       COALESCE(s.filled_qty,0)::text AS cumulative_filled_quantity_atomic,
       (o.quantity::numeric-COALESCE(s.filled_qty,0))::text AS unfilled_quantity_atomic,
       CASE WHEN o.status='OPEN'
         THEN (o.quantity::numeric-COALESCE(s.filled_qty,0))::text
         ELSE '0' END AS executable_remaining_quantity_atomic
FROM perp_sim_orders o
LEFT JOIN executed_sums s
  ON s.chain_id=o.chain_id AND s.verifying_contract=o.verifying_contract
 AND s.order_id=o.order_id;

CREATE OR REPLACE FUNCTION assert_perp_signed_full_fill_progress(
  p_chain bigint,p_verifier varchar,p_account varchar,p_nonce varchar)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE p RECORD;
BEGIN
  SELECT * INTO p FROM perp_signed_order_fill_progress
  WHERE chain_id=p_chain AND verifying_contract=p_verifier
    AND account=p_account AND nonce=p_nonce;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'signed order fill progress missing at commit';
  END IF;
  IF p.total_quantity_atomic !~ '^[1-9][0-9]*$'
     OR p.total_quantity_atomic::numeric<=0
     OR p.total_quantity_atomic::numeric>115792089237316195423570985008687907853269984665640564039457584007913129639935::numeric
     OR p.cumulative_filled_quantity_atomic::numeric<0
     OR p.cumulative_filled_quantity_atomic::numeric>p.total_quantity_atomic::numeric
     OR p.unfilled_quantity_atomic::numeric<0
     OR p.cumulative_filled_quantity_atomic::numeric+
           p.unfilled_quantity_atomic::numeric<>p.total_quantity_atomic::numeric THEN
    RAISE EXCEPTION 'signed order total/filled/unfilled quantity invariant violated';
  END IF;
  IF (p.status IN ('OPEN','CANCELED') AND
       (p.committed_fill_count<>0 OR p.cumulative_filled_quantity_atomic<>'0' OR
        p.unfilled_quantity_atomic<>p.total_quantity_atomic))
     OR (p.status='FILLED' AND
       (p.committed_fill_count<>1 OR
        p.cumulative_filled_quantity_atomic<>p.total_quantity_atomic OR
        p.unfilled_quantity_atomic<>'0'))
     OR p.status NOT IN ('OPEN','CANCELED','FILLED') THEN
    RAISE EXCEPTION 'signed order progress status and terminal fills mismatch';
  END IF;
  -- A canceled/filled order's unfilled quantity is not executable.
  IF (p.status='OPEN' AND
       p.executable_remaining_quantity_atomic<>p.unfilled_quantity_atomic)
     OR (p.status IN ('CANCELED','FILLED') AND
       p.executable_remaining_quantity_atomic<>'0') THEN
    RAISE EXCEPTION 'signed order executable remaining quantity mismatch';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION perp_signed_order_fill_progress_commit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM assert_perp_signed_full_fill_progress(
    NEW.chain_id,NEW.verifying_contract,NEW.account,NEW.nonce);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS perp_signed_order_fill_progress_commit ON perp_sim_orders;
CREATE CONSTRAINT TRIGGER perp_signed_order_fill_progress_commit
 AFTER INSERT OR UPDATE ON perp_sim_orders
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 EXECUTE FUNCTION perp_signed_order_fill_progress_commit();

CREATE OR REPLACE FUNCTION perp_signed_execution_fill_progress_commit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p RECORD; b RECORD; s RECORD;
BEGIN
  SELECT * INTO p FROM perp_signed_pair_preparations
  WHERE chain_id=NEW.chain_id AND verifying_contract=NEW.verifying_contract
    AND fill_id=NEW.fill_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'signed execution preparation missing for fill progress';
  END IF;
  SELECT * INTO b FROM perp_sim_orders WHERE chain_id=NEW.chain_id
    AND verifying_contract=NEW.verifying_contract AND order_id=p.buyer_order_id;
  SELECT * INTO s FROM perp_sim_orders WHERE chain_id=NEW.chain_id
    AND verifying_contract=NEW.verifying_contract AND order_id=p.seller_order_id;
  IF b.order_id IS NULL OR s.order_id IS NULL THEN
    RAISE EXCEPTION 'signed execution order missing for fill progress';
  END IF;
  PERFORM assert_perp_signed_full_fill_progress(
    b.chain_id,b.verifying_contract,b.account,b.nonce);
  PERFORM assert_perp_signed_full_fill_progress(
    s.chain_id,s.verifying_contract,s.account,s.nonce);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS perp_signed_execution_fill_progress_commit ON perp_signed_pair_executions;
CREATE CONSTRAINT TRIGGER perp_signed_execution_fill_progress_commit
 AFTER INSERT ON perp_signed_pair_executions
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 EXECUTE FUNCTION perp_signed_execution_fill_progress_commit();

-- Reject existing inconsistent rows on administrative upgrade; never fabricate
-- previously missing terminal receipts, signed orders, or partial quantity.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT chain_id,verifying_contract,account,nonce FROM perp_sim_orders LOOP
    PERFORM assert_perp_signed_full_fill_progress(
      r.chain_id,r.verifying_contract,r.account,r.nonce);
  END LOOP;
END $$;
