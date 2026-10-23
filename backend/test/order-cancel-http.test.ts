import test, {before, after} from "node:test";
import assert from "node:assert/strict";
import {createServer, type Server} from "node:http";
import type {AddressInfo} from "node:net";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {PGlite} from "@electric-sql/pglite";
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";
import {buildOrderTypedData} from "../src/orders/signature.ts";
import {buildCancelTypedData} from "../src/orders/cancel-signature.ts";
import {createOrderHttpHandler} from "../src/http/create-order-http.ts";
import type {OrderTransactionManager} from "../src/orders/order-transactions.ts";

const DOMAIN={chainId:11155111,verifyingContract:"0x1111111111111111111111111111111111111111"};
const signer=privateKeyToAccount(generatePrivateKey());
const attacker=privateKeyToAccount(generatePrivateKey());
let db:PGlite;
let server:Server;
let url:string;
let seq=8500;

function manager(database:PGlite):OrderTransactionManager {
  return {withTransaction:fn=>database.transaction(async tx=>fn({
    async query(sql,params=[]) {
      const r=await tx.query(sql,[...params]);
      return {rows:r.rows,rowCount:r.affectedRows??null};
    },
  }))};
}
async function listen(transactions=manager(db), readDatabase:PGlite=db) {
  const instance=createServer(createOrderHttpHandler({trustedDomain:DOMAIN,transactions,readDatabase}));
  await new Promise<void>(resolve=>instance.listen(0,"127.0.0.1",resolve));
  return {instance, origin:`http://127.0.0.1:${(instance.address() as AddressInfo).port}`};
}
function order(nonce=String(seq++)) {
  return {account:signer.address, nonce, market:"ETH-USDC", side:"BUY" as const,
    price:"1000",quantity:"100",expiresAt:Math.floor(Date.now()/1000)+3600};
}
function cancellation(nonce:string) {
  return {account:signer.address,nonce,deadline:Math.floor(Date.now()/1000)+1200};
}
async function orderSignature(input:ReturnType<typeof order>) {
  return signer.signTypedData(buildOrderTypedData(input,DOMAIN));
}
async function cancelSignature(input:ReturnType<typeof cancellation>,
  owner:typeof signer=signer,
  domain=DOMAIN) {
  return owner.signTypedData(buildCancelTypedData(input,domain));
}
async function post(path:string,body:unknown,origin=url,type="application/json") {
  return fetch(origin+path,{method:"POST",headers:{"content-type":type},
    body:typeof body==="string"?body:JSON.stringify(body)});
}
async function create(input:ReturnType<typeof order>) {
  const r=await post("/api/orders",{order:input,signature:await orderSignature(input)});
  assert.equal(r.status,201);
  return r.json() as Promise<{orderId:string}>;
}
async function cancel(input:ReturnType<typeof cancellation>,signature?:string) {
  return post("/api/orders/cancel",{cancel:input,signature:signature ?? await cancelSignature(input)});
}
async function row(nonce:string) {
  const r=await db.query(
    "SELECT n.status AS nonce_status, o.status AS order_status, o.filled_quantity FROM order_nonces n LEFT JOIN orders o USING(chain_id,verifying_contract,account,nonce) WHERE n.nonce=$1",
    [nonce],
  );
  return r.rows[0] as {nonce_status:string;order_status:string|null;filled_quantity:string|null}|undefined;
}

before(async()=>{
  db=new PGlite();
  await db.waitReady;
  for(const file of ["../sql/001_order_nonces.sql","../sql/002_orders.sql"]) {
    await db.exec(await readFile(fileURLToPath(new URL(file,import.meta.url)),"utf8"));
  }
  ({instance:server,origin:url}=await listen());
});
after(async()=>{
  if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));
  if(db)await db.close();
});

test("POST /api/orders/cancel verifies EIP-712 owner and updates order + nonce atomically",async()=>{
  const input=order();
  const created=await create(input);
  const req=cancellation(input.nonce);
  const response=await cancel(req);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{status:"CANCELED",orderExists:true,remainingQuantity:"100"});
  assert.deepEqual(await row(input.nonce),{nonce_status:"CANCELED",order_status:"CANCELED",filled_quantity:"0"});
  const details=await fetch(url+"/api/orders/"+created.orderId);
  assert.equal(details.status,200);
  assert.equal((await details.json() as {order:{status:string}}).order.status,"CANCELED");
  const replay=await cancel(req);
  assert.equal(replay.status,409);
  assert.equal((await replay.json() as {error:{code:string}}).error.code,"CANCEL_CONFLICT");
});

test("signed pre-cancel prevents any subsequent order acceptance",async()=>{
  const input=order();
  const req=cancellation(input.nonce);
  const r=await cancel(req);
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{status:"CANCELED",orderExists:false,remainingQuantity:null});
  const reused=await post("/api/orders",{order:input,signature:await orderSignature(input)});
  assert.equal(reused.status,409);
  assert.deepEqual(await row(input.nonce),{nonce_status:"CANCELED",order_status:null,filled_quantity:null});
});

test("invalid owner, forged signature, changed nonce and wrong signing domain return 401",async()=>{
  const input=order();
  await create(input);
  const req=cancellation(input.nonce);
  const legit=await cancelSignature(req);
  const bad=await cancelSignature(req,attacker);
  for(const [payload,signature] of [
    [req,bad],
    [{...req,account:attacker.address},legit],
    [{...req,nonce:String(seq++)},legit],
    [req,await cancelSignature(req,signer,{...DOMAIN,chainId:1})],
    [req,await cancelSignature(req,signer,{...DOMAIN,verifyingContract:"0x2222222222222222222222222222222222222222"})],
  ] as const) {
    const r=await cancel(payload,signature);
    assert.equal(r.status,401);
    assert.equal((await r.json() as {error:{code:string}}).error.code,"INVALID_CANCEL_SIGNATURE");
  }
  assert.deepEqual(await row(input.nonce),{nonce_status:"USED",order_status:"OPEN",filled_quantity:"0"});
});

