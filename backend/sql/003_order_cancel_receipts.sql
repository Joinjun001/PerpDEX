-- M2-T3: durable proof of successfully authorized cancellation.
-- The receipt is written in the same transaction as the nonce/order cancel.
-- Rows must not be deleted: identical retries require durable evidence.
CREATE TABLE IF NOT EXISTS order_cancel_receipts (
  chain_id BIGINT NOT NULL,
  verifying_contract VARCHAR(42) NOT NULL,
  account VARCHAR(42) NOT NULL,
  nonce VARCHAR(78) NOT NULL,
  deadline BIGINT NOT NULL,
  signature VARCHAR(132) NOT NULL
    CHECK (signature ~ '^0x([0-9a-f]{128}|[0-9a-f]{130})$'),
  order_exists BOOLEAN NOT NULL,
  remaining_quantity VARCHAR(78),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_cancel_receipts_scope_pk
    PRIMARY KEY (chain_id, verifying_contract, account, nonce),
  CONSTRAINT order_cancel_receipts_nonce_fk
    FOREIGN KEY (chain_id, verifying_contract, account, nonce)
    REFERENCES order_nonces (chain_id, verifying_contract, account, nonce)
    ON DELETE RESTRICT,
  CONSTRAINT order_cancel_receipts_result_check
    CHECK ((order_exists AND remaining_quantity IS NOT NULL AND remaining_quantity ~ '^(0|[1-9][0-9]*)$')
       OR (NOT order_exists AND remaining_quantity IS NULL))
);
