-- M5-T3-B3-A: COMMIT-time safety fence for guarded SIMULATION_ONLY positions.
-- This is not a substitute for least-privilege database roles. A table owner or
-- a role with trigger-disable/DDL rights can bypass this protection.
-- Requires 010, 011 and 012. Constrains direct SQL and low-level M4 writers.
CREATE OR REPLACE FUNCTION reject_unguarded_perp_position_commit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  anchor RECORD;
  prior_account VARCHAR(42);
  prior_chain BIGINT;
  prior_verifier VARCHAR(42);
  prior_market VARCHAR(32);
  prior_collateral VARCHAR(42);
  paired_count INTEGER;
  sum_long NUMERIC;
  sum_short NUMERIC;
  oi NUMERIC;
  market_mode VARCHAR(8);
BEGIN
  IF TG_OP='DELETE' THEN
    prior_account := OLD.account;
    prior_chain := OLD.chain_id;
    prior_verifier := OLD.verifying_contract;
    prior_market := OLD.market;
    prior_collateral := OLD.collateral_token;
  ELSE
    prior_account := NEW.account;
    prior_chain := NEW.chain_id;
    prior_verifier := NEW.verifying_contract;
    prior_market := NEW.market;
    prior_collateral := NEW.collateral_token;
  END IF;

  SELECT position_version,position_size_atomic,config_revision,config_hash
    INTO anchor FROM perp_reduce_guards
    WHERE chain_id=prior_chain AND verifying_contract=prior_verifier
      AND market=prior_market AND collateral_token=prior_collateral
      AND account=prior_account;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF TG_OP='DELETE' OR
     anchor.position_version IS DISTINCT FROM NEW.version OR
     anchor.position_size_atomic IS DISTINCT FROM NEW.size_signed_atomic OR
     anchor.config_revision IS DISTINCT FROM NEW.config_revision THEN
    RAISE EXCEPTION 'guarded position and capacity anchor mismatch at commit';
  END IF;

  -- No historical write is implied by a harmless updated_at mutation, but
  -- the snapshot must still exactly match the latest persisted application.
  SELECT COUNT(*) INTO paired_count FROM perp_position_applications app
  WHERE app.chain_id=NEW.chain_id AND app.verifying_contract=NEW.verifying_contract
    AND app.market=NEW.market AND app.collateral_token=NEW.collateral_token
    AND app.account=NEW.account AND app.applied_version=NEW.version
    AND app.fill_id=NEW.last_fill_id AND app.size_signed_atomic=NEW.size_signed_atomic
    AND app.open_cost_numerator=NEW.open_cost_numerator
    AND app.realized_pnl_numerator=NEW.realized_pnl_numerator;
  IF paired_count<>1 THEN
    RAISE EXCEPTION 'guarded position latest application is missing or mismatched';
  END IF;

  -- A guarded snapshot version may only advance with a *matched* two-sided
  -- paired receipt and an append-only reservation consumption event carrying
  -- the exact same fill ID, quantity, account, chain, market and collateral.
  IF TG_OP='INSERT' OR NEW.version IS DISTINCT FROM OLD.version OR
     NEW.size_signed_atomic IS DISTINCT FROM OLD.size_signed_atomic OR
     NEW.last_fill_id IS DISTINCT FROM OLD.last_fill_id THEN
    SELECT COUNT(*) INTO paired_count
      FROM perp_position_applications app
      JOIN perp_sim_paired_fills pf
        ON pf.chain_id=app.chain_id AND pf.verifying_contract=app.verifying_contract
       AND pf.market=app.market AND pf.collateral_token=app.collateral_token
       AND pf.fill_id=app.fill_id
      JOIN perp_reduce_events ev
        ON ev.chain_id=app.chain_id AND ev.verifying_contract=app.verifying_contract
       AND ev.account=app.account AND ev.event_id=app.fill_id
       AND ev.market=app.market AND ev.collateral_token=app.collateral_token
      JOIN perp_reduce_orders ord
        ON ord.chain_id=ev.chain_id AND ord.verifying_contract=ev.verifying_contract
       AND ord.account=ev.account AND ord.order_id=ev.order_id
       AND ord.market=ev.market AND ord.collateral_token=ev.collateral_token
      WHERE app.chain_id=NEW.chain_id AND app.verifying_contract=NEW.verifying_contract
        AND app.market=NEW.market AND app.collateral_token=NEW.collateral_token
        AND app.account=NEW.account AND app.applied_version=NEW.version
        AND app.fill_id=NEW.last_fill_id AND app.opened_quantity_atomic='0'
        AND app.closed_quantity_atomic=pf.quantity_atomic
        AND ev.action='CONSUME' AND ev.quantity_atomic=pf.quantity_atomic
        AND ev.quantity_atomic=app.closed_quantity_atomic
        AND ((pf.buyer_account=NEW.account AND app.side='BUY') OR
             (pf.seller_account=NEW.account AND app.side='SELL'))
        AND pf.config_revision=NEW.config_revision AND pf.config_hash=app.config_hash
        AND ord.config_revision=NEW.config_revision AND ord.config_hash=app.config_hash;
    IF paired_count<>1 THEN
      RAISE EXCEPTION 'guarded position requires a matched paired-fill and reduce-only receipt';
    END IF;
  END IF;

  SELECT COALESCE(SUM(CASE WHEN size_signed_atomic::numeric > 0
                          THEN size_signed_atomic::numeric ELSE 0 END),0),
         COALESCE(SUM(CASE WHEN size_signed_atomic::numeric < 0
                          THEN -size_signed_atomic::numeric ELSE 0 END),0)
    INTO sum_long,sum_short FROM perp_position_snapshots
    WHERE chain_id=NEW.chain_id AND verifying_contract=NEW.verifying_contract
      AND market=NEW.market AND collateral_token=NEW.collateral_token;
  SELECT open_interest_atomic::numeric,mode INTO oi,market_mode
    FROM perp_market_open_interest
    WHERE chain_id=NEW.chain_id AND verifying_contract=NEW.verifying_contract
      AND market=NEW.market AND collateral_token=NEW.collateral_token;
  IF NOT FOUND OR market_mode<>'PAIRED' OR sum_long<>sum_short OR oi<>sum_long THEN
    RAISE EXCEPTION 'guarded position requires paired market open-interest conservation';
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS perp_guarded_position_commit ON perp_position_snapshots;
CREATE CONSTRAINT TRIGGER perp_guarded_position_commit
  AFTER INSERT OR UPDATE OR DELETE ON perp_position_snapshots
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION reject_unguarded_perp_position_commit();
