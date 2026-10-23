import { createDeterministicOrderId, validateCreateOrder } from "./order.ts";
import { verifyOrderSignature } from "./signature.ts";
import type { CreateOrderInput } from "./order.ts";
import type { OrderSigningDomainInput } from "./signature.ts";
import { NonceAlreadyUsedError, PostgresNonceRegistry } from "./nonce-registry.ts";

export class InvalidOrderSignatureError extends Error {
  constructor() {
    super("invalid EIP-712 order signature");
    this.name = "InvalidOrderSignatureError";
  }
}

/**
 * Boundary called by the future Order API.
 * Never accept domain from the HTTP request. Bind it to trusted server config.
 *
 * The caller is responsible for enclosing any order persistence with the
 * nonce claim in the same DB transaction (using the same SqlRunner/client).
 */
export async function authenticateAndConsumeOrder(
  rawOrder: CreateOrderInput,
  trustedDomain: OrderSigningDomainInput,
  signature: string,
  registry: PostgresNonceRegistry,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const order = validateCreateOrder(rawOrder, nowSeconds);
  if (!(await verifyOrderSignature(order, trustedDomain, signature, nowSeconds))) {
    throw new InvalidOrderSignatureError();
  }
  const orderId = createDeterministicOrderId(order);
  if (!(await registry.consume(order, trustedDomain, orderId))) {
    throw new NonceAlreadyUsedError();
  }
  return { order, orderId };
}
