import test, {before, after} from "node:test";
import assert from "node:assert/strict";
import {createServer, type Server} from "node:http";
import type {AddressInfo} from "node:net";
import {readFile, mkdtemp, rm} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {PGlite} from "@electric-sql/pglite";
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";
import {buildOrderTypedData} from "../src/orders/signature.ts";
import {buildCancelTypedData} from "../src/orders/cancel-signature.ts";
import {createDeterministicOrderId} from "../src/orders/order.ts";
import {createOrderHttpHandler} from "../src/http/create-order-http.ts";
import type {OrderTransactionManager} from "../src/orders/order-transactions.ts";

const DOMAIN = {chainId:11155111,verifyingContract:"0x1111111111111111111111111111111111111111"};
const makers = Array.from({length:3},()=>privateKeyToAccount(generatePrivateKey()));
const buyer = privateKeyToAccount(generatePrivateKey());
let nextNonce = 93000;
let db:PGlite,server:Server, base:string;
function txManager(instance:PGlite):OrderTransactionManager {
  return {withTransaction:fn=>instance.transaction(async tx=>fn({
    async query(sql,values=[]) {const r=await tx.query(sql,[...values]);return {rows:r.rows,rowCount:r.affectedRows??null};}
  }))};
}
async function createDb(dir?:string) {
  const instance = new PGlite(dir); await instance.waitReady;
  for(const filename of ["001_order_nonces","002_orders","003_order_cancel_receipts","004_order_book"])
    await instance.exec(await readFile(fileURLToPath(new URL(`../sql/${filename}.sql`,import.meta.url)),"utf8"));
  return instance;
}
async function listen(instance:PGlite) {
  const server=createServer(createOrderHttpHandler({trustedDomain:DOMAIN,transactions:txManager(instance),readDatabase:instance}));
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  return {server,base:`http://127.0.0.1:${(server.address() as AddressInfo).port}`};
}
function order(owner=buyer, attrs:Record<string,unknown>={}) {
  return {account:owner.address,nonce:String(nextNonce++),market:"BTC-USDC",side:"BUY" as const,
    price:"100",quantity:"10",expiresAt:Math.floor(Date.now()/1000)+3600,...attrs};
}
async function post(raw:ReturnType<typeof order>, owner=buyer, origin=base) {
  const signature=await owner.signTypedData(buildOrderTypedData(raw,DOMAIN));
  const r=await fetch(origin+"/api/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({order:raw,signature})});
  return {status:r.status, body:await r.json() as Record<string,any>};
}
async function stored(orderId:string, instance=db) {
  const rows=await instance.query("SELECT status,filled_quantity FROM orders WHERE order_id=$1",[orderId]);
  return rows.rows[0] as {status:string;filled_quantity:string}|undefined;
}
async function fills(orderId:string,instance=db) {
  const rows=await instance.query("SELECT maker_order_id,price,quantity FROM order_fills WHERE taker_order_id=$1 ORDER BY fill_id",[orderId]);
  return rows.rows as Array<{maker_order_id:string;price:string;quantity:string}>;
}
before(async()=>{db=await createDb();({server,base}=await listen(db));});
after(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));if(db)await db.close();});

test("POST automatically admits signed orders and matches price/FIFO with partial maker persistence",async()=>{
  const a=await post(order(makers[0],{side:"SELL",market:"HTTPFIFO-USDC",price:"90",quantity:"4"}),makers[0]);
  const b=await post(order(makers[1],{side:"SELL",market:"HTTPFIFO-USDC",price:"90",quantity:"7"}),makers[1]);
  assert.equal(a.status,201); assert.equal(b.status,201);
  assert.equal(a.body.arrivalSequence,"1");assert.equal(b.body.arrivalSequence,"2");
  const incoming=order(buyer,{market:"HTTPFIFO-USDC",price:"100",quantity:"8"});
  const result=await post(incoming);
  assert.equal(result.status,201);
  assert.equal(result.body.arrivalSequence,"3");
  assert.equal(result.body.status,"FILLED");
  assert.equal(result.body.filledQuantity,"8");
  assert.equal(result.body.remainingQuantity,"0");
  assert.deepEqual(result.body.fills.map((f:{makerOrderId:string;quantity:string;price:string})=>[f.makerOrderId,f.quantity,f.price]),
    [[a.body.orderId,"4","90"],[b.body.orderId,"4","90"]]);
  assert.deepEqual(await stored(a.body.orderId),{status:"FILLED",filled_quantity:"4"});
  assert.deepEqual(await stored(b.body.orderId),{status:"PARTIALLY_FILLED",filled_quantity:"4"});
  assert.equal((await fills(result.body.orderId)).length,2);
  const retry=await post(incoming);
  assert.equal(retry.status,200);assert.equal(retry.body.status,"FILLED");assert.equal(retry.body.replayed,true);
  assert.equal((await fills(result.body.orderId)).length,2);
});

test("simultaneous incoming crossing requests fill only available liquidity and isolate maker accounts",async()=>{
  const maker=await post(order(makers[0],{market:"CONCURRENT-USDC",side:"SELL",price:"80",quantity:"10"}),makers[0]);
  assert.equal(maker.status,201);
  const buyers=[order(buyer,{market:"CONCURRENT-USDC",price:"81",quantity:"7"}),
    order(makers[1],{market:"CONCURRENT-USDC",price:"81",quantity:"7"})];
  const [a,b]=await Promise.all([post(buyers[0],buyer),post(buyers[1],makers[1])]);
  assert.equal(a.status,201); assert.equal(b.status,201);
  assert.equal(BigInt(a.body.filledQuantity)+BigInt(b.body.filledQuantity),10n);
  assert.deepEqual(await stored(maker.body.orderId),{status:"FILLED",filled_quantity:"10"});
  assert.equal((await fills(a.body.orderId)).length+(await fills(b.body.orderId)).length,2);
});

