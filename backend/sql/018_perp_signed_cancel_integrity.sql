-- M5-T3-C3-B: signed v2 cancellation receipt and RELEASE conservation.
-- SIMULATION_ONLY. Trusted service authenticates EIP-712 signature; PostgreSQL
-- checks journal/amount/nonce/state linkage, not cryptographic recovery.
-- Requires 001, 008, 009, 015, 017. Migration on old canceled records
-- fails closed until a separately reviewed authenticated backfill exists.
CREATE TABLE IF NOT EXISTS perp_signed_cancel_receipts (
  chain_id BIGINT NOT NULL,
  verifying_contract VARCHAR(42) NOT NULL,
  account VARCHAR(42) NOT NULL,
  nonce VARCHAR(78) NOT NULL,
  order_id VARCHAR(66) NOT NULL,
  market VARCHAR(32) NOT NULL,
  collateral_token VARCHAR(42) NOT NULL,
  release_id VARCHAR(64) NOT NULL CHECK (release_id ~ '^[0-9a-f]{64}$'),
  amount VARCHAR(78) NOT NULL CHECK (amount ~ '^[1-9][0-9]*$'),
  cancel_deadline BIGINT NOT NULL CHECK (cancel_deadline > 0),
  cancel_digest VARCHAR(66) NOT NULL CHECK (cancel_digest ~ '^0x[0-9a-f]{64}$'),
  cancel_signature VARCHAR(132) NOT NULL CHECK
    (cancel_signature ~ '^0x([0-9a-f]{128}|[0-9a-f]{130})$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id,verifying_contract,account,nonce),
  UNIQUE (chain_id,verifying_contract,order_id),
  UNIQUE (chain_id,verifying_contract,market,collateral_token,release_id),
  FOREIGN KEY (chain_id,verifying_contract,account,nonce)
    REFERENCES perp_sim_orders(chain_id,verifying_contract,account,nonce) ON DELETE RESTRICT,
  FOREIGN KEY (chain_id,verifying_contract,market,collateral_token,release_id)
    REFERENCES perp_margin_operations(chain_id,verifying_contract,market,collateral_token,operation_id)
    DEFERRABLE INITIALLY DEFERRED
);

-- Existing CANCELED rows without authenticated receipts cannot be blindly
-- assigned a forged signature during an administrative migration.
DO $$
BEGIN
 IF EXISTS(
   SELECT 1 FROM perp_sim_orders o
   LEFT JOIN perp_signed_cancel_receipts r ON r.chain_id=o.chain_id
      AND r.verifying_contract=o.verifying_contract AND r.account=o.account AND r.nonce=o.nonce
   WHERE o.status='CANCELED' AND r.order_id IS NULL
 ) THEN
  RAISE EXCEPTION 'legacy CANCELED signed orders require supervised authenticated receipt migration';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION perp_signed_cancel_receipt_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'signed cancellation receipt is append-only';
END $$;
DROP TRIGGER IF EXISTS perp_signed_cancel_receipt_immutable ON perp_signed_cancel_receipts;
CREATE TRIGGER perp_signed_cancel_receipt_immutable
 BEFORE UPDATE OR DELETE ON perp_signed_cancel_receipts
 FOR EACH ROW EXECUTE FUNCTION perp_signed_cancel_receipt_immutable();

CREATE OR REPLACE FUNCTION assert_perp_signed_cancel_commit(
 p_chain BIGINT,p_verifier VARCHAR,p_account VARCHAR,p_nonce VARCHAR)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
 o RECORD;n RECORD;r RECORD;m RECORD;
 postings INT; actual NUMERIC; posted NUMERIC; terminal INT;
BEGIN
 SELECT * INTO o FROM perp_sim_orders
 WHERE chain_id=p_chain AND verifying_contract=p_verifier
  AND account=p_account AND nonce=p_nonce;
 IF NOT FOUND OR o.status<>'CANCELED' THEN RETURN; END IF;
 SELECT * INTO n FROM order_nonces
 WHERE chain_id=p_chain AND verifying_contract=p_verifier
  AND account=p_account AND nonce=p_nonce;
 IF NOT FOUND OR n.status<>'CANCELED' OR n.order_id<>o.order_id OR
    n.expires_at<>o.expires_at THEN
  RAISE EXCEPTION 'signed cancellation order/nonce mismatch';
 END IF;
 SELECT * INTO r FROM perp_signed_cancel_receipts
 WHERE chain_id=p_chain AND verifying_contract=p_verifier
  AND account=p_account AND nonce=p_nonce;
 IF NOT FOUND OR r.order_id<>o.order_id OR r.market<>o.market OR
  r.collateral_token<>o.collateral_token OR r.amount<>o.initial_margin THEN
  RAISE EXCEPTION 'signed cancellation requires matching immutable receipt';
 END IF;
 IF EXISTS(SELECT 1 FROM perp_signed_pair_executions e
   JOIN perp_signed_pair_preparations p
    ON p.chain_id=e.chain_id AND p.verifying_contract=e.verifying_contract
     AND p.fill_id=e.fill_id
  WHERE e.chain_id=o.chain_id AND e.verifying_contract=o.verifying_contract
    AND (p.buyer_order_id=o.order_id OR p.seller_order_id=o.order_id)) THEN
  RAISE EXCEPTION 'signed cancellation conflicts with executed fill';
 END IF;
 SELECT * INTO m FROM perp_margin_operations
 WHERE chain_id=p_chain AND verifying_contract=p_verifier
   AND market=o.market AND collateral_token=o.collateral_token
   AND operation_id=r.release_id;
 IF NOT FOUND OR m.account<>o.account OR m.action<>'RELEASE' OR
   m.from_bucket<>'RESERVED' OR m.to_bucket<>'AVAILABLE' OR
   m.amount<>o.initial_margin THEN
   RAISE EXCEPTION 'signed cancellation M3 RELEASE operation mismatch';
 END IF;
 SELECT COUNT(*) INTO postings FROM perp_margin_entries
 WHERE chain_id=p_chain AND verifying_contract=p_verifier
 AND market=o.market AND collateral_token=o.collateral_token
 AND operation_id=r.release_id AND account=o.account AND (
  (leg=0 AND bucket='RESERVED' AND signed_delta='-'||o.initial_margin) OR
  (leg=1 AND bucket='AVAILABLE' AND signed_delta=o.initial_margin));
 IF postings<>2 THEN RAISE EXCEPTION 'signed cancellation M3 RELEASE posting mismatch'; END IF;
 -- Each signed account must be backed by its own append-only M3 reserved
 -- operations, not merely independently rewritten balance fields.
 SELECT balance::NUMERIC INTO actual FROM perp_margin_balances
 WHERE chain_id=p_chain AND verifying_contract=p_verifier AND market=o.market
  AND collateral_token=o.collateral_token AND account=o.account AND bucket='RESERVED';
 SELECT COALESCE(SUM(signed_delta::NUMERIC),0) INTO posted FROM perp_margin_entries
 WHERE chain_id=p_chain AND verifying_contract=p_verifier AND market=o.market
  AND collateral_token=o.collateral_token AND account=o.account AND bucket='RESERVED';
 IF actual IS NULL OR actual<>posted THEN
  RAISE EXCEPTION 'signed cancellation RESERVED balance differs from M3 posting sum';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION perp_signed_cancel_order_commit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM assert_perp_signed_cancel_commit(NEW.chain_id,NEW.verifying_contract,NEW.account,NEW.nonce);
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS perp_signed_cancel_order_commit ON perp_sim_orders;
CREATE CONSTRAINT TRIGGER perp_signed_cancel_order_commit
 AFTER INSERT OR UPDATE ON perp_sim_orders DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION perp_signed_cancel_order_commit();

CREATE OR REPLACE FUNCTION perp_signed_cancel_nonce_commit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o RECORD;
BEGIN
 SELECT * INTO o FROM perp_sim_orders WHERE chain_id=NEW.chain_id
 AND verifying_contract=NEW.verifying_contract AND account=NEW.account AND nonce=NEW.nonce;
 IF FOUND THEN
 PERFORM assert_perp_signed_cancel_commit(o.chain_id,o.verifying_contract,o.account,o.nonce);
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS perp_signed_cancel_nonce_commit ON order_nonces;
CREATE CONSTRAINT TRIGGER perp_signed_cancel_nonce_commit
 AFTER INSERT OR UPDATE ON order_nonces DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION perp_signed_cancel_nonce_commit();

CREATE OR REPLACE FUNCTION perp_signed_cancel_receipt_commit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_state VARCHAR(16);
BEGIN
 SELECT status INTO current_state FROM perp_sim_orders
 WHERE chain_id=NEW.chain_id AND verifying_contract=NEW.verifying_contract
  AND account=NEW.account AND nonce=NEW.nonce;
 IF current_state IS DISTINCT FROM 'CANCELED' THEN
  RAISE EXCEPTION 'signed cancellation receipt requires CANCELED order';
 END IF;
 PERFORM assert_perp_signed_cancel_commit(NEW.chain_id,NEW.verifying_contract,NEW.account,NEW.nonce);
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS perp_signed_cancel_receipt_commit ON perp_signed_cancel_receipts;
CREATE CONSTRAINT TRIGGER perp_signed_cancel_receipt_commit
 AFTER INSERT ON perp_signed_cancel_receipts DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION perp_signed_cancel_receipt_commit();

-- Protect post-cancellation balance tampering or a second unrelated release,
-- including direct SQL writes that don't touch order/nonce/receipt.
CREATE OR REPLACE FUNCTION perp_signed_cancel_balance_commit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t RECORD;c RECORD;
BEGIN
 IF TG_OP='DELETE' THEN t:=OLD; ELSE t:=NEW; END IF;
 IF t.bucket='RESERVED' THEN
 FOR c IN SELECT account,nonce FROM perp_sim_orders
 WHERE chain_id=t.chain_id AND verifying_contract=t.verifying_contract
  AND market=t.market AND collateral_token=t.collateral_token AND account=t.account
  AND status='CANCELED' LOOP
   PERFORM assert_perp_signed_cancel_commit(t.chain_id,t.verifying_contract,c.account,c.nonce);
 END LOOP;
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS perp_signed_cancel_balance_commit ON perp_margin_balances;
CREATE CONSTRAINT TRIGGER perp_signed_cancel_balance_commit
 AFTER INSERT OR UPDATE OR DELETE ON perp_margin_balances DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION perp_signed_cancel_balance_commit();

-- After release operation INSERT, any signed cancellation involved in this
-- account is still required to reconcile in the same COMMIT.
CREATE OR REPLACE FUNCTION perp_signed_cancel_m3_operation_commit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c RECORD;
BEGIN
 IF NEW.action IN ('RESERVE','RELEASE','ALLOCATE','UNALLOCATE') THEN
 FOR c IN SELECT nonce FROM perp_sim_orders
 WHERE chain_id=NEW.chain_id AND verifying_contract=NEW.verifying_contract
  AND market=NEW.market AND collateral_token=NEW.collateral_token
  AND account=NEW.account AND status='CANCELED' LOOP
   PERFORM assert_perp_signed_cancel_commit(NEW.chain_id,NEW.verifying_contract,NEW.account,c.nonce);
 END LOOP;
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS perp_signed_cancel_operation_commit ON perp_margin_operations;
CREATE CONSTRAINT TRIGGER perp_signed_cancel_operation_commit
 AFTER INSERT ON perp_margin_operations DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION perp_signed_cancel_m3_operation_commit();
