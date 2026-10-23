import type { IncomingMessage, ServerResponse } from "node:http";
import { validateOrderSigningDomain } from "../orders/signature.ts";
import type { OrderSigningDomainInput } from "../orders/signature.ts";
import { acceptSignedOrder } from "../orders/accept-order.ts";
import type { OrderTransactionManager } from "../orders/order-transactions.ts";
import type { CreateOrderInput } from "../orders/order.ts";
import { OrderValidationError } from "../orders/order.ts";
import { NonceAlreadyUsedError, NonceValidationError } from "../orders/nonce-registry.ts";
import { InvalidOrderSignatureError } from "../orders/order-auth.ts";

const MAX_BODY_BYTES = 64 * 1024;

class InvalidJsonBodyError extends Error {}
class BodyTooLargeError extends Error {}
class UnsupportedContentTypeError extends Error {}

function sendJson(response: ServerResponse, status: number, body: object, extra: Record<string, string> = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Length": Buffer.byteLength(payload),
    ...extra,
  });
  response.end(payload);
}

async function parseBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const contentType = request.headers["content-type"] ?? "";
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(contentType)) {
    throw new UnsupportedContentTypeError();
  }
  const declaredSize = Number(request.headers["content-length"]);
  if (request.headers["content-length"] !== undefined &&
      (!Number.isSafeInteger(declaredSize) || declaredSize < 0 || declaredSize > MAX_BODY_BYTES)) {
    throw new BodyTooLargeError();
  }
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of request) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += data.length;
    if (received > MAX_BODY_BYTES) throw new BodyTooLargeError();
    chunks.push(data);
  }
  let result: unknown;
  try {
    result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new InvalidJsonBodyError();
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new InvalidJsonBodyError();
  }
  return result as Record<string, unknown>;
}

function validatedRequest(payload: Record<string, unknown>): {order: CreateOrderInput; signature: string} {
  // Never use a request-provided EIP-712 domain. Reject it to surface caller mistakes.
  if (Object.hasOwn(payload, "domain")) throw new InvalidJsonBodyError();
  if (!payload.order || typeof payload.order !== "object" || Array.isArray(payload.order) ||
      Object.hasOwn(payload.order, "domain") ||
      typeof payload.signature !== "string") {
    throw new InvalidJsonBodyError();
  }
  // validateCreateOrder() in acceptSignedOrder performs actual runtime field validation.
  return { order: payload.order as CreateOrderInput, signature: payload.signature };
}

/**
 * Pure HTTP adapter. Does not listen on a port until the explicit server entrypoint runs.
 * trustedDomain MUST originate from backend configuration, not request JSON.
 */
export function createOrderHttpHandler(input: {
  trustedDomain: OrderSigningDomainInput;
  transactions: OrderTransactionManager;
}) {
  const trustedDomain = validateOrderSigningDomain(input.trustedDomain);
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const path = request.url?.split("?", 1)[0];
    if (path !== "/api/orders") {
      sendJson(response, 404, { error: { code: "NOT_FOUND", message: "route not found" } });
      return;
    }
    if (request.method !== "POST") {
      sendJson(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } }, { Allow: "POST" });
      return;
    }
    try {
      const payload = await parseBody(request);
      const { order, signature } = validatedRequest(payload);
      const accepted = await acceptSignedOrder(order, signature, trustedDomain, input.transactions);
      sendJson(response, 201, {
        orderId: accepted.orderId,
        status: "OPEN",
        order: accepted.order,
      });
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        sendJson(response, 413, { error: { code: "PAYLOAD_TOO_LARGE", message: "request body too large" } });
      } else if (error instanceof UnsupportedContentTypeError) {
        sendJson(response, 415, { error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "application/json required" } });
      } else if (error instanceof InvalidJsonBodyError || error instanceof OrderValidationError ||
                 error instanceof NonceValidationError || error instanceof RangeError) {
        sendJson(response, 400, { error: { code: "INVALID_ORDER", message: "invalid order request" } });
      } else if (error instanceof InvalidOrderSignatureError) {
        sendJson(response, 401, { error: { code: "INVALID_SIGNATURE", message: "invalid EIP-712 signature" } });
      } else if (error instanceof NonceAlreadyUsedError) {
        sendJson(response, 409, { error: { code: "NONCE_CONFLICT", message: "order nonce is unavailable" } });
      } else {
        // Never expose SQL messages, secret connection settings or stack traces to clients.
        sendJson(response, 500, { error: { code: "INTERNAL_ERROR", message: "internal server error" } });
      }
    }
  };
}
