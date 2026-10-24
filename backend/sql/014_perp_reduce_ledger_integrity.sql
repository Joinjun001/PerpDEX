-- M5-T3-B3-B: SIMULATION_ONLY cross-table, deferred reserve/event accounting.
-- Requires 010-013. Not sufficient against an object owner, DDL privileges,
-- or a malicious writer that can forge an entire internally consistent journal.

CREATE OR REPLACE FUNCTION reject_perp_reduce_order_identity_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'perp reduce order deletion forbidden; cancel the remaining quantity';
  END IF;
  IF (NEW.chain_id,NEW.verifying_contract,NEW.market,NEW.collateral_token,
      NEW.account,NEW.order_id,NEW.side,NEW.price_atomic,NEW.requested_qty_atomic,
      NEW.config_revision,NEW.config_hash,NEW.snapshot_hash,NEW.margin_fingerprint,NEW.created_at)
     IS DISTINCT FROM
     (OLD.chain_id,OLD.verifying_contract,OLD.market,OLD.collateral_token,
      OLD.account,OLD.order_id,OLD.side,OLD.price_atomic,OLD.requested_qty_atomic,
      OLD.config_revision,OLD.config_hash,OLD.snapshot_hash,OLD.margin_fingerprint,OLD.created_at) THEN
    RAISE EXCEPTION 'perp reduce order identity and quote are immutable';
  END IF;
  IF OLD.status <> 'OPEN' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'closed perp reduce order is immutable';
  END IF;
  IF NEW.remaining_qty_atomic::numeric > OLD.remaining_qty_atomic::numeric OR
     NEW.consumed_qty_atomic::numeric < OLD.consumed_qty_atomic::numeric OR
     NEW.cancelled_qty_atomic::numeric < OLD.cancelled_qty_atomic::numeric OR
     NEW.position_version < OLD.position_version THEN
    RAISE EXCEPTION 'perp reduce order quantity and version must be monotonic';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS perp_reduce_order_immutable_identity ON perp_reduce_orders;
CREATE TRIGGER perp_reduce_order_immutable_identity
  BEFORE UPDATE OR DELETE ON perp_reduce_orders
  FOR EACH ROW EXECUTE FUNCTION reject_perp_reduce_order_identity_change();

CREATE OR REPLACE FUNCTION reject_perp_reduce_guard_identity_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'perp reduce guard deletion forbidden';
  END IF;
  IF (NEW.chain_id,NEW.verifying_contract,NEW.market,NEW.collateral_token,NEW.account)
    IS DISTINCT FROM
     (OLD.chain_id,OLD.verifying_contract,OLD.market,OLD.collateral_token,OLD.account) THEN
    RAISE EXCEPTION 'perp reduce guard scope is immutable';
  END IF;
  -- Anchoring NULL -> approved initial snapshot is allowed only once.
  IF OLD.position_version IS NOT NULL AND
     (NEW.config_revision IS DISTINCT FROM OLD.config_revision OR
      NEW.config_hash IS DISTINCT FROM OLD.config_hash OR
      NEW.position_version < OLD.position_version OR
      NEW.revision < OLD.revision) THEN
    RAISE EXCEPTION 'perp reduce guard policy and version are immutable/monotonic';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS perp_reduce_guard_immutable_identity ON perp_reduce_guards;
CREATE TRIGGER perp_reduce_guard_immutable_identity
  BEFORE UPDATE OR DELETE ON perp_reduce_guards
  FOR EACH ROW EXECUTE FUNCTION reject_perp_reduce_guard_identity_change();

CREATE OR REPLACE FUNCTION assert_perp_reduce_ledger_at_commit(
  p_chain BIGINT,p_verifier VARCHAR,p_market VARCHAR,p_token VARCHAR,p_account VARCHAR)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  g RECORD;
  pos RECORD;
  od RECORD;
  ev RECORD;
  open_qty NUMERIC := 0;
  shadow_qty NUMERIC := 0;
  sum_consumed NUMERIC;
  sum_cancelled NUMERIC;
  pf RECORD;
