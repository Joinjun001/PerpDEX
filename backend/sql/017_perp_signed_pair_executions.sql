-- M5-T3-C2-B2-B: internal SIMULATION_ONLY signed full-opening settlement.
-- SQL 015 fail-closed protections remain. Only a complete, linked terminal
-- receipt may consume orders; no external funds or public executor.
ALTER TABLE perp_sim_orders DROP CONSTRAINT IF EXISTS perp_sim_orders_status_check;
ALTER TABLE perp_sim_orders ADD CONSTRAINT perp_sim_orders_status_check
  CHECK (status IN ('OPEN','CANCELED','FILLED'));

CREATE TABLE IF NOT EXISTS perp_signed_pair_executions (
 chain_id BIGINT NOT NULL,
 verifying_contract VARCHAR(42) NOT NULL,
 market VARCHAR(32) NOT NULL,
 collateral_token VARCHAR(42) NOT NULL,
 fill_id VARCHAR(66) NOT NULL CHECK(fill_id ~ '^0x[0-9a-f]{64}$'),
 buyer_order_id VARCHAR(66) NOT NULL,
 seller_order_id VARCHAR(66) NOT NULL,
 buyer_allocation_id VARCHAR(64) NOT NULL CHECK(buyer_allocation_id ~ '^[0-9a-f]{64}$'),
 seller_allocation_id VARCHAR(64) NOT NULL CHECK(seller_allocation_id ~ '^[0-9a-f]{64}$'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(chain_id,verifying_contract,fill_id),
 FOREIGN KEY(chain_id,verifying_contract,fill_id)
   REFERENCES perp_signed_pair_preparations(chain_id,verifying_contract,fill_id),
 FOREIGN KEY(chain_id,verifying_contract,fill_id)
   REFERENCES perp_sim_paired_fills(chain_id,verifying_contract,fill_id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(chain_id,verifying_contract,market,collateral_token,buyer_allocation_id)
   REFERENCES perp_margin_operations(chain_id,verifying_contract,market,collateral_token,operation_id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(chain_id,verifying_contract,market,collateral_token,seller_allocation_id)
   REFERENCES perp_margin_operations(chain_id,verifying_contract,market,collateral_token,operation_id) DEFERRABLE INITIALLY DEFERRED,
 CHECK (buyer_order_id<>seller_order_id AND buyer_allocation_id<>seller_allocation_id)
);
DROP TRIGGER IF EXISTS perp_signed_pair_executions_immutable ON perp_signed_pair_executions;
CREATE TRIGGER perp_signed_pair_executions_immutable
 BEFORE UPDATE OR DELETE ON perp_signed_pair_executions
 FOR EACH ROW EXECUTE FUNCTION reject_signed_pair_preparation_mutation();

-- Supersede ONLY the order state rule in 015; preserve immutable payload.
CREATE OR REPLACE FUNCTION perp_signed_order_reject_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'signed shadow order cannot be deleted'; END IF;
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
 IF NEW.status IS DISTINCT FROM OLD.status THEN
  IF NOT (OLD.status='OPEN' AND NEW.status IN ('CANCELED','FILLED')) THEN
   RAISE EXCEPTION 'signed shadow order status transition is not authorized';
  END IF;
  IF NEW.status='FILLED' AND NOT EXISTS (
    SELECT 1 FROM perp_signed_pair_executions e JOIN perp_signed_pair_preparations p
     ON e.chain_id=p.chain_id AND e.verifying_contract=p.verifying_contract AND e.fill_id=p.fill_id
    WHERE p.chain_id=NEW.chain_id AND p.verifying_contract=NEW.verifying_contract
     AND ((p.buyer_order_id=NEW.order_id AND NEW.side='BUY' AND NEW.account=p.buyer_account) OR
          (p.seller_order_id=NEW.order_id AND NEW.side='SELL' AND NEW.account=p.seller_account))
  ) THEN
   RAISE EXCEPTION 'signed FILLED transition needs linked terminal execution receipt';
  END IF;
 END IF;
 RETURN NEW;
END; $$;

-- New terminal check is additional to 015 and applies to updates of either
-- order, terminal receipt, margin operations and M4 snapshots at COMMIT.
CREATE OR REPLACE FUNCTION assert_signed_pair_execution(p_chain BIGINT,p_verifier VARCHAR,p_fill VARCHAR)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
 e RECORD;p RECORD;pf RECORD;b RECORD;s RECORD;
 ob RECORD;os RECORD;ab RECORD;asell RECORD;
 pb RECORD;ps RECORD;mb RECORD;ms RECORD;
 blegs INT;slegs INT;oi NUMERIC;l NUMERIC;sh NUMERIC;
 held NUMERIC; posted NUMERIC; who VARCHAR(42);bucketName VARCHAR(16);
BEGIN
 SELECT * INTO e FROM perp_signed_pair_executions
  WHERE chain_id=p_chain AND verifying_contract=p_verifier AND fill_id=p_fill;
 IF NOT FOUND THEN RAISE EXCEPTION 'signed execution terminal receipt missing'; END IF;
 SELECT * INTO p FROM perp_signed_pair_preparations
  WHERE chain_id=p_chain AND verifying_contract=p_verifier AND fill_id=p_fill;
 SELECT * INTO pf FROM perp_sim_paired_fills
  WHERE chain_id=p_chain AND verifying_contract=p_verifier AND fill_id=p_fill;
 IF p.fill_id IS NULL OR pf.fill_id IS NULL
  OR (e.market,e.collateral_token,e.buyer_order_id,e.seller_order_id)
    IS DISTINCT FROM(p.market,p.collateral_token,p.buyer_order_id,p.seller_order_id)
  OR (pf.market,pf.collateral_token,pf.buyer_account,pf.seller_account,
      pf.quantity_atomic,pf.price_atomic,pf.config_revision,pf.config_hash,pf.oracle_sequence)
    IS DISTINCT FROM (p.market,p.collateral_token,p.buyer_account,p.seller_account,
      p.quantity_atomic,p.price_atomic,p.config_revision,p.config_hash,p.oracle_sequence)
 THEN RAISE EXCEPTION 'signed execution paired receipt mismatch'; END IF;
 SELECT * INTO b FROM perp_sim_orders WHERE chain_id=p_chain AND verifying_contract=p_verifier
   AND order_id=p.buyer_order_id;
 SELECT * INTO s FROM perp_sim_orders WHERE chain_id=p_chain AND verifying_contract=p_verifier
   AND order_id=p.seller_order_id;
 IF b.order_id IS NULL OR s.order_id IS NULL
   OR b.status<>'FILLED' OR s.status<>'FILLED'
   OR b.account<>p.buyer_account OR s.account<>p.seller_account
   OR b.side<>'BUY' OR s.side<>'SELL'
   OR b.quantity<>p.quantity_atomic OR s.quantity<>p.quantity_atomic
   OR b.initial_margin<>p.buyer_reserved_margin
   OR s.initial_margin<>p.seller_reserved_margin
   OR b.market<>p.market OR s.market<>p.market
   OR b.collateral_token<>p.collateral_token OR s.collateral_token<>p.collateral_token
 THEN RAISE EXCEPTION 'signed execution order terminal-state mismatch'; END IF;
 SELECT * INTO ob FROM order_nonces WHERE chain_id=p_chain AND verifying_contract=p_verifier
  AND account=b.account AND nonce=b.nonce;
 SELECT * INTO os FROM order_nonces WHERE chain_id=p_chain AND verifying_contract=p_verifier
  AND account=s.account AND nonce=s.nonce;
 IF ob.status<>'USED' OR os.status<>'USED'
  OR ob.order_id<>b.order_id OR os.order_id<>s.order_id THEN
  RAISE EXCEPTION 'signed execution nonce mismatch';
 END IF;
 SELECT * INTO ab FROM perp_margin_operations WHERE chain_id=p_chain AND verifying_contract=p_verifier
  AND market=e.market AND collateral_token=e.collateral_token AND operation_id=e.buyer_allocation_id;
 SELECT * INTO asell FROM perp_margin_operations WHERE chain_id=p_chain AND verifying_contract=p_verifier
  AND market=e.market AND collateral_token=e.collateral_token AND operation_id=e.seller_allocation_id;
 IF ab.operation_id IS NULL OR asell.operation_id IS NULL
  OR ab.action<>'ALLOCATE' OR asell.action<>'ALLOCATE'
  OR ab.from_bucket<>'RESERVED' OR asell.from_bucket<>'RESERVED'
  OR ab.to_bucket<>'POSITION' OR asell.to_bucket<>'POSITION'
  OR ab.account<>b.account OR asell.account<>s.account
  OR ab.amount<>b.initial_margin OR asell.amount<>s.initial_margin THEN
  RAISE EXCEPTION 'signed execution margin allocation mismatch';
 END IF;
 SELECT COUNT(*) INTO blegs FROM perp_margin_entries WHERE chain_id=p_chain AND verifying_contract=p_verifier
  AND market=e.market AND collateral_token=e.collateral_token AND operation_id=e.buyer_allocation_id
  AND account=b.account AND ((leg=0 AND bucket='RESERVED' AND signed_delta='-'||ab.amount)
                           OR (leg=1 AND bucket='POSITION' AND signed_delta=ab.amount));
 SELECT COUNT(*) INTO slegs FROM perp_margin_entries WHERE chain_id=p_chain AND verifying_contract=p_verifier
  AND market=e.market AND collateral_token=e.collateral_token AND operation_id=e.seller_allocation_id
  AND account=s.account AND ((leg=0 AND bucket='RESERVED' AND signed_delta='-'||asell.amount)
                           OR (leg=1 AND bucket='POSITION' AND signed_delta=asell.amount));
 IF blegs<>2 OR slegs<>2 THEN RAISE EXCEPTION 'signed execution allocation legs mismatch'; END IF;
 -- For a signed executed account, RESERVED and POSITION buckets must exactly
 -- equal their append-only posting sum. This detects independent direct SQL
 -- balance tampering after (or within) the execution transaction.
 FOR who IN SELECT unnest(ARRAY[b.account,s.account]) LOOP
   FOREACH bucketName IN ARRAY ARRAY['RESERVED'::varchar,'POSITION'::varchar] LOOP
    SELECT balance::numeric INTO held FROM perp_margin_balances
      WHERE chain_id=p_chain AND verifying_contract=p_verifier
        AND market=e.market AND collateral_token=e.collateral_token
        AND account=who AND bucket=bucketName;
    SELECT COALESCE(SUM(signed_delta::numeric),0) INTO posted FROM perp_margin_entries
      WHERE chain_id=p_chain AND verifying_contract=p_verifier
        AND market=e.market AND collateral_token=e.collateral_token
        AND account=who AND bucket=bucketName;
    IF held IS NULL OR held<>posted THEN
      RAISE EXCEPTION 'signed execution M3 bucket differs from durable posting sum';
    END IF;
   END LOOP;
 END LOOP;
 SELECT * INTO pb FROM perp_position_snapshots WHERE chain_id=p_chain AND verifying_contract=p_verifier
  AND market=e.market AND collateral_token=e.collateral_token AND account=b.account;
 SELECT * INTO ps FROM perp_position_snapshots WHERE chain_id=p_chain AND verifying_contract=p_verifier
  AND market=e.market AND collateral_token=e.collateral_token AND account=s.account;
 IF pb.version<>1 OR ps.version<>1 OR pb.last_fill_id<>p_fill OR ps.last_fill_id<>p_fill
  OR pb.size_signed_atomic<>p.quantity_atomic OR ps.size_signed_atomic<>'-'||p.quantity_atomic
 THEN RAISE EXCEPTION 'signed execution position snapshot mismatch'; END IF;
 SELECT * INTO mb FROM perp_position_applications WHERE chain_id=p_chain AND verifying_contract=p_verifier
  AND account=b.account AND fill_id=p_fill;
 SELECT * INTO ms FROM perp_position_applications WHERE chain_id=p_chain AND verifying_contract=p_verifier
  AND account=s.account AND fill_id=p_fill;
 IF mb.side<>'BUY' OR ms.side<>'SELL' OR mb.quantity_atomic<>p.quantity_atomic
  OR ms.quantity_atomic<>p.quantity_atomic OR mb.price_atomic<>p.price_atomic
  OR ms.price_atomic<>p.price_atomic OR mb.closed_quantity_atomic<>'0'
  OR ms.closed_quantity_atomic<>'0' OR mb.opened_quantity_atomic<>p.quantity_atomic
  OR ms.opened_quantity_atomic<>p.quantity_atomic OR mb.realized_delta_atomic<>'0'
  OR ms.realized_delta_atomic<>'0' THEN
  RAISE EXCEPTION 'signed execution M4 application mismatch'; END IF;
 SELECT open_interest_atomic::numeric INTO oi FROM perp_market_open_interest
  WHERE chain_id=p_chain AND verifying_contract=p_verifier
    AND market=p.market AND collateral_token=p.collateral_token;
 SELECT COALESCE(SUM(CASE WHEN size_signed_atomic::numeric>0 THEN size_signed_atomic::numeric ELSE 0 END),0),
  COALESCE(SUM(CASE WHEN size_signed_atomic::numeric<0 THEN -size_signed_atomic::numeric ELSE 0 END),0)
  INTO l,sh FROM perp_position_snapshots
  WHERE chain_id=p_chain AND verifying_contract=p_verifier
   AND market=p.market AND collateral_token=p.collateral_token;
 IF oi IS NULL OR oi<>l OR oi<>sh OR pf.open_interest_after::numeric<>oi THEN
   RAISE EXCEPTION 'signed execution market OI mismatch';
 END IF;
END; $$;

-- Signed FILLED cannot be committed without a complete terminal receipt, even
-- if status was changed by a direct SQL writer instead of the typed service.
CREATE OR REPLACE FUNCTION check_signed_filled_order_commit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r RECORD;
BEGIN
 SELECT * INTO r FROM perp_sim_orders WHERE chain_id=NEW.chain_id
 AND verifying_contract=NEW.verifying_contract AND account=NEW.account AND nonce=NEW.nonce;
 IF r.status='FILLED' THEN
  IF NOT EXISTS(SELECT 1 FROM perp_signed_pair_executions e
   JOIN perp_signed_pair_preparations p ON p.chain_id=e.chain_id
     AND p.verifying_contract=e.verifying_contract AND p.fill_id=e.fill_id
   WHERE e.chain_id=r.chain_id AND e.verifying_contract=r.verifying_contract
     AND (p.buyer_order_id=r.order_id OR p.seller_order_id=r.order_id))
   THEN RAISE EXCEPTION 'signed filled order requires terminal execution receipt'; END IF;
 END IF;
 RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS perp_signed_filled_order_commit ON perp_sim_orders;
CREATE CONSTRAINT TRIGGER perp_signed_filled_order_commit AFTER INSERT OR UPDATE
 ON perp_sim_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 EXECUTE FUNCTION check_signed_filled_order_commit();

CREATE OR REPLACE FUNCTION signed_pair_execution_commit_check()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM assert_signed_pair_execution(NEW.chain_id,NEW.verifying_contract,NEW.fill_id);
 RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS perp_signed_execution_commit ON perp_signed_pair_executions;
CREATE CONSTRAINT TRIGGER perp_signed_execution_commit AFTER INSERT
 ON perp_signed_pair_executions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 EXECUTE FUNCTION signed_pair_execution_commit_check();

-- Also evaluate the terminal receipt when related tables mutate independently.
CREATE OR REPLACE FUNCTION signed_pair_mutation_commit_check()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c BIGINT;v VARCHAR(42);f VARCHAR(66);rec RECORD;
BEGIN
 IF TG_OP='DELETE' THEN rec:=OLD; ELSE rec:=NEW; END IF;
 c:=rec.chain_id;v:=rec.verifying_contract;
 IF TG_TABLE_NAME='perp_sim_paired_fills' THEN f:=rec.fill_id;
 ELSIF TG_TABLE_NAME='perp_position_snapshots' THEN f:=rec.last_fill_id;
 ELSE f:=NULL; END IF;
 IF f IS NOT NULL AND EXISTS (SELECT 1 FROM perp_signed_pair_executions
   WHERE chain_id=c AND verifying_contract=v AND fill_id=f) THEN
   PERFORM assert_signed_pair_execution(c,v,f);
 END IF;
 RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS perp_signed_execution_paired_commit ON perp_sim_paired_fills;
CREATE CONSTRAINT TRIGGER perp_signed_execution_paired_commit AFTER INSERT
 ON perp_sim_paired_fills DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 EXECUTE FUNCTION signed_pair_mutation_commit_check();

-- Change only the 015 order/nonce status consistency gate to recognize FILLED.
CREATE OR REPLACE FUNCTION perp_signed_order_commit_check()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE od RECORD;tombstone RECORD;reserved RECORD;postings INTEGER;
BEGIN
 SELECT * INTO od FROM perp_sim_orders WHERE chain_id=NEW.chain_id
 AND verifying_contract=NEW.verifying_contract AND account=NEW.account AND nonce=NEW.nonce;
 IF NOT FOUND THEN RAISE EXCEPTION 'signed shadow order missing at commit'; END IF;
 SELECT status,order_id,expires_at INTO tombstone FROM order_nonces
 WHERE chain_id=od.chain_id AND verifying_contract=od.verifying_contract
 AND account=od.account AND nonce=od.nonce;
 IF NOT FOUND OR tombstone.order_id IS DISTINCT FROM od.order_id
 OR tombstone.expires_at IS DISTINCT FROM od.expires_at
 OR (od.status IN('OPEN','FILLED') AND tombstone.status<>'USED')
 OR (od.status='CANCELED' AND tombstone.status<>'CANCELED') THEN
  RAISE EXCEPTION 'signed shadow order status differs from nonce tombstone';
 END IF;
 SELECT action,amount,account,from_bucket,to_bucket INTO reserved
 FROM perp_margin_operations WHERE chain_id=od.chain_id AND verifying_contract=od.verifying_contract
 AND market=od.market AND collateral_token=od.collateral_token AND operation_id=substring(od.order_id from 3);
 IF NOT FOUND OR reserved.action<>'RESERVE' OR reserved.amount<>od.initial_margin
 OR reserved.account<>od.account OR reserved.from_bucket<>'AVAILABLE'
 OR reserved.to_bucket<>'RESERVED' THEN
  RAISE EXCEPTION 'signed order must retain original reserve operation';
 END IF;
 SELECT COUNT(*) INTO postings FROM perp_margin_entries WHERE chain_id=od.chain_id
 AND verifying_contract=od.verifying_contract AND market=od.market AND collateral_token=od.collateral_token
 AND operation_id=substring(od.order_id from 3) AND account=od.account
 AND ((leg=0 AND bucket='AVAILABLE' AND signed_delta='-'||od.initial_margin)
   OR (leg=1 AND bucket='RESERVED' AND signed_delta=od.initial_margin));
 IF postings<>2 THEN RAISE EXCEPTION 'signed order must retain both reserve posting legs'; END IF;
 PERFORM perp_signed_reserve_coverage(od.chain_id,od.verifying_contract,od.market,od.collateral_token,od.account);
 RETURN NULL;
END; $$;
CREATE OR REPLACE FUNCTION perp_signed_nonce_commit_check()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE od RECORD;
BEGIN
 SELECT status,order_id,expires_at INTO od FROM perp_sim_orders
 WHERE chain_id=NEW.chain_id AND verifying_contract=NEW.verifying_contract
 AND account=NEW.account AND nonce=NEW.nonce;
 IF FOUND AND (NEW.order_id IS DISTINCT FROM od.order_id
 OR NEW.expires_at IS DISTINCT FROM od.expires_at
 OR (od.status IN('OPEN','FILLED') AND NEW.status<>'USED')
 OR (od.status='CANCELED' AND NEW.status<>'CANCELED')) THEN
  RAISE EXCEPTION 'signed nonce mutation contradicts shadow order';
 END IF;
 RETURN NULL;
END; $$;


-- Defend committed positions and margin buckets even if an untrusted SQL writer
-- mutates rows in a later transaction without touching terminal receipts.
-- Fail closed: future C3 reductions require explicit accounting extensions.
CREATE OR REPLACE FUNCTION signed_execution_account_commit_check()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r RECORD; ex RECORD;
BEGIN
 IF TG_OP='DELETE' THEN r:=OLD; ELSE r:=NEW; END IF;
 FOR ex IN SELECT e.chain_id,e.verifying_contract,e.fill_id
   FROM perp_signed_pair_executions e
   JOIN perp_signed_pair_preparations p
     ON p.chain_id=e.chain_id AND p.verifying_contract=e.verifying_contract
      AND p.fill_id=e.fill_id
   WHERE e.chain_id=r.chain_id AND e.verifying_contract=r.verifying_contract
     AND e.market=r.market AND e.collateral_token=r.collateral_token
     AND r.account IN (p.buyer_account,p.seller_account)
 LOOP
   PERFORM assert_signed_pair_execution(ex.chain_id,ex.verifying_contract,ex.fill_id);
 END LOOP;
 RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS perp_signed_execution_balance_commit ON perp_margin_balances;
CREATE CONSTRAINT TRIGGER perp_signed_execution_balance_commit
 AFTER INSERT OR UPDATE OR DELETE ON perp_margin_balances
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 EXECUTE FUNCTION signed_execution_account_commit_check();
DROP TRIGGER IF EXISTS perp_signed_execution_position_commit ON perp_position_snapshots;
CREATE CONSTRAINT TRIGGER perp_signed_execution_position_commit
 AFTER INSERT OR UPDATE OR DELETE ON perp_position_snapshots
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 EXECUTE FUNCTION signed_execution_account_commit_check();

-- Market OI must remain conserved even after a signed execution. Future
-- unrelated M4 pairs remain possible if they update both positions and OI.
CREATE OR REPLACE FUNCTION signed_execution_market_conservation_commit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r RECORD; longs NUMERIC; shorts NUMERIC; tracked NUMERIC;
BEGIN
 IF TG_OP='DELETE' THEN r:=OLD; ELSE r:=NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM perp_signed_pair_executions
   WHERE chain_id=r.chain_id AND verifying_contract=r.verifying_contract
    AND market=r.market AND collateral_token=r.collateral_token) THEN RETURN NULL; END IF;
 SELECT open_interest_atomic::NUMERIC INTO tracked FROM perp_market_open_interest
   WHERE chain_id=r.chain_id AND verifying_contract=r.verifying_contract
    AND market=r.market AND collateral_token=r.collateral_token;
 SELECT COALESCE(SUM(CASE WHEN size_signed_atomic::NUMERIC>0 THEN size_signed_atomic::NUMERIC ELSE 0 END),0),
        COALESCE(SUM(CASE WHEN size_signed_atomic::NUMERIC<0 THEN -size_signed_atomic::NUMERIC ELSE 0 END),0)
   INTO longs,shorts FROM perp_position_snapshots
   WHERE chain_id=r.chain_id AND verifying_contract=r.verifying_contract
    AND market=r.market AND collateral_token=r.collateral_token;
 IF tracked IS NULL OR tracked<>longs OR tracked<>shorts THEN
  RAISE EXCEPTION 'signed execution market OI conservation violated';
 END IF;
 RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS perp_signed_market_oi_commit ON perp_market_open_interest;
CREATE CONSTRAINT TRIGGER perp_signed_market_oi_commit
 AFTER INSERT OR UPDATE OR DELETE ON perp_market_open_interest
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 EXECUTE FUNCTION signed_execution_market_conservation_commit();
DROP TRIGGER IF EXISTS perp_signed_market_position_commit ON perp_position_snapshots;
CREATE CONSTRAINT TRIGGER perp_signed_market_position_commit
 AFTER INSERT OR UPDATE OR DELETE ON perp_position_snapshots
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 EXECUTE FUNCTION signed_execution_market_conservation_commit();
