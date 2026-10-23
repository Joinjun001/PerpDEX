import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { buildOrderTypedData } from "../src/orders/signature.ts";
import { createOrderHttpHandler } from "../src/http/create-order-http.ts";
import type { OrderTransactionManager } from "../src/orders/order-transactions.ts";

const DOMAIN = {chainId:11155111, verifyingContract:"0x1111111111111111111111111111111111111111"};
const wallet = privateKeyToAccount(generatePrivateKey()); // Test-only ephemeral key
const stranger = privateKeyToAccount(generatePrivateKey());
let db:PGlite;
let server:Server;
let root:string;
let sequence=2000;

function txManager(db:PGlite):OrderTransactionManager {
  return {withTransaction:work=>db.transaction(async tx=>work({
    async query(sql,params=[]) {
      const result=await tx.query(sql,[...params]);
      return {rows:result.rows,rowCount:result.affectedRows ?? null};
    },
  }))};
}

function order(override:Record<string,unknown>={}) {
  return {
    account:wallet.address, market:"ETH-USDC", side:"BUY" as const,
    price:"150000", quantity:"250", nonce:String(sequence++),
    expiresAt:Math.floor(Date.now()/1000)+3600,
    ...override,
  };
}

async function signed(raw:ReturnType<typeof order>, signer=wallet, domain=DOMAIN) {
  return signer.signTypedData(buildOrderTypedData(raw,domain));
}

async function post(body:unknown, opts:{type?:string;path?:string}={}) {
  return fetch(root+(opts.path??"/api/orders"),{
    method:"POST",
    headers:{"content-type":opts.type??"application/json"},
    body:typeof body==="string"?body:JSON.stringify(body),
  });
}

before(async()=>{
  db=new PGlite();
  await db.waitReady;
  for(const file of ["../sql/001_order_nonces.sql","../sql/002_orders.sql"]){
    await db.exec(await readFile(fileURLToPath(new URL(file,import.meta.url)),"utf8"));
  }
  server=createServer(createOrderHttpHandler({
    trustedDomain:DOMAIN,
    transactions:txManager(db),
    readDatabase:db,
  }));
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const addr=server.address() as AddressInfo;
  root=`http://127.0.0.1:${addr.port}`;
});

after(async()=>{
  if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));
  if(db)await db.close();
});

test("POST /api/orders creates a persisted signed order and nonce atomically",async()=>{
  const input=order();
  const signature=await signed(input);
  const resp=await post({order:input,signature});
  assert.equal(resp.status,201);
  const json=await resp.json() as {orderId:string;status:string;order:{nonce:string}};
  assert.match(json.orderId,/^0x[0-9a-f]{64}$/);
  assert.equal(json.status,"OPEN");
  assert.equal(json.order.nonce,input.nonce);
  const stored=await db.query("SELECT o.status, n.status AS nonce_status FROM orders o JOIN order_nonces n USING (chain_id, verifying_contract, account, nonce) WHERE o.nonce=$1",[input.nonce]);
  assert.equal(stored.rows.length,1);
  assert.deepEqual(stored.rows[0],{status:"OPEN",nonce_status:"USED"});
  const duplicate=await post({order:input,signature});
  assert.equal(duplicate.status,200);
  const replay=await duplicate.json() as {orderId:string;status:string;replayed:boolean};
  assert.equal(replay.orderId,json.orderId);
  assert.equal(replay.status,"OPEN");
  assert.equal(replay.replayed,true);
});

test("invalid runtime fields and past expiration return 400 without reserving nonce",async()=>{
  const invalid=order({price:"-1"});
  const invalidResp=await post({order:invalid,signature:"0xdead"});
  assert.equal(invalidResp.status,400);
  const expired=order({expiresAt:Math.floor(Date.now()/1000)-1});
  const expiredResp=await post({order:expired,signature:"0xdead"});
  assert.equal(expiredResp.status,400);
  const count=await db.query("SELECT COUNT(*)::INTEGER AS n FROM order_nonces WHERE nonce = ANY ($1)",[[invalid.nonce,expired.nonce]]);
  assert.equal((count.rows[0] as {n:number}).n,0);
});

test("forged EIP-712 signature is 401 and does not consume nonce",async()=>{
  const input=order();
  const forged=await signed(input,stranger);
  const resp=await post({order:input,signature:forged});
  assert.equal(resp.status,401);
  assert.equal((await resp.json() as {error:{code:string}}).error.code,"INVALID_SIGNATURE");
  const count=await db.query("SELECT COUNT(*)::INTEGER AS n FROM order_nonces WHERE nonce=$1",[input.nonce]);
  assert.equal((count.rows[0] as {n:number}).n,0);
});

test("request provided domain is rejected and cannot override the trusted server domain",async()=>{
  const input=order();
  const wrongDomain={...DOMAIN,chainId:1};
  const badSignature=await signed(input,wallet,wrongDomain);
  const bad=await post({order:input,signature:badSignature});
  assert.equal(bad.status,401);
  const signature=await signed(input);
  assert.equal((await post({order:input,signature,domain:wrongDomain})).status,400);
  assert.equal((await post({order:{...input,domain:wrongDomain},signature})).status,400);
  const good=await post({order:input,signature});
  assert.equal(good.status,201);
});

test("malformed JSON and structurally invalid bodies return 400",async()=>{
  assert.equal((await post('{"order":')).status,400);
  assert.equal((await post([])).status,400);
  assert.equal((await post({order:{}})).status,400);
});

test("content-type mismatch, oversized body, route and method reject consistently",async()=>{
  assert.equal((await post({hello:"world"},{type:"text/plain"})).status,415);
  assert.equal((await post({padding:"x".repeat(70000)})).status,413);
  assert.equal((await post({},{path:"/api/unknown"})).status,404);
  const method=await fetch(root+"/api/orders",{method:"PUT"});
  assert.equal(method.status,405);
  assert.equal(method.headers.get("allow"),"GET, POST");
});

test("unexpected DB error is HTTP 500 without leaking SQL or credentials",async()=>{
  const handler=createOrderHttpHandler({
    trustedDomain:DOMAIN,
    transactions:{async withTransaction(){throw new Error("private DB password; SQL connection details");}},
    readDatabase: { async query() { throw new Error("private DB password; SQL connection details"); } },
  });
  const broken=createServer(handler);
  await new Promise<void>(resolve=>broken.listen(0,"127.0.0.1",resolve));
  try {
    const url=`http://127.0.0.1:${(broken.address() as AddressInfo).port}/api/orders`;
    const input=order();
    const response=await fetch(url,{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({order:input,signature:await signed(input)}),
    });
    assert.equal(response.status,500);
    const text=await response.text();
    assert.match(text,/INTERNAL_ERROR/);
    assert.doesNotMatch(text,/password|connection details|private/i);
  }finally{await new Promise<void>(resolve=>broken.close(()=>resolve()));}
});
