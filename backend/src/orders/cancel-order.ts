import { validateCancelOrder, verifyCancelSignature, InvalidCancelSignatureError } from "./cancel-signature.ts";
import type { CancelOrderInput } from "./cancel-signature.ts";
import type { OrderSigningDomainInput } from "./signature.ts";
import type { OrderTransactionManager } from "./order-transactions.ts";
import { PostgresNonceRegistry } from "./nonce-registry.ts";
import { PostgresOrderStore } from "./order-store.ts";
import { PostgresIdempotencyReceipts } from "./idempotency.ts";

export class OrderCancellationConflictError extends Error {
  constructor() {
    super("order is already canceled, expired, filled, or the nonce is unavailable");
    this.name = "OrderCancellationConflictError";
  }
}

export type CancelResult =
  | { status: "CANCELED"; orderExists: false; remainingQuantity: null }
  | { status: "CANCELED"; orderExists: true; remainingQuantity: string };

/**
 * The only supported external cancellation boundary.
 *
 * 1. Validate a distinct EIP-712 CancelOrder signature.
 * 2. Claim/update nonce tombstone first to serialize with order creation.
 * 3. Cancel an existing OPEN/PARTIALLY_FILLED order; preserve filled quantity.
 * 4. Roll back both changes if the stored order is terminal or update fails.
 *
 * The nonce row lock (INSERT .. ON CONFLICT DO UPDATE) serializes a concurrent
 * acceptSignedOrder, which also claims the identical nonce before INSERT.
 * Caller MUST provide a trusted domain, never accept one from request JSON.
 */
export async function cancelSignedOrder(
  raw: CancelOrderInput,
  signature: string,
  trustedDomain: OrderSigningDomainInput,
  transactions: OrderTransactionManager,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<CancelResult> {
  const request = validateCancelOrder(raw, nowSeconds);
  if (!(await verifyCancelSignature(request, trustedDomain, signature, nowSeconds))) {
    throw new InvalidCancelSignatureError();
  }
  return transactions.withTransaction(async (db) => {
    const nonceRegistry = new PostgresNonceRegistry(db);
    if (!(await nonceRegistry.cancel(request, trustedDomain))) {
      throw new OrderCancellationConflictError();
    }
    const orders = new PostgresOrderStore(db);
    const receipts = new PostgresIdempotencyReceipts(db);
    const key = { account: request.account, nonce: request.nonce, domain: trustedDomain };
    const canceled = await orders.cancelActive(key);
    if (canceled) {
      const remaining = BigInt(canceled.quantity) - BigInt(canceled.filled_quantity);
      if (remaining < 0n) throw new Error("stored order has invalid filled quantity");
      const result: CancelResult = { status: "CANCELED", orderExists: true, remainingQuantity: remaining.toString() };
      await receipts.recordCancel(request,signature,trustedDomain,result);
      return result;
    }
    const existing = await orders.findByNonce(key);
    if (existing !== null) {
      // Terminal order: nonce tombstone change above must be rolled back.
      throw new OrderCancellationConflictError();
    }
    // A signed cancellation before order creation reserves the nonce permanently.
    const result: CancelResult = { status: "CANCELED", orderExists: false, remainingQuantity: null };
    await receipts.recordCancel(request,signature,trustedDomain,result);
    return result;
  });
}