BEGIN
  SELECT * INTO g FROM perp_reduce_guards WHERE chain_id=p_chain
    AND verifying_contract=p_verifier AND market=p_market
    AND collateral_token=p_token AND account=p_account;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'perp reduce ledger missing guard at commit';
  END IF;
  SELECT size_signed_atomic,version,config_revision INTO pos
    FROM perp_position_snapshots WHERE chain_id=p_chain
    AND verifying_contract=p_verifier AND market=p_market
    AND collateral_token=p_token AND account=p_account;
  IF NOT FOUND OR g.position_version IS DISTINCT FROM pos.version OR
    g.position_size_atomic IS DISTINCT FROM pos.size_signed_atomic OR
    g.config_revision IS DISTINCT FROM pos.config_revision OR g.config_hash IS NULL THEN
    RAISE EXCEPTION 'perp reduce guard must match a durable anchored position';
  END IF;

  FOR od IN SELECT * FROM perp_reduce_orders WHERE chain_id=p_chain
      AND verifying_contract=p_verifier AND market=p_market
      AND collateral_token=p_token AND account=p_account LOOP
    SELECT COALESCE(SUM(quantity_atomic::numeric) FILTER (WHERE action='CONSUME'),0),
           COALESCE(SUM(quantity_atomic::numeric) FILTER (WHERE action='CANCEL'),0)
      INTO sum_consumed,sum_cancelled FROM perp_reduce_events
      WHERE chain_id=p_chain AND verifying_contract=p_verifier AND account=p_account
        AND market=p_market AND collateral_token=p_token AND order_id=od.order_id;
    IF od.config_hash<>g.config_hash OR od.config_revision<>g.config_revision THEN
      RAISE EXCEPTION 'perp reduce order policy differs from anchored guard';
    END IF;
    IF sum_consumed<>od.consumed_qty_atomic::numeric OR
       sum_cancelled<>od.cancelled_qty_atomic::numeric THEN
      RAISE EXCEPTION 'perp reduce order quantity differs from append-only event sums';
    END IF;
    IF od.status='OPEN' THEN
      IF od.position_version<>pos.version THEN
        RAISE EXCEPTION 'perp reduce open order stale position version';
      END IF;
      open_qty:=open_qty+od.remaining_qty_atomic::numeric;
    END IF;
  END LOOP;

  FOR ev IN SELECT e.*,o.market AS order_market,o.collateral_token AS order_collateral
    FROM perp_reduce_events e
    JOIN perp_reduce_orders o ON o.chain_id=e.chain_id
     AND o.verifying_contract=e.verifying_contract AND o.account=e.account
     AND o.order_id=e.order_id
    WHERE e.chain_id=p_chain AND e.verifying_contract=p_verifier
      AND e.market=p_market AND e.collateral_token=p_token AND e.account=p_account LOOP
    IF ev.remaining_after !~ '^(0|[1-9][0-9]*)$' OR
       ev.order_market<>p_market OR ev.order_collateral<>p_token THEN
      RAISE EXCEPTION 'perp reduce event references a different order domain';
    END IF;
    IF ev.action='CONSUME' THEN
      SELECT market,collateral_token,buyer_account,seller_account,quantity_atomic
        INTO pf FROM perp_sim_paired_fills
        WHERE chain_id=p_chain AND verifying_contract=p_verifier AND fill_id=ev.event_id;
      IF NOT FOUND THEN
        shadow_qty:=shadow_qty+ev.quantity_atomic::numeric;
      ELSE
        IF pf.market<>p_market OR pf.collateral_token<>p_token OR
           pf.quantity_atomic<>ev.quantity_atomic OR
           (pf.buyer_account<>p_account AND pf.seller_account<>p_account) THEN
          RAISE EXCEPTION 'perp reduce paired event has mismatched participant, quantity or market';
        END IF;
      END IF;
    END IF;
  END LOOP;
  IF shadow_qty<>g.consumed_qty_atomic::numeric THEN
    RAISE EXCEPTION 'perp reduce guard shadow quota differs from unpaired consumption';
  END IF;
  IF open_qty+shadow_qty>abs(pos.size_signed_atomic::numeric) THEN
    RAISE EXCEPTION 'perp reduce remaining plus shadow quota exceeds position';
  END IF;
END;
$$;

-- All three relations can be modified independently by SQL; check their FINAL
-- state after every committed transaction, not in the middle of B1/B2 writes.
CREATE OR REPLACE FUNCTION check_perp_reduce_ledger_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  c BIGINT;v VARCHAR(42);m VARCHAR(32);t VARCHAR(42);a VARCHAR(42);
BEGIN
  IF TG_OP='DELETE' THEN
    c:=OLD.chain_id;v:=OLD.verifying_contract;m:=OLD.market;
    t:=OLD.collateral_token;a:=OLD.account;
  ELSE
    c:=NEW.chain_id;v:=NEW.verifying_contract;m:=NEW.market;
    t:=NEW.collateral_token;a:=NEW.account;
  END IF;
  PERFORM assert_perp_reduce_ledger_at_commit(c,v,m,t,a);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS perp_reduce_guard_commit ON perp_reduce_guards;
CREATE CONSTRAINT TRIGGER perp_reduce_guard_commit
  AFTER INSERT OR UPDATE OR DELETE ON perp_reduce_guards
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_perp_reduce_ledger_change();
DROP TRIGGER IF EXISTS perp_reduce_order_commit ON perp_reduce_orders;
CREATE CONSTRAINT TRIGGER perp_reduce_order_commit
  AFTER INSERT OR UPDATE OR DELETE ON perp_reduce_orders
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_perp_reduce_ledger_change();
DROP TRIGGER IF EXISTS perp_reduce_event_commit ON perp_reduce_events;
CREATE CONSTRAINT TRIGGER perp_reduce_event_commit
  AFTER INSERT OR UPDATE OR DELETE ON perp_reduce_events
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_perp_reduce_ledger_change();
