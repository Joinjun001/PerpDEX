import { encodeAbiParameters, keccak256 } from "viem";
import type { SqlRunner } from "../orders/nonce-registry.ts";
import { validateOrderSigningDomain } from "../orders/signature.ts";
import type { OrderSigningDomainInput } from "../orders/signature.ts";

/** A read-only, policy-neutral input for M2-T5. NOT a token transfer instruction. */
export interface SettlementSourceFill {
  chainId: number;
  verifyingContract: string;
  market: string;
  fillId: string;
  tradeId: `0x${string}`;
  makerOrderId: string;
  takerOrderId: string;
  buyOrderId: string;
  sellOrderId: string;
  buyer: string;
  seller: string;
  price: string;
  quantity: string;
}

export class SettlementSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementSourceError";
  }
}

const DECIMAL = /^(0|[1-9][0-9]*)$/;
const ORDER_ID = /^0x[0-9a-f]{64}$/;
const ACCOUNT = /^0x[0-9a-f]{40}$/;
const MARKET = /^[A-Z0-9]+(?:[-_/][A-Z0-9]+)*$/;
const MAX_UINT = (1n << 256n) - 1n;
const MAX_FILL_ID = (1n << 63n) - 1n;
const ZERO_ACCOUNT = "0x0000000000000000000000000000000000000000";

type DbFill = Record<string, unknown>;

function positiveUint(value: unknown, field: string, max = MAX_UINT, allowZero = false): bigint {
  if (typeof value !== "string" || !DECIMAL.test(value)) {
    throw new SettlementSourceError(`${field}: canonical decimal integer required`);
  }
  const number = BigInt(value);
  if ((!allowZero && number === 0n) || number > max) {
    throw new SettlementSourceError(`${field}: out of range`);
  }
  return number;
}

function orderId(value: unknown, field: string): string {
  if (typeof value !== "string" || !ORDER_ID.test(value)) {
    throw new SettlementSourceError(`${field}: invalid order identifier`);
  }
  return value;
}

function account(value: unknown, field: string): string {
  if (typeof value !== "string" || !ACCOUNT.test(value) || value === ZERO_ACCOUNT) {
    throw new SettlementSourceError(`${field}: invalid account`);
  }
  return value;
}

/** Unique per signing domain and persisted fill row, independent of retries and workers. */
export function settlementTradeId(domainInput: OrderSigningDomainInput, fillId: string): `0x${string}` {
  const domain = validateOrderSigningDomain(domainInput);
  const id = positiveUint(fillId, "fillId", MAX_FILL_ID);
  return keccak256(encodeAbiParameters(
    [{ type: "uint256" }, { type: "address" }, { type: "uint256" }],
    [BigInt(domain.chainId), domain.verifyingContract, id],
  ));
}

function checkedFill(row: DbFill, domainInput: OrderSigningDomainInput): SettlementSourceFill {
  const domain = validateOrderSigningDomain(domainInput);
  const chainId = positiveUint(row.chain_id, "chainId");
  if (chainId !== BigInt(domain.chainId) || row.verifying_contract !== domain.verifyingContract.toLowerCase()) {
    throw new SettlementSourceError("signing domain mismatch");
  }
  if (typeof row.market !== "string" || row.market.length > 32 || !MARKET.test(row.market)) {
    throw new SettlementSourceError("invalid market");
  }
  const fillId = positiveUint(row.fill_id, "fillId", MAX_FILL_ID).toString();
  const makerOrderId = orderId(row.maker_order_id, "makerOrderId");
  const takerOrderId = orderId(row.taker_order_id, "takerOrderId");
  const buyOrderId = orderId(row.buy_order_id, "buyOrderId");
  const sellOrderId = orderId(row.sell_order_id, "sellOrderId");
  const buyer = account(row.buyer, "buyer");
  const seller = account(row.seller, "seller");
  if (buyer === seller || buyOrderId === sellOrderId || makerOrderId === takerOrderId ||
      ![buyOrderId, sellOrderId].includes(makerOrderId) ||
      ![buyOrderId, sellOrderId].includes(takerOrderId) ||
      makerOrderId === takerOrderId || row.buy_side !== "BUY" || row.sell_side !== "SELL") {
    throw new SettlementSourceError("invalid fill participants or sides");
  }
  const price = positiveUint(row.price, "price");
  const quantity = positiveUint(row.quantity, "quantity");
  const buyLimit = positiveUint(row.buy_limit, "buyLimit");
  const sellLimit = positiveUint(row.sell_limit, "sellLimit");
  const makerPrice = makerOrderId === buyOrderId ? buyLimit : sellLimit;
  if (price !== makerPrice || buyLimit < price || price < sellLimit) {
    throw new SettlementSourceError("fill price violates signed order limits or maker price");
  }
  const buyQuantity = positiveUint(row.buy_quantity, "buyQuantity");
  const sellQuantity = positiveUint(row.sell_quantity, "sellQuantity");
  if (quantity > buyQuantity || quantity > sellQuantity) {
    throw new SettlementSourceError("fill quantity exceeds signed order size");
  }
  return {
    chainId: domain.chainId, verifyingContract: domain.verifyingContract.toLowerCase(),
    market: row.market, fillId, tradeId: settlementTradeId(domain, fillId),
    makerOrderId, takerOrderId, buyOrderId, sellOrderId,
    buyer, seller, price: price.toString(), quantity: quantity.toString(),
  };
}

