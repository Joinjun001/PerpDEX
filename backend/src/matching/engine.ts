import type { OrderSide, OrderStatus } from "../orders/order.ts";

/**
 * Deterministic, side-effect-free price/time matching of one taker against
 * previously accepted maker orders. No database reads or writes are performed.
 *
 * - Maker price determines execution price.
 * - arrivalSequence is an immutable, server-assigned sequence, NOT a wall-clock
 *   timestamp or a user-supplied nonce. Persistence is implemented in M2-T4-B.
 * - Status and filled quantity are returned as new values; inputs are never mutated.
 */
export interface BookOrder {
  orderId: string;
  market: string;
  side: OrderSide;
  price: string;
  quantity: string;
  filledQuantity: string;
  status: OrderStatus;
  expiresAt: number;
  arrivalSequence: string;
}

export interface MatchFill {
  market: string;
  makerOrderId: string;
  takerOrderId: string;
  buyOrderId: string;
  sellOrderId: string;
  price: string;
  quantity: string;
}

export interface MatchResult {
  incoming: BookOrder;
  resting: BookOrder[];
  fills: MatchFill[];
  totalFilled: string;
  remainingQuantity: string;
}

export class MatchingInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatchingInputError";
  }
}

const DECIMAL = /^(0|[1-9][0-9]*)$/;
const ORDER_ID = /^0x[0-9a-fA-F]{64}$/;
const MARKET = /^[A-Z0-9]+(?:[-_/][A-Z0-9]+)*$/;
const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_PG_SEQUENCE = (1n << 63n) - 1n;
const ACTIVE: ReadonlySet<OrderStatus> = new Set(["OPEN", "PARTIALLY_FILLED"]);

interface Parsed {
  order: BookOrder;
  price: bigint;
  quantity: bigint;
  filled: bigint;
  sequence: bigint;
}

function decimal(value: unknown, name: string, allowZero: boolean, max: bigint): bigint {
  if (typeof value !== "string" || !DECIMAL.test(value)) {
    throw new MatchingInputError(`${name} must be a canonical nonnegative integer string`);
  }
  const number = BigInt(value);
  if ((!allowZero && number === 0n) || number > max) {
    throw new MatchingInputError(`${name} out of range`);
  }
  return number;
}

function parseOrder(value: BookOrder, name: string): Parsed {
  if (!value || typeof value !== "object") {
    throw new MatchingInputError(`${name} is not an order`);
  }
  if (!ORDER_ID.test(value.orderId)) {
    throw new MatchingInputError(`${name}.orderId must be a 32-byte digest`);
  }
  if (typeof value.market !== "string" || value.market.length > 32 || !MARKET.test(value.market)) {
    throw new MatchingInputError(`${name}.market is invalid`);
  }
  if (value.side !== "BUY" && value.side !== "SELL") {
    throw new MatchingInputError(`${name}.side is invalid`);
  }
  if (!["OPEN", "PARTIALLY_FILLED", "FILLED", "CANCELED", "EXPIRED"].includes(value.status)) {
    throw new MatchingInputError(`${name}.status is invalid`);
  }
  if (!Number.isSafeInteger(value.expiresAt) || value.expiresAt <= 0) {
    throw new MatchingInputError(`${name}.expiresAt is invalid`);
  }
  const price = decimal(value.price, `${name}.price`, false, MAX_UINT256);
  const quantity = decimal(value.quantity, `${name}.quantity`, false, MAX_UINT256);
  const filled = decimal(value.filledQuantity, `${name}.filledQuantity`, true, MAX_UINT256);
  const sequence = decimal(value.arrivalSequence, `${name}.arrivalSequence`, false, MAX_PG_SEQUENCE);
  if (filled > quantity) throw new MatchingInputError(`${name}: filled exceeds quantity`);
  if (value.status === "OPEN" && filled !== 0n) {
    throw new MatchingInputError(`${name}: OPEN requires zero filled quantity`);
  }
  if (value.status === "PARTIALLY_FILLED" && (filled <= 0n || filled >= quantity)) {
    throw new MatchingInputError(`${name}: PARTIALLY_FILLED requires 0 < filled < quantity`);
  }
  if (value.status === "FILLED" && filled !== quantity) {
    throw new MatchingInputError(`${name}: FILLED requires quantity fully filled`);
  }
  return { order: value, price, quantity, filled, sequence };
}

