import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {PGlite} from "@electric-sql/pglite";
import {generatePrivateKey,privateKeyToAccount} from "viem/accounts";
import {buildOrderTypedData} from "../src/orders/signature.ts";
import {buildCancelTypedData} from "../src/orders/cancel-signature.ts";
import {acceptSignedOrder} from "../src/orders/accept-order.ts";
import {cancelSignedOrder} from "../src/orders/cancel-order.ts";
import {registerSignedOrderInBook,matchRegisteredOrder,OrderBookStateError} from "../src/matching/postgres-book.ts";
import type {OrderTransactionManager} from "../src/orders/order-transactions.ts";

const DOMAIN={chainId:11155111,verifyingContract:"0x1111111111111111111111111111111111111111"};
const A=privateKeyToAccount(generatePrivateKey()),B=privateKeyToAccount(generatePrivateKey());
const C=privateKeyToAccount(generatePrivateKey()),D=privateKeyToAccount(generatePrivateKey());
const T=()=>Math.floor(Date.now()/1000);
let seq=10000;
let db:PGlite;

function manager(database:PGlite):OrderTransactionManager {
  return {withTransaction:fn=>database.transaction(async tx=>fn({
    async query(sql,values=[]) {const r=await tx.query(sql,[...values]);return {rows:r.rows,rowCount:r.affectedRows??null};}
  }))};
}
async function database(dir?:string){
  const instance=new PGlite(dir);await instance.waitReady;
  for(const file of ["001_order_nonces","002_orders","003_order_cancel_receipts","004_order_book"]){
    await instance.exec(await readFile(fileURLToPath(new URL("../sql/"+file+".sql",import.meta.url)),"utf8"));
  }
  return instance;
}
function input(wallet= A, attrs:Record<string,unknown>={}){
  return {account:wallet.address,nonce:String(seq++),side:"BUY" as const,market:"ETH-USDC",
    price:"100",quantity:"10",expiresAt:T()+3600,...attrs};
}
type Input=ReturnType<typeof input>;
async function insert(database:PGlite,order:Input,wallet=A,domain=DOMAIN) {
  const sig=await wallet.signTypedData(buildOrderTypedData(order,domain));
  return acceptSignedOrder(order,sig,domain,manager(database));
}
async function admitted(database:PGlite,order:Input,wallet=A,domain=DOMAIN) {
  const created=await insert(database,order,wallet,domain);
  const registration=await registerSignedOrderInBook(order,domain,manager(database));
  return {...created,...registration,order};
}
async function state(database:PGlite,nonce:string) {
  const rows=await database.query(
    `SELECT filled_quantity,status FROM orders WHERE chain_id=$1 AND nonce=$2`,[DOMAIN.chainId,nonce]);
  return rows.rows[0] as {filled_quantity:string;status:string}|undefined;
}
async function fills(database:PGlite,orderId:string){
  const res=await database.query(
    `SELECT maker_order_id,taker_order_id,price,quantity FROM order_fills WHERE taker_order_id=$1 ORDER BY fill_id`,
    [orderId]
  );
  return res.rows as Array<{maker_order_id:string;taker_order_id:string;price:string;quantity:string}>;
}
before(async()=>{db=await database();});
after(async()=>{if(db)await db.close();});

test("admission counter is market-scoped, immutable and unique for concurrent requests",async()=>{
  const orders=[input(A,{market:"SEQ-USDC"}),input(B,{side:"SELL",market:"SEQ-USDC"}),input(C,{market:"SEQ-USDC"})];
  for(const [i,o] of orders.entries())await insert(db,o,[A,B,C][i]);
  const results=await Promise.all(orders.map(o=>registerSignedOrderInBook(o,DOMAIN,manager(db))));
  assert.equal(new Set(results.map(x=>x.arrivalSequence)).size,3);
  assert.deepEqual(results.map(x=>BigInt(x.arrivalSequence)).sort((a,b)=>a<b?-1:1).map(String),
    [results[0].arrivalSequence,results[1].arrivalSequence,results[2].arrivalSequence].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1));
  assert.equal((await registerSignedOrderInBook(orders[0],DOMAIN,manager(db))).arrivalSequence,results[0].arrivalSequence);
  const separate=input(A,{market:"ALT-USDC"});
  await insert(db,separate);
  const first=await registerSignedOrderInBook(separate,DOMAIN,manager(db));
  assert.equal(first.arrivalSequence,"1");
  const otherDomain={...DOMAIN,chainId:1};
  const other=input(A,{market:"ALT-USDC"});
  await insert(db,other,A,otherDomain);
  assert.equal((await registerSignedOrderInBook(other,otherDomain,manager(db))).arrivalSequence,"1");
});

