import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {createServer,type Server} from "node:http";
import type {AddressInfo} from "node:net";
import {readFile,mkdtemp,rm} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {PGlite} from "@electric-sql/pglite";
import {generatePrivateKey,privateKeyToAccount} from "viem/accounts";
import {buildOrderTypedData} from "../src/orders/signature.ts";
import {buildCancelTypedData} from "../src/orders/cancel-signature.ts";
import {createOrderHttpHandler} from "../src/http/create-order-http.ts";
import type {OrderTransactionManager} from "../src/orders/order-transactions.ts";

const DOMAIN={chainId:11155111,verifyingContract:"0x1111111111111111111111111111111111111111"};
const ALT_DOMAIN={...DOMAIN,chainId:1};
const wallet=privateKeyToAccount(generatePrivateKey());
const outsider=privateKeyToAccount(generatePrivateKey());
let db:PGlite;
let server:Server;
let base:string;
let number=50000;

async function database(path?:string) {
  const instance=new PGlite(path);
  await instance.waitReady;
  for(const file of ["001_order_nonces","002_orders","003_order_cancel_receipts"]) {
    await instance.exec(await readFile(fileURLToPath(new URL(`../sql/${file}.sql`,import.meta.url)),"utf8"));
  }
  return instance;
}
function transactions(instance:PGlite):OrderTransactionManager {
  return {withTransaction:fn=>instance.transaction(async tx=>fn({
    async query(sql,values=[]) {
      const result=await tx.query(sql,[...values]);
      return {rows:result.rows,rowCount:result.affectedRows??null};
    },
  }))};
}
async function bind(instance:PGlite,domain=DOMAIN){
  const listening=createServer(createOrderHttpHandler({
    trustedDomain:domain,transactions:transactions(instance),readDatabase:instance,
  }));
  await new Promise<void>(resolve=>listening.listen(0,"127.0.0.1",resolve));
  return {server:listening,base:`http://127.0.0.1:${(listening.address() as AddressInfo).port}`};
}
async function close(listening:Server){
  await new Promise<void>(resolve=>listening.close(()=>resolve()));
}
function order(nonce=String(number++),account=wallet.address){
  return {account,nonce,market:"ETH-USDC",side:"BUY" as const,
    price:"20000",quantity:"300",expiresAt:Math.floor(Date.now()/1000)+3600};
}
function cancel(nonce:string,account=wallet.address){
  return {account,nonce,deadline:Math.floor(Date.now()/1000)+1200};
}
async function orderSig(input:ReturnType<typeof order>,domain=DOMAIN,signer=wallet){
  return signer.signTypedData(buildOrderTypedData(input,domain));
}
async function cancelSig(input:ReturnType<typeof cancel>,domain=DOMAIN,signer=wallet){
  return signer.signTypedData(buildCancelTypedData(input,domain));
}
async function post(path:string,payload:unknown,target=base) {
  const response=await fetch(target+path,{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload),
  });
  return {status:response.status,body:await response.json() as Record<string,unknown>};
}
async function create(input:ReturnType<typeof order>,signature?:string,target=base){
  return post("/api/orders",{order:input,signature:signature ?? await orderSig(input)},target);
}
async function revoke(input:ReturnType<typeof cancel>,signature?:string,target=base) {
  return post("/api/orders/cancel",{cancel:input,signature:signature ?? await cancelSig(input)},target);
}
async function counts(nonce:string) {
  const result=await db.query(`SELECT
    (SELECT COUNT(*)::INTEGER FROM orders WHERE nonce=$1) AS orders,
    (SELECT COUNT(*)::INTEGER FROM order_nonces WHERE nonce=$1) AS nonces,
    (SELECT COUNT(*)::INTEGER FROM order_cancel_receipts WHERE nonce=$1) AS receipts`,[nonce]);
  return result.rows[0] as {orders:number;nonces:number;receipts:number};
}

before(async()=>{
  db=await database();
  ({server,base}=await bind(db));
});
after(async()=>{
  if(server)await close(server);
  if(db)await db.close();
});

test("create response loss recovery: identical signed retry gets 200, no double insertion",async()=>{
  const input=order();
  const signature=await orderSig(input);
  const initial=await create(input,signature);
  assert.equal(initial.status,201);
  const retry=await create(input,signature);
  assert.equal(retry.status,200);
  assert.equal(retry.body.replayed,true);
  assert.equal(retry.body.orderId,initial.body.orderId);
  assert.equal(retry.body.status,"OPEN");
  assert.deepEqual(await counts(input.nonce),{orders:1,nonces:1,receipts:0});
  // EIP-712 canonical normalization is consistent, without accepting a changed signed intent.
  const normalized=await create({...input,market:"eth-usdc"},signature);
  assert.equal(normalized.status,200);
});

test("replayed create gives current state after settlement or cancellation",async()=>{
  const input=order();
  const sig=await orderSig(input);
  const first=await create(input,sig);
  assert.equal(first.status,201);
  await db.query("UPDATE orders SET status='PARTIALLY_FILLED',filled_quantity='40' WHERE nonce=$1",[input.nonce]);
  const replay=await create(input,sig);
  assert.equal(replay.status,200);
  assert.equal(replay.body.status,"PARTIALLY_FILLED");
  assert.equal(replay.body.replayed,true);
});

test("changed signed order with same nonce is conflict, forgeries fail authentication",async()=>{
  const input=order();
  const sig=await orderSig(input);
  assert.equal((await create(input,sig)).status,201);
  const modified={...input,price:"20001"};
  assert.equal((await create(modified,await orderSig(modified))).status,409);
  assert.equal((await create(input,await orderSig(input,DOMAIN,outsider))).status,401);
  assert.equal((await create(input,await orderSig(input,ALT_DOMAIN))).status,401);
  const otherOwner=order(input.nonce,outsider.address);
  assert.equal((await create(otherOwner,await orderSig(otherOwner,DOMAIN,outsider))).status,201);
  assert.deepEqual(await counts(input.nonce),{orders:2,nonces:2,receipts:0});
});

