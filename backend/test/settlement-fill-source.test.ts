import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { buildOrderTypedData } from "../src/orders/signature.ts";
import type { CreateOrderInput } from "../src/orders/order.ts";
import type { OrderTransactionManager } from "../src/orders/order-transactions.ts";
import { acceptAndMatchSignedOrder } from "../src/matching/accept-and-match.ts";
import { listSettlementSourceFills, settlementTradeId, SettlementSourceError } from "../src/settlement/fill-source.ts";

const DOMAIN = { chainId: 11155111, verifyingContract: "0x1111111111111111111111111111111111111111" };
const OTHER_CHAIN = { ...DOMAIN, chainId: 1 };
const OTHER_CONTRACT = { ...DOMAIN, verifyingContract: "0x2222222222222222222222222222222222222222" };
const BUYER = privateKeyToAccount(generatePrivateKey());
const SELLER = privateKeyToAccount(generatePrivateKey());
const ALT = privateKeyToAccount(generatePrivateKey());
let db: PGlite;
let nextNonce = 71000;

function transactions(instance: PGlite): OrderTransactionManager {
  return { withTransaction: fn => instance.transaction(async tx => fn({
    async query(sql, values = []) {
      const result = await tx.query(sql, [...values]);
      return { rows: result.rows, rowCount: result.affectedRows ?? null };
    },
  })) };
}

