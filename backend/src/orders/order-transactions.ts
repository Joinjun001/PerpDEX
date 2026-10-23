import type { Pool, PoolClient } from "pg";
import type { SqlRunner } from "./nonce-registry.ts";

/** A transaction-bound runner: each SQL statement uses the same connection. */
export interface OrderTransactionManager {
  withTransaction<T>(callback: (db: SqlRunner) => Promise<T>): Promise<T>;
}

function queryClient(client: Pick<PoolClient, "query">): SqlRunner {
  return {
    async query(sql, params = []) {
      const result = await client.query(sql, [...params]);
      return { rows: result.rows, rowCount: result.rowCount };
    },
  };
}

/**
 * Production pool adapter. Never use Pool.query in the callback:
 * it could execute on a different connection and break atomicity.
 */
export function postgresTransactionManager(pool: Pick<Pool, "connect">): OrderTransactionManager {
  return {
    async withTransaction<T>(callback: (db: SqlRunner) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      let begun = false;
      try {
        await client.query("BEGIN");
        begun = true;
        const result = await callback(queryClient(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        if (begun) {
          try {
            await client.query("ROLLBACK");
          } catch (rollbackError) {
            throw new AggregateError([error, rollbackError], "transaction and rollback failed");
          }
        }
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