test("expired cancel, invalid JSON, untrusted domain, oversized and wrong content type are rejected",async()=>{
  const input=order();
  const req=cancellation(input.nonce);
  const signature=await cancelSignature(req);
  for(const payload of [
    {cancel:{...req,deadline:Math.floor(Date.now()/1000)-1},signature},
    {cancel:{...req,nonce:"-1"},signature},
    {cancel:{...req,account:"not-an-address"},signature},
  ]) {
    const response=await post("/api/orders/cancel",payload);
    assert.equal(response.status,400);
    assert.equal((await response.json() as {error:{code:string}}).error.code,"INVALID_CANCEL");
  }
  for(const payload of [
    {cancel:req,signature,domain:{...DOMAIN,chainId:1}},
    {cancel:{...req,domain:{...DOMAIN,chainId:1}},signature},
    {cancel:[],signature},
    {cancel:req},
    '{"cancel":',
  ]) assert.equal((await post("/api/orders/cancel",payload)).status,400);
  assert.equal((await post("/api/orders/cancel",{cancel:req,signature},""+url,"text/plain")).status,415);
  assert.equal((await post("/api/orders/cancel",{padding:"x".repeat(70000)})).status,413);
  assert.equal((await post("/api/orders/cancel?foo=bar",{cancel:req,signature})).status,400);
  const method=await fetch(url+"/api/orders/cancel");
  assert.equal(method.status,405);
  assert.equal(method.headers.get("allow"),"POST");
  assert.equal(await row(input.nonce),undefined);
  // Literal `cancel` route must never be parsed as orderId.
  assert.equal((await fetch(url+"/api/orders/not-an-id")).status,400);
});

test("partial fills retain filled quantity; FILLED and EXPIRED orders reject cancel",async()=>{
  const partial=order();
  await create(partial);
  await db.query("UPDATE orders SET status='PARTIALLY_FILLED',filled_quantity='40' WHERE nonce=$1",[partial.nonce]);
  const r=await cancel(cancellation(partial.nonce));
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{status:"CANCELED",orderExists:true,remainingQuantity:"60"});
  assert.deepEqual(await row(partial.nonce),{nonce_status:"CANCELED",order_status:"CANCELED",filled_quantity:"40"});
  for(const status of ["FILLED","EXPIRED"] as const) {
    const input=order();
    await create(input);
    await db.query("UPDATE orders SET status=$1 WHERE nonce=$2",[status,input.nonce]);
    const response=await cancel(cancellation(input.nonce));
    assert.equal(response.status,409);
    assert.equal((await response.json() as {error:{code:string}}).error.code,"CANCEL_CONFLICT");
    assert.deepEqual(await row(input.nonce),{nonce_status:"USED",order_status:status,filled_quantity:"0"});
  }
});

test("simultaneous signed cancel and order creation cannot leave OPEN + CANCELED pair",async()=>{
  const input=order();
  const req=cancellation(input.nonce);
  const [acceptance,canceled]=await Promise.all([
    post("/api/orders",{order:input,signature:await orderSignature(input)}),
    cancel(req),
  ]);
  assert.ok([201,409].includes(acceptance.status));
  assert.equal(canceled.status,200);
  const r=await row(input.nonce);
  assert.equal(r?.nonce_status,"CANCELED");
  assert.ok(r?.order_status===null || r?.order_status==="CANCELED");
  const again=await post("/api/orders",{order:input,signature:await orderSignature(input)});
  assert.equal(again.status,409);
});

test("database update failure rolls back cancel to preserve original active order",async()=>{
  const input=order();
  await create(input);
  const req=cancellation(input.nonce);
  const signature=await cancelSignature(req);
  // Target only this order; earlier tests legitimately contain CANCELED orders.
  await db.exec(`ALTER TABLE orders ADD CONSTRAINT deny_cancel_http_test CHECK (status <> 'CANCELED' OR nonce <> '${input.nonce}')`);
  try {
    const failure=await cancel(req,signature);
    assert.equal(failure.status,500);
    const text=await failure.text();
    assert.match(text,/INTERNAL_ERROR/);
    assert.doesNotMatch(text,/deny_cancel_http_test|CHECK|SQL|password/i);
    assert.deepEqual(await row(input.nonce),{nonce_status:"USED",order_status:"OPEN",filled_quantity:"0"});
  }finally {
    await db.exec("ALTER TABLE orders DROP CONSTRAINT deny_cancel_http_test");
  }
  assert.equal((await cancel(req,signature)).status,200);
  assert.deepEqual(await row(input.nonce),{nonce_status:"CANCELED",order_status:"CANCELED",filled_quantity:"0"});
});

test("unknown database error returns 500 without leaking details",async()=>{
  const bad=await listen({async withTransaction(){throw Error("secret SQL database password");}});
  try{
    const req=cancellation(String(seq++));
    const response=await post("/api/orders/cancel",{cancel:req,signature:await cancelSignature(req)},bad.origin);
    assert.equal(response.status,500);
    assert.equal((await response.json() as {error:{code:string}}).error.code,"INTERNAL_ERROR");
  }finally{await new Promise<void>(resolve=>bad.instance.close(()=>resolve()));}
});
