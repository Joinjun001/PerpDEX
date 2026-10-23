import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { acceptSignedOrder } from "../src/orders/accept-order.ts";
import { cancelSignedOrder, OrderCancellationConflictError } from "../src/orders/cancel-order.ts";
import { buildCancelTypedData, CancelValidationError, InvalidCancelSignatureError } from "../src/orders/cancel-signature.ts";
import { buildOrderTypedData } from "../src/orders/signature.ts";
import { NonceAlreadyUsedError } from "../src/orders/nonce-registry.ts";
import type { OrderTransactionManager } from "../src/orders/order-transactions.ts";

const DOMAIN = { chainId:11155111, verifyingContract:"0x1111111111111111111111111111111111111111" };
const wallet = privateKeyToAccount(generatePrivateKey());
const attacker = privateKeyToAccount(generatePrivateKey());
const migrationUrls = [ "../sql/001_order_nonces.sql", "../sql/002_orders.sql" ];

function anOrder(nonce: string, account: string = wallet.address) {
  return { account, nonce, market:"ETH-USDC", side:"BUY" as const, price:"10000",
    quantity:"100", expiresAt:Math.floor(Date.now()/1000)+3600 };
}
function cancel(nonce: string, account: string = wallet.address) {
  return { account, nonce, deadline:Math.floor(Date.now()/1000)+1200 };
}
async function dbFixture() {
  const db=new PGlite();
  await db.waitReady;
  for(const path of migrationUrls) {
    await db.exec(await readFile(fileURLToPath(new URL(path, import.meta.url)), "utf8"));
  }
  return db;
}
function manager(db:PGlite):OrderTransactionManager {
  return { withTransaction: (work) => db.transaction(async (tx) => work({
    async query(sql, params=[]) {
      const result = await tx.query(sql,[...params]);
      return {rows:result.rows,rowCount:result.affectedRows ?? null};
    },
  })) };
}
async function signOrder(raw:ReturnType<typeof anOrder>, domain=DOMAIN) {
  return wallet.signTypedData(buildOrderTypedData(raw,domain));
}
async function signCancel(raw:ReturnType<typeof cancel>, domain=DOMAIN) {
  return wallet.signTypedData(buildCancelTypedData(raw,domain));
}
async function current(db:PGlite) {
  const r=await db.query("SELECT (SELECT status FROM order_nonces LIMIT 1) AS nonce_status, (SELECT status FROM orders LIMIT 1) AS order_status, (SELECT filled_quantity FROM orders LIMIT 1) AS filled_quantity");
  return r.rows[0] as {nonce_status:string|null; order_status:string|null;filled_quantity:string|null};
}

test("signed cancel before acceptance reserves tombstone and rejects order replay", {timeout:20000}, async()=>{
  const db=await dbFixture();
  try {
    const req=cancel("210");const tx=manager(db);
    assert.deepEqual(await cancelSignedOrder(req,await signCancel(req),DOMAIN,tx),
      {status:"CANCELED",orderExists:false,remainingQuantity:null});
    assert.deepEqual(await current(db),{nonce_status:"CANCELED",order_status:null,filled_quantity:null});
    await assert.rejects(cancelSignedOrder(req,await signCancel(req),DOMAIN,tx),OrderCancellationConflictError);
    const input=anOrder(req.nonce);
    await assert.rejects(acceptSignedOrder(input,await signOrder(input),DOMAIN,tx),NonceAlreadyUsedError);
  } finally { await db.close(); }
});

test("valid owner cancel atomically changes OPEN order and nonce; duplicate forbidden", {timeout:20000}, async()=>{
  const db=await dbFixture();
  try{
    const nonce="211";const tx=manager(db);const input=anOrder(nonce); const req=cancel(nonce);
    await acceptSignedOrder(input,await signOrder(input),DOMAIN,tx);
    assert.deepEqual(await cancelSignedOrder(req,await signCancel(req),DOMAIN,tx),
      {status:"CANCELED",orderExists:true,remainingQuantity:"100"});
    assert.deepEqual(await current(db),{nonce_status:"CANCELED",order_status:"CANCELED",filled_quantity:"0"});
    await assert.rejects(cancelSignedOrder(req,await signCancel(req),DOMAIN,tx),OrderCancellationConflictError);
    await assert.rejects(acceptSignedOrder(input,await signOrder(input),DOMAIN,tx),NonceAlreadyUsedError);
  }finally{await db.close();}
});

