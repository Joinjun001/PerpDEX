import test, {before, after} from "node:test";
import assert from "node:assert/strict";
import {createServer, type Server} from "node:http";
import type {AddressInfo} from "node:net";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {PGlite} from "@electric-sql/pglite";
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";
import {buildOrderTypedData} from "../src/orders/signature.ts";
import {createOrderHttpHandler} from "../src/http/create-order-http.ts";
import type {OrderTransactionManager} from "../src/orders/order-transactions.ts";

const DOMAIN = {chainId: 11155111, verifyingContract:"0x1111111111111111111111111111111111111111"};
const OTHER = {...DOMAIN, chainId:1};
const signer = privateKeyToAccount(generatePrivateKey());
let db:PGlite;
let server:Server;
let root:string;
let seq=4000;
function tx(db:PGlite):OrderTransactionManager {
  return { withTransaction: fn => db.transaction(async t => fn({
    async query(sql,values=[]) {const r=await t.query(sql,[...values]);return {rows:r.rows,rowCount:r.affectedRows??null};}
  }))};
}
async function makeServer(domain=DOMAIN) {
  const http=createServer(createOrderHttpHandler({trustedDomain:domain,transactions:tx(db),readDatabase:db}));
  await new Promise<void>(resolve=>http.listen(0,"127.0.0.1",resolve));
  return {server:http, url:`http://127.0.0.1:${(http.address() as AddressInfo).port}`};
}
function order(fields:Record<string,unknown>={}) {
  return {
    account:signer.address, market:"ETH-USDC", side:"BUY" as const,
    price:"123456789012345678901234567890123456789", quantity:"77777777777777777777",
    nonce:String(seq++), expiresAt:Math.floor(Date.now()/1000)+3600, ...fields
  };
}
async function create(input:ReturnType<typeof order>,url=root,domain=DOMAIN) {
  const signature=await signer.signTypedData(buildOrderTypedData(input,domain));
  const r=await fetch(url+"/api/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({order:input,signature})});
  assert.equal(r.status,201);
  return r.json() as Promise<{orderId:string;status:string}>;
}
async function get(path:string,url=root) {
  const r=await fetch(url+path);
  return {status:r.status,body:await r.json() as Record<string,unknown>};
}
before(async()=>{
  db=new PGlite();
  await db.waitReady;
  for(const name of ["../sql/001_order_nonces.sql","../sql/002_orders.sql","../sql/003_order_cancel_receipts.sql","../sql/004_order_book.sql"]) {
    await db.exec(await readFile(fileURLToPath(new URL(name,import.meta.url)),"utf8"));
  }
  ({server,url:root}=await makeServer());
});
after(async()=>{
  if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));
  if(db)await db.close();
});

test("GET by id returns only server-domain order public fields with exact integer strings",async()=>{
  const input=order();
  const created=await create(input);
  const response=await get("/api/orders/"+created.orderId);
  assert.equal(response.status,200);
  const found=response.body.order as Record<string,unknown>;
  assert.equal(found.orderId,created.orderId);
  assert.equal(found.account,input.account.toLowerCase());
  assert.equal(found.market,input.market);
  assert.equal(found.price,input.price);
  assert.equal(found.quantity,input.quantity);
  assert.equal(found.filledQuantity,"0");
  assert.equal(found.status,"OPEN");
  assert.ok(typeof found.createdAt==="string");
  assert.equal("signature" in found,false);
  assert.equal("verifying_contract" in found,false);
  const missing=await get("/api/orders/"+"0x"+"ff".repeat(32));
  assert.equal(missing.status,404);
  assert.equal((missing.body.error as {code:string}).code,"ORDER_NOT_FOUND");
});

test("GET list filters by market and status and excludes signature",async()=>{
  const first=await create(order({market:"BTC-USDC"}));
  const second=await create(order({market:"BTC-USDC"}));
  const third=await create(order({market:"ETH-USDC"}));
  const r=await get("/api/orders?market=btc-usdc&status=OPEN&limit=50");
  assert.equal(r.status,200);
  const body=r.body as {items:Array<Record<string,unknown>>; limit:number;offset:number;hasMore:boolean};
  assert.ok(body.items.some(x=>x.orderId===first.orderId));
  assert.ok(body.items.some(x=>x.orderId===second.orderId));
  assert.ok(!body.items.some(x=>x.orderId===third.orderId));
  assert.ok(body.items.every(x=>x.market==="BTC-USDC" && x.status==="OPEN" && !("signature" in x)));
  // Store state transition is observable through the read API.
  await db.query("UPDATE orders SET status='PARTIALLY_FILLED', filled_quantity='2' WHERE order_id=$1",[second.orderId]);
  const partial=await get("/api/orders?market=BTC-USDC&status=PARTIALLY_FILLED");
  assert.equal(partial.status,200);
  assert.ok((partial.body.items as Array<{orderId:string;filledQuantity:string}>).some(x=>x.orderId===second.orderId&&x.filledQuantity==="2"));
});

