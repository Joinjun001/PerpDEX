import { Pool } from "pg";
import { PostgresNonceRegistry } from "./nonce-registry.ts";

/**
 * Reuse a Pool for standalone operations. The future Order API should pass a
 * transaction-scoped pg.Client adapter instead so the order INSERT and nonce
 * INSERT commit or rollback atomically.
 */
export function createPostgresNonceRegistry(pool: Pool): PostgresNonceRegistry {
  return new PostgresNonceRegistry({
    async query(text, values = []) {
      const result = await pool.query(text, [...values]);
      return { rows: result.rows, rowCount: result.rowCount };
    },
  });
}
