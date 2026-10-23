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
    process.stdout.write("order nonce, order, and cancellation receipt schema migrations applied\n");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