test("PARTIALLY_FILLED cancel preserves executed quantity and cancels remaining only", {timeout:20000}, async()=>{
  const db=await dbFixture();
  try{
    const nonce="212"; const tx=manager(db);const input=anOrder(nonce); const req=cancel(nonce);
    await acceptSignedOrder(input,await signOrder(input),DOMAIN,tx);
    await db.query("UPDATE orders SET status='PARTIALLY_FILLED', filled_quantity='40'");
    const actual=await cancelSignedOrder(req,await signCancel(req),DOMAIN,tx);
    assert.deepEqual(actual,{status:"CANCELED",orderExists:true,remainingQuantity:"60"});
    assert.deepEqual(await current(db),{nonce_status:"CANCELED",order_status:"CANCELED",filled_quantity:"40"});
  }finally{await db.close();}
});

test("forged signer, wrong chain/contract, altered nonce, and invalid signature cannot cancel", {timeout:20000}, async()=>{
  const db=await dbFixture();
  try{
    const nonce="213"; const tx=manager(db);const input=anOrder(nonce);const req=cancel(nonce);
    await acceptSignedOrder(input,await signOrder(input),DOMAIN,tx);
    const signed=await signCancel(req);
    const badSigner=await attacker.signTypedData(buildCancelTypedData(req,DOMAIN));
    await assert.rejects(cancelSignedOrder(req,badSigner,DOMAIN,tx),InvalidCancelSignatureError);
    await assert.rejects(cancelSignedOrder({...req,account:attacker.address},signed,DOMAIN,tx),InvalidCancelSignatureError);
    await assert.rejects(cancelSignedOrder({...req,nonce:"214"},signed,DOMAIN,tx),InvalidCancelSignatureError);
    await assert.rejects(cancelSignedOrder(req,signed,{...DOMAIN,chainId:1},tx),InvalidCancelSignatureError);
    await assert.rejects(cancelSignedOrder(req,signed,{...DOMAIN,verifyingContract:"0x2222222222222222222222222222222222222222"},tx),InvalidCancelSignatureError);
    await assert.rejects(cancelSignedOrder(req,"0xdead",DOMAIN,tx),InvalidCancelSignatureError);
    await assert.rejects(cancelSignedOrder({...req,deadline:Math.floor(Date.now()/1000)-1},signed,DOMAIN,tx),CancelValidationError);
    assert.deepEqual(await current(db),{nonce_status:"USED",order_status:"OPEN",filled_quantity:"0"});
  }finally{await db.close();}
});

test("FILLED and EXPIRED orders reject cancels without mutating nonce tombstones", {timeout:30000}, async()=>{
  for(const status of ["FILLED","EXPIRED"] as const){
    const db=await dbFixture();
    try{
      const input=anOrder(status==="FILLED"?"215":"216");const req=cancel(input.nonce);const tx=manager(db);
      await acceptSignedOrder(input,await signOrder(input),DOMAIN,tx);
      await db.query("UPDATE orders SET status=$1",[status]);
      await assert.rejects(cancelSignedOrder(req,await signCancel(req),DOMAIN,tx),OrderCancellationConflictError);
      assert.deepEqual(await current(db),{nonce_status:"USED",order_status:status,filled_quantity:"0"});
    }finally{await db.close();}
  }
});

test("failed order-state UPDATE rolls back nonce and leaves active order retryable", {timeout:20000}, async()=>{
  const db=await dbFixture();
  try{
    const input=anOrder("217"); const req=cancel(input.nonce);const tx=manager(db);
    await acceptSignedOrder(input,await signOrder(input),DOMAIN,tx);
    const signature=await signCancel(req);
    await db.exec("ALTER TABLE orders ADD CONSTRAINT deny_cancel_test CHECK (status <> 'CANCELED')");
    await assert.rejects(cancelSignedOrder(req,signature,DOMAIN,tx),/deny_cancel_test/);
    assert.deepEqual(await current(db),{nonce_status:"USED",order_status:"OPEN",filled_quantity:"0"});
    await db.exec("ALTER TABLE orders DROP CONSTRAINT deny_cancel_test");
    await cancelSignedOrder(req,signature,DOMAIN,tx);
    assert.deepEqual(await current(db),{nonce_status:"CANCELED",order_status:"CANCELED",filled_quantity:"0"});
  }finally{await db.close();}
});

test("concurrent acceptance and cancellation never leave an OPEN order with CANCELED nonce", {timeout:25000}, async()=>{
  const db=await dbFixture();
  try{
    const input=anOrder("218"); const req=cancel(input.nonce);const tx=manager(db);
    const orderSig=await signOrder(input);const cancelSig=await signCancel(req);
    const results=await Promise.allSettled([
      acceptSignedOrder(input,orderSig,DOMAIN,tx),
      cancelSignedOrder(req,cancelSig,DOMAIN,tx),
    ]);
    const state=await current(db);
    assert.equal(state.nonce_status,"CANCELED");
    assert.ok(state.order_status===null||state.order_status==="CANCELED");
    assert.ok(results.some(r=>r.status==="fulfilled"));
    await assert.rejects(acceptSignedOrder(input,orderSig,DOMAIN,tx),NonceAlreadyUsedError);
  }finally{await db.close();}
});
