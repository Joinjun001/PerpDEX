import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

// Explicit administrative step: never run migrations during an incoming API request.
// No defaults: require DATABASE_URL to be supplied out-of-band.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run PostgreSQL migrations");
}
const pool = new Pool({ connectionString: databaseUrl });
const migrations = [
  "../sql/001_order_nonces.sql",
  "../sql/002_orders.sql",
  "../sql/003_order_cancel_receipts.sql",
  "../sql/004_order_book.sql",
  "../sql/005_settlement_outbox.sql",
  "../sql/006_settlement_intents.sql",
  "../sql/007_settlement_reconciliations.sql",
  "../sql/008_perp_margin_ledger.sql",
  "../sql/009_perp_sim_orders.sql",
  "../sql/010_perp_position_ledger.sql",
  "../sql/011_perp_pair_clearing.sql",
  "../sql/012_perp_reduce_reservations.sql",
  "../sql/013_perp_guarded_position_commit.sql",
  "../sql/014_perp_reduce_ledger_integrity.sql",
  "../sql/015_perp_signed_opening_fence.sql",
  "../sql/016_perp_signed_pair_preparations.sql",
  "../sql/017_perp_signed_pair_executions.sql",
  "../sql/018_perp_signed_cancel_integrity.sql",
  "../sql/019_perp_signed_order_fill_progress.sql",
];

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const relativePath of migrations) {
      const filepath = fileURLToPath(new URL(relativePath, import.meta.url));
      await client.query(await readFile(filepath, "utf8"));
    }
    await client.query("COMMIT");
    process.stdout.write("order nonce, orders, matching, and settlement outbox and dry-run intent and mock reconciliation schema migrations applied\n");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