test("public POST does not self-match orders owned by one signer",async()=>{
  const seller=await post(order(makers[2],{market:"HTTPSELF-USDC",side:"SELL",price:"20",quantity:"5"}),makers[2]);
  const same=await post(order(makers[2],{market:"HTTPSELF-USDC",price:"21",quantity:"5"}),makers[2]);
  assert.equal(seller.status,201);assert.equal(same.status,201);
  assert.equal(same.body.filledQuantity,"0");
  assert.deepEqual(await stored(seller.body.orderId),{status:"OPEN",filled_quantity:"0"});
  assert.deepEqual(await fills(same.body.orderId),[]);
});

test("simultaneous HTTP cancel and crossing creation cannot fill canceled quantity",async()=>{
  const makerInput=order(makers[1],{market:"HTTPCANCEL-USDC",side:"SELL",price:"30",quantity:"5"});
  const maker=await post(makerInput,makers[1]);
  assert.equal(maker.status,201);
  const req={account:makerInput.account,nonce:makerInput.nonce,deadline:Math.floor(Date.now()/1000)+1800};
  const signature=await makers[1].signTypedData(buildCancelTypedData(req,DOMAIN));
  const incoming=order(buyer,{market:"HTTPCANCEL-USDC",price:"31",quantity:"5"});
  const [cancelResponse, buyResult]=await Promise.all([
    fetch(base+"/api/orders/cancel",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({cancel:req,signature})}),
    post(incoming),
  ]);
  assert.equal(buyResult.status,201);
  assert.ok([200,409].includes(cancelResponse.status));
  const makerStatus=await stored(maker.body.orderId);
  const total=(await fills(buyResult.body.orderId)).reduce((n,r)=>n+BigInt(r.quantity),0n);
  assert.equal(total,BigInt(buyResult.body.filledQuantity));
  if(cancelResponse.status===200) {
    assert.equal(makerStatus?.status,"CANCELED");
    assert.equal(BigInt(makerStatus!.filled_quantity),total);
  } else {
    assert.equal(makerStatus?.status,"FILLED");
    assert.equal(total,5n);
  }
});

test("matching ledger failure rolls back nonce, order and book admission; safe retry succeeds",async()=>{
  const maker=await post(order(makers[0],{market:"HTTPROLL-USDC",side:"SELL",price:"9",quantity:"5"}),makers[0]);
  assert.equal(maker.status,201);
  const input=order(buyer,{market:"HTTPROLL-USDC",price:"10",quantity:"5"});
  const id=createDeterministicOrderId({...input,account:input.account.toLowerCase()});
  await db.exec(`ALTER TABLE order_fills ADD CONSTRAINT force_http_fail CHECK (taker_order_id <> '${id}')`);
  try {
    const failed=await post(input);
    assert.equal(failed.status,500);
    assert.equal((failed.body.error as {code:string}).code,"INTERNAL_ERROR");
    const nonce=await db.query("SELECT COUNT(*)::INTEGER AS n FROM order_nonces WHERE nonce=$1",[input.nonce]);
    const book=await db.query("SELECT COUNT(*)::INTEGER AS n FROM order_book_entries WHERE order_id=$1",[id]);
    assert.equal((nonce.rows[0] as {n:number}).n,0);
    assert.equal((book.rows[0] as {n:number}).n,0);
    assert.deepEqual(await stored(maker.body.orderId),{status:"OPEN",filled_quantity:"0"});
  }finally{await db.exec("ALTER TABLE order_fills DROP CONSTRAINT force_http_fail");}
  const retried=await post(input);
  assert.equal(retried.status,201);assert.equal(retried.body.filledQuantity,"5");
  assert.equal((await fills(retried.body.orderId)).length,1);
});

test("HTTP-created book entries and fills persist after disk-backed PGlite restart", {timeout:30000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),"perpdex-http-book-"));
  let instance:PGlite|undefined;let api:Server|undefined;
  try {
    instance=await createDb(dir);
    const bound=await listen(instance);api=bound.server;
    const maker=await post(order(makers[1],{market:"HTTPRESTART-USDC",side:"SELL",price:"44",quantity:"11"}),makers[1],bound.base);
    const taker=await post(order(buyer,{market:"HTTPRESTART-USDC",price:"45",quantity:"4"}),buyer,bound.base);
    assert.equal(taker.body.filledQuantity,"4");
    await new Promise<void>(resolve=>api!.close(()=>resolve()));api=undefined;
    await instance.close();instance=undefined;
    instance=await createDb(dir);
    assert.deepEqual(await stored(maker.body.orderId,instance),{status:"PARTIALLY_FILLED",filled_quantity:"4"});
    assert.equal((await fills(taker.body.orderId,instance)).length,1);
    const resumed=await listen(instance);api=resumed.server;
    const next=await post(order(makers[2],{market:"HTTPRESTART-USDC",price:"46",quantity:"7"}),makers[2],resumed.base);
    assert.equal(next.body.arrivalSequence,"3");
    assert.equal(next.body.filledQuantity,"7");
    assert.deepEqual(await stored(maker.body.orderId,instance),{status:"FILLED",filled_quantity:"11"});
  }finally {
    if(api)await new Promise<void>(resolve=>api!.close(()=>resolve()));
    if(instance)await instance.close();
    await rm(dir,{recursive:true,force:true});
  }
});
