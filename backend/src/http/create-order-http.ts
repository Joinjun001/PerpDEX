import type { IncomingMessage, ServerResponse } from "node:http";
import { validateOrderSigningDomain } from "../orders/signature.ts";
import type { OrderSigningDomainInput } from "../orders/signature.ts";
import { acceptSignedOrder } from "../orders/accept-order.ts";
import type { OrderTransactionManager } from "../orders/order-transactions.ts";
import type { CreateOrderInput } from "../orders/order.ts";
import { OrderValidationError } from "../orders/order.ts";
import { NonceAlreadyUsedError, NonceValidationError } from "../orders/nonce-registry.ts";
import { InvalidOrderSignatureError } from "../orders/order-auth.ts";
import { PostgresOrderStore } from "../orders/order-store.ts";
import type { SqlRunner } from "../orders/nonce-registry.ts";
import { ORDER_STATUSES } from "../orders/order.ts";
import { cancelSignedOrder, OrderCancellationConflictError } from "../orders/cancel-order.ts";
import { CancelValidationError, InvalidCancelSignatureError } from "../orders/cancel-signature.ts";
import type { CancelOrderInput } from "../orders/cancel-signature.ts";

const MAX_BODY_BYTES = 64 * 1024;

class InvalidJsonBodyError extends Error {}
class BodyTooLargeError extends Error {}
class UnsupportedContentTypeError extends Error {}
class InvalidQueryError extends Error {}

const ORDER_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const MARKET_PATTERN = /^[A-Z0-9]+(?:[-_/][A-Z0-9]+)*$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;

function readSingleParam(url: URL, name: string): string | undefined {
  const values = url.searchParams.getAll(name);
  if (values.length > 1) throw new InvalidQueryError();
  return values[0];
}

function parsePagination(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (!DECIMAL.test(value)) throw new InvalidQueryError();
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new InvalidQueryError();
  return number;
}

function parseListQuery(url: URL) {
  for (const key of url.searchParams.keys()) {
    if (!["market", "status", "limit", "offset"].includes(key)) throw new InvalidQueryError();
  }
  const rawMarket = readSingleParam(url, "market");
  const market = rawMarket?.toUpperCase();
  if (market !== undefined && (market.length > 32 || !MARKET_PATTERN.test(market))) throw new InvalidQueryError();
  const status = readSingleParam(url, "status");
  if (status !== undefined && !ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])) throw new InvalidQueryError();
  return {
    market,
    status,
    limit: parsePagination(readSingleParam(url, "limit"), 20, 1, 50),
    offset: parsePagination(readSingleParam(url, "offset"), 0, 0, 10000),
  };
}


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

function validatedCancelRequest(payload: Record<string, unknown>): { cancel: CancelOrderInput; signature: string } {
  // Reject untrusted signing domains explicitly, rather than silently ignoring them.
  if (Object.hasOwn(payload, "domain") ||
      !payload.cancel || typeof payload.cancel !== "object" || Array.isArray(payload.cancel) ||
      Object.hasOwn(payload.cancel, "domain") ||
      typeof payload.signature !== "string") {
    throw new InvalidJsonBodyError();
  }
  return { cancel: payload.cancel as CancelOrderInput, signature: payload.signature };
}

/**
 * Pure HTTP adapter. Does not listen on a port until the explicit server entrypoint runs.
 * trustedDomain MUST originate from backend configuration, not request JSON.
 */
export function createOrderHttpHandler(input: {
  trustedDomain: OrderSigningDomainInput;
  transactions: OrderTransactionManager;
  readDatabase: SqlRunner;
}) {
  const trustedDomain = validateOrderSigningDomain(input.trustedDomain);
  const store = new PostgresOrderStore(input.readDatabase);
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const cancelRoute = url.pathname === "/api/orders/cancel";
      // The static cancellation route must take precedence over :orderId.
      const detail = cancelRoute ? null : /^\/api\/orders\/([^/]+)$/.exec(url.pathname);
      if (url.pathname !== "/api/orders" && !detail && !cancelRoute) {
        sendJson(response, 404, { error: { code: "NOT_FOUND", message: "route not found" } });
        return;
      }
      if (cancelRoute) {
        if (request.method !== "POST") {
          sendJson(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } }, { Allow: "POST" });
          return;
        }
        if (url.search) throw new InvalidQueryError();
        const payload = await parseBody(request);
        const { cancel, signature } = validatedCancelRequest(payload);
        const result = await cancelSignedOrder(cancel, signature, trustedDomain, input.transactions);
        sendJson(response, 200, result);
        return;
      }
      if (detail) {
        if (request.method !== "GET") {
          sendJson(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET required" } }, { Allow: "GET" });
          return;
        }
        if (url.search || !ORDER_ID_PATTERN.test(detail[1])) throw new InvalidQueryError();
        const order = await store.findPublicById(detail[1].toLowerCase(), trustedDomain);
        if (!order) {
          sendJson(response, 404, { error: { code: "ORDER_NOT_FOUND", message: "order not found" } });
          return;
        }
        sendJson(response, 200, { order });
        return;
      }
      if (request.method === "GET") {
        const query = parseListQuery(url);
        const result = await store.listPublic({ domain: trustedDomain, ...query });
        sendJson(response, 200, { ...result, limit: query.limit, offset: query.offset });
        return;
      }
      if (request.method !== "POST") {
        sendJson(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "GET or POST required" } }, { Allow: "GET, POST" });
        return;
      }
      if (url.search) throw new InvalidQueryError();
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
      } else if (error instanceof InvalidQueryError) {
        sendJson(response, 400, { error: { code: "INVALID_QUERY", message: "invalid query parameters" } });
      } else if (error instanceof CancelValidationError) {
        sendJson(response, 400, { error: { code: "INVALID_CANCEL", message: "invalid cancel request" } });
      } else if (error instanceof InvalidJsonBodyError || error instanceof OrderValidationError ||
                 error instanceof NonceValidationError || error instanceof RangeError) {
        sendJson(response, 400, { error: { code: "INVALID_ORDER", message: "invalid order request" } });
      } else if (error instanceof InvalidCancelSignatureError) {
        sendJson(response, 401, { error: { code: "INVALID_CANCEL_SIGNATURE", message: "invalid EIP-712 cancel signature" } });
      } else if (error instanceof OrderCancellationConflictError) {
        sendJson(response, 409, { error: { code: "CANCEL_CONFLICT", message: "order cannot be canceled" } });
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
