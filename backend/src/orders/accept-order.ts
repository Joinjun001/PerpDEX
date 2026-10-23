import { PostgresNonceRegistry } from "./nonce-registry.ts";
import { PostgresOrderStore } from "./order-store.ts";
import type { OrderTransactionManager } from "./order-transactions.ts";
import { authenticateAndConsumeOrder } from "./order-auth.ts";
import type { CreateOrderInput } from "./order.ts";
import type { OrderSigningDomainInput } from "./signature.ts";

/**
 * Atomically accepts a signed order.
 * Domain MUST originate from trusted server configuration, not from request JSON.
 * If either nonce claim or order INSERT fails, the transaction manager rolls back both.
 *
 * Reusing a committed nonce is rejected, even if the caller retries after a lost response.
 * A future REST API may read the existing order to offer an idempotent response explicitly.
 */
export async function acceptSignedOrder(
  rawOrder: CreateOrderInput,
  signature: string,
  trustedDomain: OrderSigningDomainInput,
  transactions: OrderTransactionManager,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  return transactions.withTransaction(async (db) => {
    const registry = new PostgresNonceRegistry(db);
    const { order, orderId } = await authenticateAndConsumeOrder(
      rawOrder, trustedDomain, signature, registry, nowSeconds,
    );
    const store = new PostgresOrderStore(db);
    await store.insert({ order, orderId, signature, domain: trustedDomain });
    return { order, orderId };
  });
}