test("price first, FIFO second; partial updates and fills commit as one ledger",async()=>{
  const early=await admitted(db,input(B,{side:"SELL",market:"FIFO-USDC",price:"110",quantity:"5"}),B);
  const first=await admitted(db,input(C,{side:"SELL",market:"FIFO-USDC",price:"90",quantity:"4"}),C);
  const second=await admitted(db,input(D,{side:"SELL",market:"FIFO-USDC",price:"90",quantity:"4"}),D);
  const taker=await admitted(db,input(A,{side:"BUY",market:"FIFO-USDC",price:"120",quantity:"7"}));
  const r=await matchRegisteredOrder(taker.order,DOMAIN,manager(db));
  assert.deepEqual(r.fills.map(x=>[x.makerOrderId,x.quantity,x.price]),
    [[first.orderId,"4","90"],[second.orderId,"3","90"]]);
  assert.equal((await state(db,first.order.nonce))?.status,"FILLED");
  assert.deepEqual(await state(db,second.order.nonce),{status:"PARTIALLY_FILLED",filled_quantity:"3"});
  assert.deepEqual(await state(db,taker.order.nonce),{status:"FILLED",filled_quantity:"7"});
  assert.deepEqual(await state(db,early.order.nonce),{status:"OPEN",filled_quantity:"0"});
  assert.equal((await fills(db,taker.orderId)).length,2);
  assert.equal((await matchRegisteredOrder(taker.order,DOMAIN,manager(db))).fills.length,0);
  assert.equal((await fills(db,taker.orderId)).length,2);
});

test("noncrossing, unregistered and different markets cannot execute",async()=>{
  const seller=await admitted(db,input(B,{market:"NO-USDC",side:"SELL",price:"200"}),B);
  const buyer=await admitted(db,input(A,{market:"NO-USDC",side:"BUY",price:"100"}));
  const other=await admitted(db,input(C,{market:"YES-USDC",side:"SELL",price:"1"}),C);
  assert.equal((await matchRegisteredOrder(buyer.order,DOMAIN,manager(db))).fills.length,0);
  assert.equal((await state(db,seller.order.nonce))?.status,"OPEN");
  assert.equal((await state(db,other.order.nonce))?.status,"OPEN");
  const onlyPersisted=input(A,{market:"NO-USDC",side:"BUY",price:"300"});
  await insert(db,onlyPersisted);
  await assert.rejects(matchRegisteredOrder(onlyPersisted,DOMAIN,manager(db)),OrderBookStateError);
});

test("same-account orders are not self-matched even if crossing",async()=>{
  const maker=await admitted(db,input(A,{market:"SELF-USDC",side:"SELL",price:"10"}));
  const taker=await admitted(db,input(A,{market:"SELF-USDC",side:"BUY",price:"100"}));
  assert.equal((await matchRegisteredOrder(taker.order,DOMAIN,manager(db))).fills.length,0);
  assert.deepEqual(await state(db,maker.order.nonce),{filled_quantity:"0",status:"OPEN"});
});

test("cancelled maker is excluded, terminal incoming cannot be rematched",async()=>{
  const maker=await admitted(db,input(B,{market:"CANCEL-USDC",side:"SELL",price:"10"}),B);
  const cancel={account:maker.order.account,nonce:maker.order.nonce,deadline:T()+1200};
  await cancelSignedOrder(cancel,await B.signTypedData(buildCancelTypedData(cancel,DOMAIN)),DOMAIN,manager(db));
  const taker=await admitted(db,input(A,{market:"CANCEL-USDC",side:"BUY",price:"100"}));
  assert.equal((await matchRegisteredOrder(taker.order,DOMAIN,manager(db))).fills.length,0);
  assert.equal((await state(db,maker.order.nonce))?.status,"CANCELED");
  assert.equal((await fills(db,taker.orderId)).length,0);
});

test("BigInt large prices and quantities conserve fills exactly",async()=>{
  const quantity=(1n<<210n).toString();
  const maker=await admitted(db,input(B,{market:"BIG-USDC",side:"SELL",price:(1n<<200n).toString(),quantity}),B);
  const taker=await admitted(db,input(A,{market:"BIG-USDC",side:"BUY",price:(1n<<201n).toString(),quantity}));
  const r=await matchRegisteredOrder(taker.order,DOMAIN,manager(db));
  assert.equal(r.totalFilled,quantity);
  assert.equal(r.remainingQuantity,"0");
  assert.equal(r.fills[0].quantity,quantity);
  assert.deepEqual(await state(db,maker.order.nonce),{filled_quantity:quantity,status:"FILLED"});
  assert.deepEqual(await state(db,taker.order.nonce),{filled_quantity:quantity,status:"FILLED"});
});