function order(
  wallet: typeof BUYER, market: string, side: "BUY" | "SELL", price: string, quantity: string,
): CreateOrderInput {
  return {
    account: wallet.address, nonce: String(nextNonce++), market, side, price, quantity,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
}

async function place(
  wallet: typeof BUYER, market: string, side: "BUY" | "SELL", price = "100", quantity = "10",
  domain = DOMAIN,
) {
  const intent = order(wallet, market, side, price, quantity);
  const signature = await wallet.signTypedData(buildOrderTypedData(intent, domain));
  return acceptAndMatchSignedOrder(intent, signature, domain, transactions(db));
}

before(async () => {
  db = new PGlite();
  await db.waitReady;
  for (const file of ["001_order_nonces", "002_orders", "003_order_cancel_receipts", "004_order_book"]) {
    await db.exec(await readFile(fileURLToPath(new URL(`../sql/${file}.sql`, import.meta.url)), "utf8"));
  }
});
after(async () => { if (db) await db.close(); });

test("committed maker SELL fills export stable, domain-bound tradeId and correct participants", async () => {
  const maker = await place(SELLER, "SETTLE1-USDC", "SELL", "90", "8");
  const taker = await place(BUYER, "SETTLE1-USDC", "BUY", "100", "3");
  assert.equal(taker.matching.totalFilled, "3");
  const rows = await listSettlementSourceFills(db, DOMAIN);
  assert.equal(rows.length, 1);
  const fill = rows[0];
  assert.equal(fill.market, "SETTLE1-USDC");
  assert.equal(fill.makerOrderId, maker.orderId);
  assert.equal(fill.takerOrderId, taker.orderId);
  assert.equal(fill.buyOrderId, taker.orderId);
  assert.equal(fill.sellOrderId, maker.orderId);
  assert.equal(fill.buyer, BUYER.address.toLowerCase());
  assert.equal(fill.seller, SELLER.address.toLowerCase());
  assert.equal(fill.price, "90");
  assert.equal(fill.quantity, "3");
  assert.equal(fill.tradeId, settlementTradeId(DOMAIN, fill.fillId));
  assert.match(fill.tradeId, /^0x[0-9a-f]{64}$/);
  assert.deepEqual(await listSettlementSourceFills(db, DOMAIN), rows);
  assert.equal("token" in fill, false);
  assert.equal("amount" in fill, false);
});

test("maker BUY price, different market, and exclusive cursor pagination", async () => {
  const maker = await place(BUYER, "SETTLE2-USDC", "BUY", "110", "4");
  const taker = await place(SELLER, "SETTLE2-USDC", "SELL", "100", "2");
  const other = await place(ALT, "SETTLE3-USDC", "SELL", "20", "8");
  const third = await place(BUYER, "SETTLE3-USDC", "BUY", "25", "5");
  assert.equal(third.matching.totalFilled, "5");
  const all = await listSettlementSourceFills(db, DOMAIN);
  const makerBuy = all.find(row => row.takerOrderId === taker.orderId);
  assert.ok(makerBuy);
  assert.equal(makerBuy.makerOrderId, maker.orderId);
  assert.equal(makerBuy.buyOrderId, maker.orderId);
  assert.equal(makerBuy.sellOrderId, taker.orderId);
  assert.equal(makerBuy.buyer, BUYER.address.toLowerCase());
  assert.equal(makerBuy.seller, SELLER.address.toLowerCase());
  assert.equal(makerBuy.price, "110");
  assert.equal(all.find(row => row.takerOrderId === third.orderId)?.sellOrderId, other.orderId);
  const collected: typeof all = [];
  let cursor = "0";
  while (true) {
    const page = await listSettlementSourceFills(db, DOMAIN, { afterFillId: cursor, limit: 1 });
    if (page.length === 0) break;
    collected.push(...page);
    cursor = page[0].fillId;
  }
  assert.deepEqual(collected, all);
  assert.equal(new Set(collected.map(row => row.tradeId)).size, collected.length);
});

test("two different signing domains do not leak ledger rows and cannot collide by tradeId", async () => {
  const sameDomainMaker = await place(ALT, "SCOPED-USDC", "SELL", "30", "8", OTHER_CHAIN);
  await place(BUYER, "SCOPED-USDC", "BUY", "31", "3", OTHER_CHAIN);
  await place(ALT, "SCOPED-USDC", "SELL", "32", "8", OTHER_CONTRACT);
  await place(SELLER, "SCOPED-USDC", "BUY", "35", "2", OTHER_CONTRACT);
  const chainRows = await listSettlementSourceFills(db, OTHER_CHAIN);
  const contractRows = await listSettlementSourceFills(db, OTHER_CONTRACT);
  const mainRows = await listSettlementSourceFills(db, DOMAIN);
  assert.equal(chainRows.length, 1);
  assert.equal(contractRows.length, 1);
  assert.equal(chainRows[0].makerOrderId, sameDomainMaker.orderId);
  assert.equal(chainRows[0].chainId, 1);
  assert.equal(contractRows[0].verifyingContract, OTHER_CONTRACT.verifyingContract);
  assert.ok(mainRows.every(row => row.market !== "SCOPED-USDC"));
  assert.notEqual(chainRows[0].tradeId, contractRows[0].tradeId);
  assert.notEqual(settlementTradeId(DOMAIN, "1"), settlementTradeId(OTHER_CHAIN, "1"));
  assert.notEqual(settlementTradeId(DOMAIN, "1"), settlementTradeId(OTHER_CONTRACT, "1"));
});

test("uint256-sized amounts remain exact without Number conversion or inferred collateral transfer", async () => {
  const hugeQty = (1n << 190n).toString();
  const hugePrice = (1n << 210n).toString();
  await place(ALT, "BIGSETTLE-USDC", "SELL", hugePrice, hugeQty);
  await place(BUYER, "BIGSETTLE-USDC", "BUY", (1n << 211n).toString(), hugeQty);
  const row = (await listSettlementSourceFills(db, DOMAIN)).find(x => x.market === "BIGSETTLE-USDC");
  assert.equal(row?.quantity, hugeQty);
  assert.equal(row?.price, hugePrice);
});

test("invalid cursor, batching, and fill identifiers reject before executing SQL", async () => {
  const cases = [
    { afterFillId: "01" }, { afterFillId: "-1" },
    { afterFillId: (1n << 63n).toString() },
    { limit: 0 }, { limit: 101 }, { limit: 1.1 },
  ];
  for (const opts of cases) {
    await assert.rejects(listSettlementSourceFills(db, DOMAIN, opts), SettlementSourceError);
  }
  assert.throws(() => settlementTradeId(DOMAIN, "0"), SettlementSourceError);
  assert.throws(() => settlementTradeId(DOMAIN, "invalid"), SettlementSourceError);
});

test("tampered maker price, sides, and overfilled source record fail closed", async () => {
  const maker = await place(ALT, "MALFORMED-USDC", "SELL", "50", "5");
  const taker = await place(BUYER, "MALFORMED-USDC", "BUY", "60", "5");
  const fillId = (await listSettlementSourceFills(db, DOMAIN)).find(x => x.takerOrderId === taker.orderId)!.fillId;
  async function update(sql: string, modified: unknown, original: unknown) {
    await db.query(sql, [modified, fillId]);
    try { await assert.rejects(listSettlementSourceFills(db, DOMAIN), SettlementSourceError); }
    finally { await db.query(sql, [original, fillId]); }
  }
  await update("UPDATE order_fills SET price=$1 WHERE fill_id=$2", "55", "50");
  await update("UPDATE order_fills SET quantity=$1 WHERE fill_id=$2", "6", "5");
  await update("UPDATE order_fills SET buy_order_id=$1 WHERE fill_id=$2", maker.orderId, taker.orderId);
  await update("UPDATE order_fills SET buy_order_id=$1 WHERE fill_id=$2", "0x" + "f".repeat(64), taker.orderId);
  assert.ok((await listSettlementSourceFills(db, DOMAIN)).some(row => row.fillId === fillId));
});