test("list has deterministic stable pagination, maximum 50 and explicit offset",async()=>{
  for(let i=0;i<4;i++)await create(order({market:"SOL-USDC"}));
  const all=await get("/api/orders?market=SOL-USDC&limit=50");
  assert.equal(all.status,200);
  const ids=(all.body.items as Array<{orderId:string}>).map(x=>x.orderId);
  assert.equal(ids.length,4);
  const a=await get("/api/orders?market=SOL-USDC&limit=2&offset=0");
  const b=await get("/api/orders?market=SOL-USDC&limit=2&offset=2");
  assert.equal(a.status,200);
  assert.equal(a.body.hasMore,true);
  assert.equal(b.body.hasMore,false);
  const items=[...(a.body.items as Array<{orderId:string}>),...(b.body.items as Array<{orderId:string}>)]
    .map(x=>x.orderId);
  assert.deepEqual(items,ids);
  const empty=await get("/api/orders?market=SOL-USDC&limit=2&offset=4");
  assert.deepEqual(empty.body.items,[]);
  assert.equal(empty.body.hasMore,false);
  const defaultPage=await get("/api/orders");
  assert.equal(defaultPage.body.limit,20);
  assert.equal(defaultPage.body.offset,0);
});

test("bad ids, invalid filters, duplicate parameters, out-of-range paging and injection all return 400",async()=>{
  for(const path of [
    "/api/orders/not-a-digest",
    "/api/orders/"+"0x"+"1".repeat(63),
    "/api/orders/"+"0x"+"a".repeat(64)+"?chainId=1",
    "/api/orders?limit=0", "/api/orders?limit=51",
    "/api/orders?limit=-1", "/api/orders?limit=1.5",
    "/api/orders?offset=10001", "/api/orders?offset=-1",
    "/api/orders?offset=999999999999999999999",
    "/api/orders?status=INVALID",
    "/api/orders?market=ETH%27%20OR%201%3D1",
    "/api/orders?market=", "/api/orders?unexpected=1",
    "/api/orders?market=ETH-USDC&market=BTC-USDC",
    "/api/orders?limit=5&limit=6",
  ]) {
    const r=await get(path);
    assert.equal(r.status,400,`expected 400 for ${path}`);
    assert.equal((r.body.error as {code:string}).code,"INVALID_QUERY");
  }
  const method=await fetch(root+"/api/orders/"+"0x"+"a".repeat(64),{method:"POST"});
  assert.equal(method.status,405);
  assert.equal(method.headers.get("allow"),"GET");
});

test("orders in other chain/domain are not discoverable even with known order ID",async()=>{
  const another=await makeServer(OTHER);
  try {
    const unique=await create(order({market:"XRP-USDC"}),another.url,OTHER);
    assert.equal((await get("/api/orders/"+unique.orderId)).status,404);
    const scoped=await get("/api/orders?market=XRP-USDC");
    const all=(scoped.body.items as Array<{orderId:string}>).map(x=>x.orderId);
    assert.ok(!all.includes(unique.orderId));
    assert.equal((await get("/api/orders/"+unique.orderId,another.url)).status,200);
    const own=await get("/api/orders?market=XRP-USDC",another.url);
    assert.ok((own.body.items as Array<{orderId:string}>).some(x=>x.orderId===unique.orderId));
  } finally {
    await new Promise<void>(resolve=>another.server.close(()=>resolve()));
  }
});

test("read DB errors respond 500 without exposing SQL errors or secrets",async()=>{
  const broken=createServer(createOrderHttpHandler({
    trustedDomain:DOMAIN,
    transactions:tx(db),
    readDatabase:{async query(){throw Error("postgres password SQL private connection details");}},
  }));
  await new Promise<void>(resolve=>broken.listen(0,"127.0.0.1",resolve));
  try {
    const u=`http://127.0.0.1:${(broken.address() as AddressInfo).port}`;
    for(const path of ["/api/orders","/api/orders/"+"0x"+"a".repeat(64)]) {
      const response=await fetch(u+path);
      assert.equal(response.status,500);
      const body=await response.text();
      assert.match(body,/INTERNAL_ERROR/);
      assert.doesNotMatch(body,/password|private|SQL|connection details/i);
    }
  } finally {
    await new Promise<void>(resolve=>broken.close(()=>resolve()));
  }
});
