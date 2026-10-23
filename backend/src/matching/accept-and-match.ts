import { PostgresNonceRegistry } from "../orders/nonce-registry.ts";
import { PostgresOrderStore } from "../orders/order-store.ts";
import { authenticateAndConsumeOrder } from "../orders/order-auth.ts";
import type { CreateOrderInput } from "../orders/order.ts";
import type { OrderSigningDomainInput } from "../orders/signature.ts";
import type { OrderTransactionManager } from "../orders/order-transactions.ts";
import { matchRegisteredOrderWithRunner, registerSignedOrderInBookWithRunner } from "./postgres-book.ts";

/**
 * Single commit boundary for the public create-order API. A failed admission,
 * matching update or fill ledger INSERT also rolls back the order and nonce.
 * The market counter row serializes admission and matching across API workers.
 */
export async function acceptAndMatchSignedOrder(
  rawOrder: CreateOrderInput,
  signature: string,
  trustedDomain: OrderSigningDomainInput,
  transactions: OrderTransactionManager,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  return transactions.withTransaction(async db => {
    const { order, orderId } = await authenticateAndConsumeOrder(
      rawOrder, trustedDomain, signature, new PostgresNonceRegistry(db), nowSeconds,
    );
    await new PostgresOrderStore(db).insert({ order, orderId, signature, domain: trustedDomain });
    const registration = await registerSignedOrderInBookWithRunner(order, trustedDomain, db, nowSeconds);
    const matching = await matchRegisteredOrderWithRunner(order, trustedDomain, db, nowSeconds);
    return { order, orderId, registration, matching };
  });
}
