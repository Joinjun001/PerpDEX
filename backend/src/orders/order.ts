export const ORDER_SIDES = ["BUY", "SELL"] as const;

export type OrderSide = (typeof ORDER_SIDES)[number];

export interface CreateOrderInput {
  account: string;
  market: string;
  side: OrderSide;
  price: string;
  quantity: string;
  nonce: string;
  expiresAt: number;
}

export interface OrderInput extends CreateOrderInput {}

export class OrderValidationError extends Error {
  readonly field: keyof CreateOrderInput;

  constructor(field: keyof CreateOrderInput, message: string) {
    super(`${field}: ${message}`);
    this.name = "OrderValidationError";
    this.field = field;
  }
}

const EVM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MARKET_PATTERN = /^[A-Z0-9]+(?:[-_/][A-Z0-9]+)*$/;
const UINT_PATTERN = /^(0|[1-9][0-9]*)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(
  input: Record<string, unknown>,
  field: keyof CreateOrderInput,
): string {
  const value = input[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new OrderValidationError(field, "non-empty string required");
  }
  return value.trim();
}

function validateUintString(
  value: string,
  field: "price" | "quantity" | "nonce",
  allowZero: boolean,
): string {
  if (!UINT_PATTERN.test(value)) {
    throw new OrderValidationError(field, "unsigned base-10 integer string required");
  }

  const parsed = BigInt(value);
  if (!allowZero && parsed === 0n) {
    throw new OrderValidationError(field, "must be greater than zero");
  }

  return parsed.toString();
}

export function validateCreateOrder(
  value: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
): OrderInput {
  if (!isRecord(value)) {
    throw new OrderValidationError("account", "order input object required");
  }

  const account = requireString(value, "account").toLowerCase();
  if (!EVM_ADDRESS_PATTERN.test(account) || account === ZERO_ADDRESS) {
    throw new OrderValidationError("account", "non-zero EVM address required");
  }

  const market = requireString(value, "market").toUpperCase();
  if (market.length > 32 || !MARKET_PATTERN.test(market)) {
    throw new OrderValidationError("market", "invalid market identifier");
  }

  const sideValue = requireString(value, "side").toUpperCase();
  if (!ORDER_SIDES.includes(sideValue as OrderSide)) {
    throw new OrderValidationError("side", "BUY or SELL required");
  }

  const price = validateUintString(requireString(value, "price"), "price", false);
  const quantity = validateUintString(requireString(value, "quantity"), "quantity", false);
  const nonce = validateUintString(requireString(value, "nonce"), "nonce", true);

  const expiresAt = value.expiresAt;
  if (!Number.isSafeInteger(expiresAt) || (expiresAt as number) <= nowSeconds) {
    throw new OrderValidationError("expiresAt", "future Unix timestamp required");
  }

  return Object.freeze({
    account,
    market,
    side: sideValue as OrderSide,
    price,
    quantity,
    nonce,
    expiresAt: expiresAt as number,
  });
}
