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
const script = fileURLToPath(new URL("../sql/001_order_nonces.sql", import.meta.url));

try {
  const migration = await readFile(script, "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(migration);
    await client.query("COMMIT");
    process.stdout.write("order nonce migration applied\n");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