function compareAscending(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function changed(order: BookOrder, totalFilled: bigint, quantity: bigint): BookOrder {
  let status: OrderStatus;
  if (totalFilled === quantity) status = "FILLED";
  else if (totalFilled > 0n) status = "PARTIALLY_FILLED";
  else status = "OPEN";
  return { ...order, filledQuantity: totalFilled.toString(), status };
}

function active(value: Parsed, nowSeconds: number): boolean {
  return ACTIVE.has(value.order.status) &&
    value.order.expiresAt > nowSeconds &&
    value.filled < value.quantity;
}

/**
 * Match one incoming taker order against a read-only snapshot of resting makers.
 * This function deliberately does not enforce settlement, self-trade policies,
 * persistence, cross-process locking, or market ownership: those are later tasks.
 */
export function matchIncomingOrder(
  incomingOrder: BookOrder,
  restingOrders: readonly BookOrder[],
  nowSeconds = Math.floor(Date.now() / 1000),
): MatchResult {
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) {
    throw new MatchingInputError("nowSeconds must be a nonnegative safe integer");
  }
  if (!Array.isArray(restingOrders)) {
    throw new MatchingInputError("restingOrders must be an array");
  }
  const taker = parseOrder(incomingOrder, "incoming");
  const makers = restingOrders.map((order, i) => parseOrder(order, `resting[${i}]`));
  const seenIds = new Set([taker.order.orderId.toLowerCase()]);
  const seenSeq = new Set([taker.sequence.toString()]);
  for (const maker of makers) {
    const id = maker.order.orderId.toLowerCase();
    // Scope uniqueness to the same market: other markets have separate books.
    if (maker.order.market === taker.order.market) {
      if (seenIds.has(id)) throw new MatchingInputError("duplicate orderId in market book");
      if (seenSeq.has(maker.sequence.toString())) {
        throw new MatchingInputError("duplicate arrivalSequence in market book");
      }
      seenIds.add(id);
      seenSeq.add(maker.sequence.toString());
    }
  }
  const remainingById = new Map<string, bigint>();
  let takerRemaining = taker.quantity - taker.filled;
  const fills: MatchFill[] = [];

  if (active(taker, nowSeconds)) {
    const eligible = makers.filter(maker =>
      maker.order.market === taker.order.market &&
      maker.order.side !== taker.order.side && active(maker, nowSeconds) &&
      (taker.order.side === "BUY"
        ? taker.price >= maker.price
        : taker.price <= maker.price)
    );
    eligible.sort((a, b) => {
      const bestPrice = taker.order.side === "BUY"
        ? compareAscending(a.price, b.price)
        : compareAscending(b.price, a.price);
      return bestPrice !== 0 ? bestPrice : compareAscending(a.sequence, b.sequence);
    });

    for (const maker of eligible) {
      if (takerRemaining === 0n) break;
      const makerAvailable = maker.quantity - maker.filled;
      const quantity = takerRemaining < makerAvailable ? takerRemaining : makerAvailable;
      if (quantity <= 0n) continue;
      takerRemaining -= quantity;
      remainingById.set(maker.order.orderId.toLowerCase(), maker.filled + quantity);
      fills.push({
        market: taker.order.market,
        makerOrderId: maker.order.orderId,
        takerOrderId: taker.order.orderId,
        buyOrderId: taker.order.side === "BUY" ? taker.order.orderId : maker.order.orderId,
        sellOrderId: taker.order.side === "SELL" ? taker.order.orderId : maker.order.orderId,
        price: maker.price.toString(),
        quantity: quantity.toString(),
      });
    }
  }

  const total = taker.quantity - takerRemaining;
  const incoming = total === taker.filled
    ? { ...taker.order }
    : changed(taker.order, total, taker.quantity);
  const resting = makers.map(maker => {
    const filled = remainingById.get(maker.order.orderId.toLowerCase());
    return filled === undefined
      ? { ...maker.order }
      : changed(maker.order, filled, maker.quantity);
  });
  return {
    incoming,
    resting,
    fills,
    totalFilled: (total - taker.filled).toString(),
    remainingQuantity: takerRemaining.toString(),
  };
}