test("fill INSERT failure rolls back both order states and leaves book reusable",async()=>{
  const maker=await admitted(db,input(B,{market:"ROLL-USDC",side:"SELL",price:"90"}),B);
  const taker=await admitted(db,input(A,{market:"ROLL-USDC",side:"BUY",price:"100"}));
  await db.exec(`ALTER TABLE order_fills ADD CONSTRAINT rollback_match_test CHECK (taker_order_id <> '${taker.orderId}')`);
  try {
    await assert.rejects(matchRegisteredOrder(taker.order,DOMAIN,manager(db)),/rollback_match_test/);
    assert.deepEqual(await state(db,taker.order.nonce),{status:"OPEN",filled_quantity:"0"});
    assert.deepEqual(await state(db,maker.order.nonce),{status:"OPEN",filled_quantity:"0"});
    assert.equal((await fills(db,taker.orderId)).length,0);
  }finally{await db.exec("ALTER TABLE order_fills DROP CONSTRAINT rollback_match_test");}
  assert.equal((await matchRegisteredOrder(taker.order,DOMAIN,manager(db))).totalFilled,"10");
});

test("simultaneous matching of same taker cannot double-fill",async()=>{
  const maker=await admitted(db,input(B,{market:"RACE-USDC",side:"SELL",price:"40",quantity:"13"}),B);
  const taker=await admitted(db,input(A,{market:"RACE-USDC",side:"BUY",price:"50",quantity:"13"}));
  const results=await Promise.all(Array.from({length:9},()=>matchRegisteredOrder(taker.order,DOMAIN,manager(db))));
  assert.equal(results.filter(x=>x.totalFilled==="13").length,1);
  assert.equal(results.filter(x=>x.totalFilled==="0").length,8);
  assert.equal((await fills(db,taker.orderId)).length,1);
  assert.deepEqual(await state(db,maker.order.nonce),{filled_quantity:"13",status:"FILLED"});
  assert.deepEqual(await state(db,taker.order.nonce),{filled_quantity:"13",status:"FILLED"});
});

test("concurrent cancellation and matching serialize through maker row and preserve fills",async()=>{
  const maker=await admitted(db,input(B,{market:"CANCELRACE-USDC",side:"SELL",price:"60",quantity:"20"}),B);
  const taker=await admitted(db,input(A,{market:"CANCELRACE-USDC",side:"BUY",price:"70",quantity:"7"}));
  const req={account:maker.order.account,nonce:maker.order.nonce,deadline:T()+1200};
  const sig=await B.signTypedData(buildCancelTypedData(req,DOMAIN));
  const results=await Promise.allSettled([
    matchRegisteredOrder(taker.order,DOMAIN,manager(db)),
    cancelSignedOrder(req,sig,DOMAIN,manager(db)),
  ]);
  assert.equal(results[0].status,"fulfilled");
  assert.equal(results[1].status,"fulfilled");
  const makerState=await state(db,maker.order.nonce);
  const takerState=await state(db,taker.order.nonce);
  const executions=await fills(db,taker.orderId);
  const total=executions.reduce((sum,r)=>sum+BigInt(r.quantity),0n);
  assert.ok(total===0n||total===7n);
  assert.equal(makerState?.status,"CANCELED");
  assert.equal(BigInt(makerState!.filled_quantity),total);
  assert.equal(BigInt(takerState!.filled_quantity),total);
  assert.equal(BigInt(makerState!.filled_quantity)+
    (20n-BigInt(makerState!.filled_quantity)),20n);
  assert.equal((await matchRegisteredOrder(taker.order,DOMAIN,manager(db))).fills.length,0);
});

test("admission and fill ledger survive database reopen with ordered residual liquidity", {timeout:30000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),"perpdex-book-"));
  let instance:PGlite|undefined;
  try{
    instance=await database(dir);
    const maker=await admitted(instance,input(B,{market:"RESTART-USDC",side:"SELL",price:"60",quantity:"14"}),B);
    const taker=await admitted(instance,input(A,{market:"RESTART-USDC",side:"BUY",price:"65",quantity:"6"}));
    assert.equal((await matchRegisteredOrder(taker.order,DOMAIN,manager(instance))).totalFilled,"6");
    const newer=await admitted(instance,input(C,{market:"RESTART-USDC",side:"BUY",price:"61",quantity:"5"}),C);
    await instance.close();instance=undefined;
    instance=await database(dir);
    assert.deepEqual(await state(instance,maker.order.nonce),{status:"PARTIALLY_FILLED",filled_quantity:"6"});
    assert.equal((await fills(instance,taker.orderId)).length,1);
    const after=await matchRegisteredOrder(newer.order,DOMAIN,manager(instance));
    assert.equal(after.totalFilled,"5");
    assert.deepEqual(await state(instance,maker.order.nonce),{status:"PARTIALLY_FILLED",filled_quantity:"11"});
    const seqValue=await instance.query("SELECT last_sequence FROM order_book_counters WHERE chain_id=$1 AND market='RESTART-USDC'",[DOMAIN.chainId]);
    assert.equal(String((seqValue.rows[0] as {last_sequence:string}).last_sequence),"3");
  }finally{if(instance)await instance.close();await rm(dir,{recursive:true,force:true});}
});
