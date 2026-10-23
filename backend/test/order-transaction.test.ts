import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { acceptSignedOrder } from "../src/orders/accept-order.ts";
import { buildOrderTypedData } from "../src/orders/signature.ts";
import { NonceAlreadyUsedError } from "../src/orders/nonce-registry.ts";
import { PostgresOrderStore } from "../src/orders/order-store.ts";
import { postgresTransactionManager } from "../src/orders/order-transactions.ts";
import type { OrderTransactionManager } from "../src/orders/order-transactions.ts";
import type { SqlRunner } from "../src/orders/nonce-registry.ts";

const DOMAIN = {chainId:11155111,verifyingContract:"0x1111111111111111111111111111111111111111"};
const wallet = privateKeyToAccount(generatePrivateKey());
const migrations = [
  new URL("../sql/001_order_nonces.sql", import.meta.url),
  new URL("../sql/002_orders.sql", import.meta.url),
];
function order(nonce="1") {
  return {
    account: wallet.address, market:"ETH-USDC", side:"BUY" as const,
    price:"250000", quantity:"1000", nonce,
    expiresAt:Math.floor(Date.now()/1000)+3600,
  };
}
async function sign(input: ReturnType<typeof order>, domain=DOMAIN) {
  return wallet.signTypedData(buildOrderTypedData(input, domain));
}
async function database(dataDir?: string) {
  const db=new PGlite(dataDir);
  await db.waitReady;
  for(const url of migrations) {
    await db.exec(await readFile(fileURLToPath(url),"utf8"));
  }
  return db;
}
function pgliteTransactions(db:PGlite):OrderTransactionManager {
  return {withTransaction:callback=>db.transaction(async tx=>callback({
    async query(sql, values=[]) {
      const result=await tx.query(sql,[...values]);
      return {rows:result.rows,rowCount:result.affectedRows ?? null};
    }
  }))};
}
async function counts(db:PGlite) {
  const r=await db.query("SELECT (SELECT COUNT(*)::INTEGER FROM order_nonces) AS nonces, (SELECT COUNT(*)::INTEGER FROM orders) AS orders");
  return r.rows[0] as {nonces:number;orders:number};
}

test("signed order commits nonce claim and order row in one transaction", {timeout:30000}, async()=>{
  const db=await database();
  try {
    const input=order("1"); const sig=await sign(input);
    const result=await acceptSignedOrder(input,sig,DOMAIN,pgliteTransactions(db));
    assert.match(result.orderId,/^0x[0-9a-f]{64}$/);
    assert.deepEqual(await counts(db),{nonces:1,orders:1});
    const stored=new PostgresOrderStore(db);
    const row=await stored.findByNonce({account:input.account,nonce:input.nonce,domain:DOMAIN});
    assert.equal(row?.order_id,result.orderId);
    assert.equal(row?.status,"OPEN");
    assert.equal(row?.quantity,input.quantity);
    await assert.rejects(acceptSignedOrder(input,sig,DOMAIN,pgliteTransactions(db)),NonceAlreadyUsedError);
    assert.deepEqual(await counts(db),{nonces:1,orders:1});
  }finally{await db.close();}
});

test("real SQL constraint error rolls back consumed nonce, then retry works", {timeout:30000}, async()=>{
  const db=await database();
  try{
    const input=order("2"); const sig=await sign(input);
    await db.exec("ALTER TABLE orders ADD CONSTRAINT test_market_reject CHECK (market <> 'ETH-USDC')");
    await assert.rejects(acceptSignedOrder(input,sig,DOMAIN,pgliteTransactions(db)),/test_market_reject/);
    assert.deepEqual(await counts(db),{nonces:0,orders:0});
    await db.exec("ALTER TABLE orders DROP CONSTRAINT test_market_reject");
    await acceptSignedOrder(input,sig,DOMAIN,pgliteTransactions(db));
    assert.deepEqual(await counts(db),{nonces:1,orders:1});
  }finally{await db.close();}
});

test("concurrent duplicate signed requests only commit one atomic pair", {timeout:35000}, async()=>{
  const db=await database();
  try{
    const input=order("3"); const sig=await sign(input);
    const tx=pgliteTransactions(db);
    const results=await Promise.allSettled(Array.from({length:12},()=>acceptSignedOrder(input,sig,DOMAIN,tx)));
    assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
    assert.equal(results.filter(x=>x.status==="rejected" && x.reason instanceof NonceAlreadyUsedError).length,11);
    assert.deepEqual(await counts(db),{nonces:1,orders:1});
  }finally{await db.close();}
});

test("signed order and nonce survive closing and reopening persistent database", {timeout:30000}, async()=>{
  const dir=await mkdtemp(join(tmpdir(),"perpdex-atomic-"));
  let db:PGlite|undefined;
  try{
    db=await database(dir);
    const input=order("4");const sig=await sign(input);
    await acceptSignedOrder(input,sig,DOMAIN,pgliteTransactions(db));
    await db.close(); db=undefined;
    db=await database(dir);
    assert.deepEqual(await counts(db),{nonces:1,orders:1});
    await assert.rejects(acceptSignedOrder(input,sig,DOMAIN,pgliteTransactions(db)),NonceAlreadyUsedError);
  }finally{
    if(db)await db.close();
    await rm(dir,{recursive:true,force:true});
  }
});

test("domain scope allows identical canonical order ID across chains", {timeout:30000}, async()=>{
  const db=await database();
  try{
    const input=order("5");
    const a=await acceptSignedOrder(input,await sign(input,DOMAIN),DOMAIN,pgliteTransactions(db));
    const another={...DOMAIN,chainId:1};
    const b=await acceptSignedOrder(input,await sign(input,another),another,pgliteTransactions(db));
    assert.equal(a.orderId,b.orderId);
    assert.deepEqual(await counts(db),{nonces:2,orders:2});
  }finally{await db.close();}
});

test("foreign key blocks orders that have not reserved a nonce", {timeout:30000}, async()=>{
  const db=await database();
  try {
    const input=order("6"); const sig=await sign(input);
    await assert.rejects(new PostgresOrderStore(db).insert({
      order:input,orderId:"0x"+"ab".repeat(32),signature:sig,domain:DOMAIN,
    }),/foreign key constraint|orders_nonce_fk/);
    assert.deepEqual(await counts(db),{nonces:0,orders:0});
  }finally{await db.close();}
});

test("pg pool transaction adapter uses one connection and commits or rolls back, always releasing",async()=>{
  const events:string[]=[];
  let releaseCount=0;let connected=0;
  const fakeClient={
    async query(sql:string){events.push(sql);return {rows:[],rowCount:0};},
    release(){releaseCount++;}
  };
  const fakePool={async connect(){connected++;return fakeClient;}};
  const manager=postgresTransactionManager(fakePool as never);
  await manager.withTransaction(async(db:SqlRunner)=>{
    await db.query("SELECT 1");
    await db.query("SELECT 2");
  });
  assert.deepEqual(events,["BEGIN","SELECT 1","SELECT 2","COMMIT"]);
  events.length=0;
  await assert.rejects(manager.withTransaction(async(db)=>{
    await db.query("SELECT 3");
    throw Error("forced insertion failure");
  }),/forced insertion failure/);
  assert.deepEqual(events,["BEGIN","SELECT 3","ROLLBACK"]);
  assert.equal(connected,2);
  assert.equal(releaseCount,2);
});
