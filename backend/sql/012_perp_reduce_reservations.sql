-- M5-T3-A: shadow-only reduce-only capacity escrow, NOT orders / M4 fills / collateral.
-- Capacity consumed by hypothetical fills remains charged to the old position
-- version until an EXPLICIT later reconciliation with the paired M4 journal.
CREATE TABLE IF NOT EXISTS perp_reduce_guards (
  chain_id BIGINT NOT NULL CHECK(chain_id > 0),
  verifying_contract VARCHAR(42) NOT NULL,
  market VARCHAR(32) NOT NULL,
  collateral_token VARCHAR(42) NOT NULL,
  account VARCHAR(42) NOT NULL,
  position_version BIGINT CHECK(position_version >= 0),
  position_size_atomic VARCHAR(79),
  config_revision BIGINT,
  config_hash VARCHAR(66),
  consumed_qty_atomic VARCHAR(78) NOT NULL DEFAULT '0' CHECK(consumed_qty_atomic ~ '^(0|[1-9][0-9]*)$'),
  revision BIGINT NOT NULL DEFAULT 0 CHECK(revision >= 0),
  PRIMARY KEY(chain_id,verifying_contract,market,collateral_token,account),
  CHECK((position_version IS NULL AND position_size_atomic IS NULL AND config_revision IS NULL AND config_hash IS NULL)
    OR (position_version IS NOT NULL AND position_size_atomic IS NOT NULL AND config_revision IS NOT NULL AND config_hash IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS perp_reduce_orders (
  chain_id BIGINT NOT NULL,verifying_contract VARCHAR(42) NOT NULL,
  market VARCHAR(32) NOT NULL,collateral_token VARCHAR(42) NOT NULL,
  account VARCHAR(42) NOT NULL,order_id VARCHAR(66) NOT NULL CHECK(order_id ~ '^0x[0-9a-f]{64}$'),
  side VARCHAR(4) NOT NULL CHECK(side IN ('BUY','SELL')),
  price_atomic VARCHAR(78) NOT NULL CHECK(price_atomic ~ '^[1-9][0-9]*$'),
  requested_qty_atomic VARCHAR(78) NOT NULL CHECK(requested_qty_atomic ~ '^[1-9][0-9]*$'),
  remaining_qty_atomic VARCHAR(78) NOT NULL CHECK(remaining_qty_atomic ~ '^(0|[1-9][0-9]*)$'),
  consumed_qty_atomic VARCHAR(78) NOT NULL DEFAULT '0' CHECK(consumed_qty_atomic ~ '^(0|[1-9][0-9]*)$'),
  cancelled_qty_atomic VARCHAR(78) NOT NULL DEFAULT '0' CHECK(cancelled_qty_atomic ~ '^(0|[1-9][0-9]*)$'),
  status VARCHAR(12) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CANCELLED','EXHAUSTED')),
  position_version BIGINT NOT NULL CHECK(position_version >= 0),
  config_revision BIGINT NOT NULL CHECK(config_revision > 0),
  config_hash VARCHAR(66) NOT NULL CHECK(config_hash ~ '^0x[0-9a-f]{64}$'),
  snapshot_hash VARCHAR(66) NOT NULL CHECK(snapshot_hash ~ '^0x[0-9a-f]{64}$'),
  margin_fingerprint VARCHAR(66) NOT NULL CHECK(margin_fingerprint ~ '^0x[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(chain_id,verifying_contract,account,order_id),
  FOREIGN KEY(chain_id,verifying_contract,market,collateral_token,account)
    REFERENCES perp_reduce_guards(chain_id,verifying_contract,market,collateral_token,account) ON DELETE RESTRICT,
  CHECK(requested_qty_atomic::numeric = remaining_qty_atomic::numeric + consumed_qty_atomic::numeric + cancelled_qty_atomic::numeric),
  CHECK((status='OPEN' AND remaining_qty_atomic<>'0' AND cancelled_qty_atomic='0') OR
    (status='EXHAUSTED' AND remaining_qty_atomic='0' AND cancelled_qty_atomic='0') OR
    (status='CANCELLED' AND remaining_qty_atomic='0' AND cancelled_qty_atomic<>'0'))
);
CREATE INDEX IF NOT EXISTS perp_reduce_orders_account_idx ON perp_reduce_orders
  (chain_id,verifying_contract,market,collateral_token,account,status);
CREATE TABLE IF NOT EXISTS perp_reduce_events (
  chain_id BIGINT NOT NULL,verifying_contract VARCHAR(42) NOT NULL,
  account VARCHAR(42) NOT NULL,event_id VARCHAR(66) NOT NULL CHECK(event_id ~ '^0x[0-9a-f]{64}$'),
  order_id VARCHAR(66) NOT NULL,market VARCHAR(32) NOT NULL,collateral_token VARCHAR(42) NOT NULL,
  action VARCHAR(8) NOT NULL CHECK(action IN ('CONSUME','CANCEL')),
  quantity_atomic VARCHAR(78) NOT NULL CHECK(quantity_atomic ~ '^[1-9][0-9]*$'),
  remaining_after VARCHAR(78) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(chain_id,verifying_contract,account,event_id),
  FOREIGN KEY(chain_id,verifying_contract,account,order_id)
    REFERENCES perp_reduce_orders(chain_id,verifying_contract,account,order_id) ON DELETE RESTRICT
);
DROP TRIGGER IF EXISTS perp_reduce_events_immutable ON perp_reduce_events;
CREATE TRIGGER perp_reduce_events_immutable BEFORE UPDATE OR DELETE ON perp_reduce_events
  FOR EACH ROW EXECUTE FUNCTION reject_perp_position_application_mutation();