/**
 * Returns committed fills from the immutable ledger, scoped to a TRUSTED domain.
 * Cursor is exclusive; the caller must persist its own processed/confirmed cursor.
 * No token choice, decimals, margin, funds transfer, RPC or chain write occurs here.
 */
export async function listSettlementSourceFills(
  db: SqlRunner,
  trustedDomain: OrderSigningDomainInput,
  input: { afterFillId?: string; limit?: number } = {},
): Promise<SettlementSourceFill[]> {
  const domain = validateOrderSigningDomain(trustedDomain);
  const afterFillId = positiveUint(input.afterFillId ?? "0", "afterFillId", MAX_FILL_ID, true).toString();
  const limit = input.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new SettlementSourceError("limit must be an integer 1..100");
  }
  const result = await db.query(
    `SELECT f.fill_id::TEXT AS fill_id, f.chain_id::TEXT AS chain_id,
            f.verifying_contract, f.market, f.maker_order_id, f.taker_order_id,
            f.buy_order_id, f.sell_order_id, f.price, f.quantity,
            buy_book.account AS buyer, sell_book.account AS seller,
            buy_order.side AS buy_side, sell_order.side AS sell_side,
            buy_order.price AS buy_limit, sell_order.price AS sell_limit,
            buy_order.quantity AS buy_quantity, sell_order.quantity AS sell_quantity
       FROM order_fills f
       LEFT JOIN order_book_entries buy_book
         ON buy_book.chain_id=f.chain_id AND buy_book.verifying_contract=f.verifying_contract
        AND buy_book.market=f.market AND buy_book.order_id=f.buy_order_id
       LEFT JOIN order_book_entries sell_book
         ON sell_book.chain_id=f.chain_id AND sell_book.verifying_contract=f.verifying_contract
        AND sell_book.market=f.market AND sell_book.order_id=f.sell_order_id
       LEFT JOIN orders buy_order
         ON buy_order.chain_id=buy_book.chain_id AND buy_order.verifying_contract=buy_book.verifying_contract
        AND buy_order.account=buy_book.account AND buy_order.nonce=buy_book.nonce
       LEFT JOIN orders sell_order
         ON sell_order.chain_id=sell_book.chain_id AND sell_order.verifying_contract=sell_book.verifying_contract
        AND sell_order.account=sell_book.account AND sell_order.nonce=sell_book.nonce
      WHERE f.chain_id=$1 AND f.verifying_contract=$2 AND f.fill_id>$3
      ORDER BY f.fill_id ASC LIMIT $4`,
    [domain.chainId, domain.verifyingContract.toLowerCase(), afterFillId, limit],
  );
  const fills = result.rows.map(row => checkedFill(row as DbFill, domain));
  for (let index = 1; index < fills.length; index++) {
    if (BigInt(fills[index - 1].fillId) >= BigInt(fills[index].fillId)) {
      throw new SettlementSourceError("fill rows are not strictly ordered");
    }
  }
  return fills;
}
