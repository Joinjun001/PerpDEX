-- M2-T4-B: durable book admission order and execution ledger.
-- Admission is explicit for internal callers; POST /api/orders now admits/matches atomically.
-- A per-domain/market counter ROW LOCK serializes sequence allocation and matching.
-- Unlike nextval(), counter updates roll back, and higher committed sequences
-- cannot overtake lower committed sequences on the same market.
CREATE TABLE IF NOT EXISTS order_book_counters (
  chain_id BIGINT NOT NULL CHECK (chain_id > 0),
  verifying_contract VARCHAR(42) NOT NULL,
  market VARCHAR(32) NOT NULL,
  last_sequence BIGINT NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  PRIMARY KEY (chain_id, verifying_contract, market)
);

CREATE TABLE IF NOT EXISTS order_book_entries (
  chain_id BIGINT NOT NULL,
  verifying_contract VARCHAR(42) NOT NULL,
  market VARCHAR(32) NOT NULL,
  account VARCHAR(42) NOT NULL,
  nonce VARCHAR(78) NOT NULL,
  order_id VARCHAR(66) NOT NULL,
  arrival_sequence BIGINT NOT NULL CHECK (arrival_sequence > 0),
  admitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, verifying_contract, account, nonce),
  UNIQUE (chain_id, verifying_contract, market, arrival_sequence),
  UNIQUE (chain_id, verifying_contract, market, order_id),
  FOREIGN KEY (chain_id, verifying_contract, account, nonce)
    REFERENCES orders (chain_id, verifying_contract, account, nonce) ON DELETE RESTRICT,
  FOREIGN KEY (chain_id, verifying_contract, market)
    REFERENCES order_book_counters (chain_id, verifying_contract, market) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS order_book_entries_market_seq_idx
  ON order_book_entries (chain_id, verifying_contract, market, arrival_sequence);

CREATE TABLE IF NOT EXISTS order_fills (
  fill_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chain_id BIGINT NOT NULL,
  verifying_contract VARCHAR(42) NOT NULL,
  market VARCHAR(32) NOT NULL,
  maker_order_id VARCHAR(66) NOT NULL,
  taker_order_id VARCHAR(66) NOT NULL,
  buy_order_id VARCHAR(66) NOT NULL,
  sell_order_id VARCHAR(66) NOT NULL,
  price VARCHAR(78) NOT NULL CHECK (price ~ '^[1-9][0-9]*$'),
  quantity VARCHAR(78) NOT NULL CHECK (quantity ~ '^[1-9][0-9]*$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (maker_order_id <> taker_order_id),
  FOREIGN KEY (chain_id, verifying_contract, market, maker_order_id)
    REFERENCES order_book_entries (chain_id, verifying_contract, market, order_id) ON DELETE RESTRICT,
  FOREIGN KEY (chain_id, verifying_contract, market, taker_order_id)
    REFERENCES order_book_entries (chain_id, verifying_contract, market, order_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS order_fills_market_idx
  ON order_fills (chain_id, verifying_contract, market, fill_id);