test("concurrent identical creates succeed only once; other responses are safe idempotent replays",async()=>{
  const input=order();const sig=await orderSig(input);
  const all=await Promise.all(Array.from({length:10},()=>create(input,sig)));
  assert.equal(all.filter(x=>x.status===201).length,1);
  assert.equal(all.filter(x=>x.status===200 && x.body.replayed===true).length,9);
  assert.deepEqual(await counts(input.nonce),{orders:1,nonces:1,receipts:0});
});

test("signed cancel replay is receipt-backed and returns original remaining quantity",async()=>{
  const input=order();const signature=await orderSig(input);
  assert.equal((await create(input,signature)).status,201);
  await db.query("UPDATE orders SET status='PARTIALLY_FILLED',filled_quantity='40' WHERE nonce=$1",[input.nonce]);
  const intent=cancel(input.nonce); const cancelSignature=await cancelSig(intent);
  const original=await revoke(intent,cancelSignature);
  assert.equal(original.status,200);
  assert.deepEqual(original.body,{status:"CANCELED",orderExists:true,remainingQuantity:"260"});
  const replay=await revoke(intent,cancelSignature);
  assert.equal(replay.status,200);
  assert.deepEqual(replay.body,{...original.body,replayed:true});
  assert.deepEqual(await counts(input.nonce),{orders:1,nonces:1,receipts:1});
  // The original valid order signature is still recognizable; status is not silently OPEN.
  const createAgain=await create(input,signature);
  assert.equal(createAgain.status,200);
  assert.equal(createAgain.body.status,"CANCELED");
});

test("pre-cancel replay is stable, different cancellation intent is not idempotent",async()=>{
  const input=order();const req=cancel(input.nonce);const sig=await cancelSig(req);
  assert.equal((await revoke(req,sig)).status,200);
  const replay=await revoke(req,sig);
  assert.equal(replay.status,200);
  assert.deepEqual(replay.body,{status:"CANCELED",orderExists:false,remainingQuantity:null,replayed:true});
  const newDeadline={...req,deadline:req.deadline+20};
  assert.equal((await revoke(newDeadline,await cancelSig(newDeadline))).status,409);
  assert.equal((await revoke(req,await cancelSig(req,ALT_DOMAIN))).status,401);
  assert.equal((await revoke(req,await cancelSig(req,DOMAIN,outsider))).status,401);
  assert.equal((await create(input,await orderSig(input))).status,409);
  assert.deepEqual(await counts(input.nonce),{orders:0,nonces:1,receipts:1});
});

test("concurrent exact cancels have one committed receipt; retries read it",async()=>{
  const input=order();const req=cancel(input.nonce);const sig=await cancelSig(req);
  const all=await Promise.all(Array.from({length:8},()=>revoke(req,sig)));
  assert.equal(all.filter(x=>x.status===200).length,8);
  assert.equal(all.filter(x=>x.body.replayed===true).length,7);
  assert.deepEqual(await counts(input.nonce),{orders:0,nonces:1,receipts:1});
});

test("receipt insertion error rolls back nonce and order cancellation",async()=>{
  const input=order();assert.equal((await create(input)).status,201);
  const req=cancel(input.nonce);
  const sig=await cancelSig(req);
  await db.exec(`ALTER TABLE order_cancel_receipts ADD CONSTRAINT fail_receipt_for_test CHECK (nonce <> '${req.nonce}')`);
  try {
    const attempt=await revoke(req,sig);
    assert.equal(attempt.status,500);
    assert.equal((attempt.body.error as {code:string}).code,"INTERNAL_ERROR");
    assert.deepEqual(await counts(input.nonce),{orders:1,nonces:1,receipts:0});
    const status=await db.query("SELECT n.status AS n,o.status AS o FROM order_nonces n JOIN orders o USING(chain_id,verifying_contract,account,nonce) WHERE n.nonce=$1",[input.nonce]);
    assert.deepEqual(status.rows[0],{n:"USED",o:"OPEN"});
  } finally {
    await db.exec("ALTER TABLE order_cancel_receipts DROP CONSTRAINT fail_receipt_for_test");
  }
  assert.equal((await revoke(req,sig)).status,200);
  assert.deepEqual(await counts(input.nonce),{orders:1,nonces:1,receipts:1});
});

test("durable idempotency survives PGlite close and reopen", {timeout:30000}, async()=>{
  const directory=await mkdtemp(join(tmpdir(),"perpdex-retry-"));
  let local:PGlite|undefined;let service:Server|undefined;
  try{
    local=await database(directory);
    let setup=await bind(local);
    service=setup.server;
    const creation=order();const creationSig=await orderSig(creation);
    assert.equal((await create(creation,creationSig,setup.base)).status,201);
    const canceled=order();const req=cancel(canceled.nonce);const sig=await cancelSig(req);
    assert.equal((await revoke(req,sig,setup.base)).status,200);
    await close(service);service=undefined;
    await local.close();local=undefined;
    local=await database(directory);
    setup=await bind(local);service=setup.server;
    const replayCreate=await create(creation,creationSig,setup.base);
    assert.equal(replayCreate.status,200);
    assert.equal(replayCreate.body.replayed,true);
    const replayCancel=await revoke(req,sig,setup.base);
    assert.equal(replayCancel.status,200);
    assert.equal(replayCancel.body.replayed,true);
  }finally{
    if(service)await close(service);
    if(local)await local.close();
    await rm(directory,{recursive:true,force:true});
  }
});
