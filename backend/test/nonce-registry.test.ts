import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { buildOrderTypedData } from "../src/orders/signature.ts";
import { authenticateAndConsumeOrder, InvalidOrderSignatureError } from "../src/orders/order-auth.ts";
import { PostgresNonceRegistry, NonceAlreadyUsedError } from "../src/orders/nonce-registry.ts";
import type { OrderInput } from "../src/orders/order.ts";

const DOMAIN = { chainId: 11155111, verifyingContract: "0x1111111111111111111111111111111111111111" };
const MIGRATION = fileURLToPath(new URL("../sql/001_order_nonces.sql", import.meta.url));
const signer = privateKeyToAccount(generatePrivateKey());

function order(override: Record<string, unknown> = {}) {
  return {
    account: signer.address,
    market: "ETH-USDC",
    side: "BUY" as const,
    price: "1000",
    quantity: "10",
    nonce: "1",
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    ...override,
  } as OrderInput;
}

async function database(dataDir?: string) {
  const db = new PGlite(dataDir);
  await db.waitReady;
  await db.exec(await readFile(MIGRATION, "utf8"));
  return db;
}

async function signed(input: OrderInput) {
  return signer.signTypedData(buildOrderTypedData(input, DOMAIN));
}

test("PostgreSQL enforces unique scoped nonces and replay survives a database reopen", {timeout:25000}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "perpdex-nonce-"));
  let db: PGlite | undefined;
  try {
    db = await database(directory);
    let registry = new PostgresNonceRegistry(db);
    const input = order();
    const signature = await signed(input);
    const first = await authenticateAndConsumeOrder(input, DOMAIN, signature, registry);
    assert.match(first.orderId, /^0x[0-9a-f]{64}$/);
    assert.equal(await registry.status(input, DOMAIN), "USED");
    await assert.rejects(authenticateAndConsumeOrder(input, DOMAIN, signature, registry), NonceAlreadyUsedError);
    await db.close();
    db = await database(directory);
    registry = new PostgresNonceRegistry(db);
    assert.equal(await registry.status(input, DOMAIN), "USED");
    await assert.rejects(authenticateAndConsumeOrder(input, DOMAIN, signature, registry), NonceAlreadyUsedError);
  } finally {
    if (db) await db.close();
    await rm(directory, {recursive:true,force:true});
  }
});

test("concurrent attempts cannot claim the same nonce more than once", {timeout:20000}, async () => {
  const db = await database();
  try {
    const registry = new PostgresNonceRegistry(db);
    const input = order({nonce:"100"});
    const signature = await signed(input);
    const results = await Promise.allSettled(
      Array.from({length: 12}, () => authenticateAndConsumeOrder(input, DOMAIN, signature, registry))
    );
    assert.equal(results.filter(x => x.status === "fulfilled").length, 1);
    assert.equal(results.filter(x => x.status === "rejected" && x.reason instanceof NonceAlreadyUsedError).length, 11);
  } finally {await db.close();}
});

test("nonce scopes partition by chain, verifyingContract, account and nonce", {timeout:20000}, async () => {
  const db = await database();
  try {
    const registry = new PostgresNonceRegistry(db);
    const original = order({nonce:"2"});
    const alt = privateKeyToAccount(generatePrivateKey());
    const distinct = [
      [original, DOMAIN],
      [original, {...DOMAIN,chainId:1}],
      [original, {...DOMAIN,verifyingContract:"0x2222222222222222222222222222222222222222"}],
      [{...original,account:alt.address}, DOMAIN],
      [{...original, nonce:"3"}, DOMAIN],
    ] as const;
    for (const [item, domain] of distinct) {
      const account = item.account.toLowerCase() === alt.address.toLowerCase() ? alt : signer;
      const sig = await account.signTypedData(buildOrderTypedData(item, domain));
      await authenticateAndConsumeOrder(item, domain, sig, registry);
    }
    const count = await db.query("SELECT COUNT(*)::INTEGER AS total FROM order_nonces");
    assert.equal((count.rows[0] as {total:number}).total, 5);
  } finally {await db.close();}
});

test("invalid signature must not consume a nonce", {timeout:20000}, async () => {
  const db = await database();
  try {
    const registry = new PostgresNonceRegistry(db);
    const input = order({nonce:"4"});
    const outsider = privateKeyToAccount(generatePrivateKey());
    const bad = await outsider.signTypedData(buildOrderTypedData(input, DOMAIN));
    await assert.rejects(authenticateAndConsumeOrder(input, DOMAIN, bad, registry), InvalidOrderSignatureError);
    assert.equal(await registry.status(input, DOMAIN), null);
    await authenticateAndConsumeOrder(input, DOMAIN, await signed(input), registry);
    assert.equal(await registry.status(input, DOMAIN), "USED");
  } finally {await db.close();}
});

test("canceled nonce is reserved forever; cancellation after use also preserves tombstone", {timeout:20000}, async () => {
  const db = await database();
  try {
    const registry = new PostgresNonceRegistry(db);
    const before = order({nonce:"5"});
    assert.equal(await registry.cancel(before, DOMAIN), true);
    assert.equal(await registry.status(before, DOMAIN), "CANCELED");
    assert.equal(await registry.cancel(before, DOMAIN), false);
    await assert.rejects(authenticateAndConsumeOrder(before, DOMAIN, await signed(before), registry), NonceAlreadyUsedError);
    const after = order({nonce:"6"});
    await authenticateAndConsumeOrder(after, DOMAIN, await signed(after), registry);
    assert.equal(await registry.cancel(after, DOMAIN), true);
    assert.equal(await registry.status(after, DOMAIN), "CANCELED");
    await assert.rejects(authenticateAndConsumeOrder(after, DOMAIN, await signed(after), registry), NonceAlreadyUsedError);
  } finally {await db.close();}
});

test("expiry only after actual expiration and does not release used nonces", {timeout:20000}, async () => {
  const db = await database();
  try {
    const registry = new PostgresNonceRegistry(db);
    const input = order({nonce:"7"});
    await authenticateAndConsumeOrder(input, DOMAIN, await signed(input), registry);
    assert.equal(await registry.expire(input, DOMAIN, input.expiresAt - 1), false);
    assert.equal(await registry.expire(input, DOMAIN, input.expiresAt), true);
    assert.equal(await registry.status(input, DOMAIN), "EXPIRED");
    assert.equal(await registry.expire(input, DOMAIN, input.expiresAt + 1), false);
    await assert.rejects(authenticateAndConsumeOrder(input, DOMAIN, await signed(input), registry), NonceAlreadyUsedError);
  } finally {await db.close();}
});
