import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import type {OrderTransactionManager} from '../src/orders/order-transactions.ts';
import type {PerpPositionContext} from '../src/perp/position-engine.ts';
import {applySimPairedFill,applySimPairedFillWithinTransaction,verifySimMarketOpenInterest,type SimPairedFill} from '../src/perp/paired-clearing.ts';
import {applySimReservedPairedFill,type SimReservedPairedFill} from '../src/perp/reserved-paired-clearing.ts';
import {applySimPartialReservedPair} from '../src/perp/partial-reserved-paired-clearing.ts';
import {applySimPerpFillWithinTransaction} from '../src/perp/position-ledger.ts';
import {reserveSimReduceOnly,type SimReduceOrderRequest,consumeSimReduceReservation,cancelSimReduceReservation} from '../src/perp/reduce-reservations.ts';
const ALICE=privateKeyToAccount(generatePrivateKey()).address;
const BOB=privateKeyToAccount(generatePrivateKey()).address;
const NOW=1800000000;
const CONTRACT='0x1111111111111111111111111111111111111111';
const TOKEN='0x3333333333333333333333333333333333333333';
let seq=1;const id=()=>`0x${(seq++).toString(16).padStart(64,'0')}`;
function context(sequence='101'):PerpPositionContext{return {
  domain:{chainId:11155111,verifyingContract:CONTRACT},trustedSourceId:'pair-test',nowSeconds:NOW,
  config:{chainId:11155111,verifyingContract:CONTRACT,market:'BTC-USD-PERP',baseAsset:'BTC',quoteAsset:'USD',
    collateralToken:TOKEN,sourceId:'pair-test',oracleSourceId:'pair-oracle',revision:1,status:'APPROVED',
    validFrom:NOW-100,validUntil:NOW+1000,baseDecimals:8,priceDecimals:2,collateralDecimals:6,
    tickSize:'5',lotSize:'100',minQuantity:'100',maxQuantity:'10000000000',maxOpenInterest:'20000000000',
    initialMarginBps:1000,maintenanceMarginBps:500,maxLeverage:10,
    maxPriceDeviationBps:300,maxConfidenceBps:100,maxOracleAgeSeconds:30},
  snapshot:{chainId:11155111,verifyingContract:CONTRACT,market:'BTC-USD-PERP',configRevision:1,
    sourceId:'pair-oracle',indexPrice:'6500000',markPrice:'6500000',publishedAt:NOW-1,
    sourceSequence:sequence,confidenceBps:10},
};}
function mgr(db:PGlite):OrderTransactionManager{return {withTransaction:fn=>db.transaction(async tx=>fn({
  async query(sql,args=[]){const q=await tx.query(sql,[...args]);return {rows:q.rows,rowCount:q.affectedRows??null};},
}))};}
async function open(path?:string){const db=new PGlite(path);await db.waitReady;
  for(const name of ['008_perp_margin_ledger','010_perp_position_ledger','011_perp_pair_clearing','012_perp_reduce_reservations','013_perp_guarded_position_commit']){
    await db.exec(await readFile(fileURLToPath(new URL(`../sql/${name}.sql`,import.meta.url)),'utf8'));
  }return db;
}
async function prepare(db:PGlite){
  const c=context();
  const initial:SimPairedFill={executionMode:'SIMULATION_ONLY',fillId:id(),buyerAccount:ALICE,
    sellerAccount:BOB,priceAtomic:'6500000',quantityAtomic:'100000000',buyerExpectedVersion:0,sellerExpectedVersion:0};
  await applySimPairedFill(mgr(db),initial,c);
  for(const account of [ALICE,BOB]){
    for(const bucket of ['AVAILABLE','RESERVED','POSITION']){
      await db.query(`INSERT INTO perp_margin_balances
        (chain_id,verifying_contract,market,collateral_token,account,bucket,balance)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,[11155111,CONTRACT,'BTC-USD-PERP',TOKEN,
          account.toLowerCase(),bucket,bucket==='AVAILABLE'?'10000000000':'0']);
    }
  }
  return c;
}
async function reserve(db:PGlite,qty='40000000'){
  const c=context();
  const buy:SimReduceOrderRequest={executionMode:'SIMULATION_ONLY',orderId:id(),account:BOB,
    side:'BUY',priceAtomic:'6500000',orderQuantityAtomic:qty,expectedPositionVersion:1};
  const sell:SimReduceOrderRequest={...buy,orderId:id(),account:ALICE,side:'SELL'};
  await reserveSimReduceOnly(mgr(db),buy,c);
  await reserveSimReduceOnly(mgr(db),sell,c);
  return {buy,sell};
}
function trade(o:{buy:SimReduceOrderRequest;sell:SimReduceOrderRequest},qty='40000000'):SimReservedPairedFill{
  return {executionMode:'SIMULATION_ONLY',fillId:id(),buyerAccount:BOB,sellerAccount:ALICE,
    buyerOrderId:o.buy.orderId,sellerOrderId:o.sell.orderId,quantityAtomic:qty,
    priceAtomic:'6500000',buyerExpectedVersion:1,sellerExpectedVersion:1};
}
async function counts(db:PGlite){const tables=['perp_sim_paired_fills','perp_position_applications',
  'perp_reduce_events'] as const;const data:Record<string,number>={};
  for(const table of tables){const r=await db.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
    data[table]=Number((r.rows[0] as {n:number}).n);}
  return data;
}
async function run(f:(db:PGlite)=>Promise<void>){const db=await open();try{await f(db);}finally{await db.close();}}

test('atomic reserved 0.4 BTC close on both sides updates OI and linked event ID',()=>run(async db=>{
  await prepare(db);const o=await reserve(db),t=trade(o);
  const result=await applySimReservedPairedFill(mgr(db),t,context());
  assert.equal(result.buyer.position.sizeSignedAtomic,'-60000000');
  assert.equal(result.seller.position.sizeSignedAtomic,'60000000');
  assert.equal(result.openInterest.openInterestAtomic,'60000000');
  assert.equal((await verifySimMarketOpenInterest(db,context())).openInterestAtomic,'60000000');
  assert.deepEqual(await counts(db),{perp_sim_paired_fills:2,perp_position_applications:4,perp_reduce_events:2});
  const events=await db.query('SELECT event_id,quantity_atomic FROM perp_reduce_events ORDER BY account');
  assert.ok(events.rows.every(r=>(r as {event_id:string;quantity_atomic:string}).event_id===t.fillId&&
    (r as {quantity_atomic:string}).quantity_atomic==='40000000'));
  const orders=await db.query('SELECT status,remaining_qty_atomic,consumed_qty_atomic FROM perp_reduce_orders');
  assert.ok(orders.rows.every(r=>(r as {status:string}).status==='EXHAUSTED'));
  const guards=await db.query('SELECT position_size_atomic,position_version,consumed_qty_atomic FROM perp_reduce_guards');
  assert.ok(guards.rows.every(r=>(r as {consumed_qty_atomic:string}).consumed_qty_atomic==='0'&&
    Number((r as {position_version:number}).position_version)===2));
}));

test('legacy ungated M4 pair cannot bypass reserved positions; tracked OI unchanged',()=>run(async db=>{
  await prepare(db);await reserve(db);
  await assert.rejects(applySimPairedFill(mgr(db),{executionMode:'SIMULATION_ONLY',fillId:id(),
    buyerAccount:BOB,sellerAccount:ALICE,priceAtomic:'6500000',quantityAtomic:'40000000',
    buyerExpectedVersion:1,sellerExpectedVersion:1},context()),/guarded/i);
  assert.equal((await counts(db)).perp_sim_paired_fills,1);
}));

test('replay and 9 simultaneous identical reserved pairs commit exactly once',()=>run(async db=>{
  await prepare(db);const o=await reserve(db);const t=trade(o);
  const results=await Promise.allSettled(Array.from({length:9},()=>applySimReservedPairedFill(mgr(db),t,context())));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected').length,8);
  assert.equal((await counts(db)).perp_reduce_events,2);
  await assert.rejects(applySimReservedPairedFill(mgr(db),t,context()));
}));

test('only ONE side reservation cannot execute both accounts',()=>run(async db=>{
  await prepare(db);const o=await reserve(db);
  await db.query('DELETE FROM perp_reduce_orders WHERE account=$1',[ALICE.toLowerCase()]);
  const t=trade(o);
  await assert.rejects(applySimReservedPairedFill(mgr(db),t,context()));
  assert.deepEqual(await counts(db),{perp_sim_paired_fills:1,perp_position_applications:2,perp_reduce_events:0});
}));

test('stale oracle source sequence or changed margin version fail whole transaction',()=>run(async db=>{
  await prepare(db);const o=await reserve(db),t=trade(o);
  await assert.rejects(applySimReservedPairedFill(mgr(db),t,context('102')));
  await db.query("UPDATE perp_margin_balances SET version=version+1 WHERE account=$1 AND bucket='AVAILABLE'",[BOB.toLowerCase()]);
  await assert.rejects(applySimReservedPairedFill(mgr(db),t,context()));
  assert.equal((await verifySimMarketOpenInterest(db,context())).openInterestAtomic,'100000000');
  assert.equal((await counts(db)).perp_reduce_events,0);
}));

test('forced reservation event failure rolls back both position journals, paired receipt and OI',()=>run(async db=>{
  await prepare(db);const o=await reserve(db),t=trade(o);
  await db.exec(`ALTER TABLE perp_reduce_events ADD CONSTRAINT deny_pair_event CHECK (event_id <> '${t.fillId}')`);
  await assert.rejects(applySimReservedPairedFill(mgr(db),t,context()));
  assert.deepEqual(await counts(db),{perp_sim_paired_fills:1,perp_position_applications:2,perp_reduce_events:0});
  assert.equal((await verifySimMarketOpenInterest(db,context())).openInterestAtomic,'100000000');
  await db.exec('ALTER TABLE perp_reduce_events DROP CONSTRAINT deny_pair_event');
  assert.equal((await applySimReservedPairedFill(mgr(db),t,context())).openInterest.openInterestAtomic,'60000000');
}));

test('cancel or shadow-consume before atomic paired execution fails closed',()=>run(async db=>{
  await prepare(db);const o=await reserve(db),t=trade(o);
  await consumeSimReduceReservation(mgr(db),{executionMode:'SIMULATION_ONLY',account:BOB,
    orderId:o.buy.orderId,eventId:id(),quantityAtomic:'10000000'},context());
  await assert.rejects(applySimReservedPairedFill(mgr(db),t,context()));
  assert.equal((await counts(db)).perp_sim_paired_fills,1);
}));

test('after atomic reduction, a fresh reduce-only reservation uses the newly committed position size',()=>run(async db=>{
  await prepare(db);const o=await reserve(db),t=trade(o);
  await applySimReservedPairedFill(mgr(db),t,context());
  const next:SimReduceOrderRequest={executionMode:'SIMULATION_ONLY',orderId:id(),account:BOB,
    side:'BUY',priceAtomic:'6500000',orderQuantityAtomic:'60000000',expectedPositionVersion:2};
  assert.equal((await reserveSimReduceOnly(mgr(db),next,context())).remainingQuantityAtomic,'60000000');
  await assert.rejects(reserveSimReduceOnly(mgr(db),{...next,orderId:id(),orderQuantityAtomic:'100'},context()));
}));

test('disk restart preserves linked receipts, replay fencing and updated OI',{timeout:45000},async()=>{
  const folder=await mkdtemp(join(tmpdir(),'perp-paired-reserved-'));let db:PGlite|undefined;
  try{db=await open(folder);await prepare(db);const o=await reserve(db),t=trade(o);
    await applySimReservedPairedFill(mgr(db),t,context());await db.close();db=undefined;
    db=await open(folder);
    assert.equal((await verifySimMarketOpenInterest(db,context())).openInterestAtomic,'60000000');
    assert.equal((await counts(db)).perp_reduce_events,2);
    await assert.rejects(applySimReservedPairedFill(mgr(db),t,context()));
    assert.equal((await counts(db)).perp_sim_paired_fills,2);
  }finally{if(db)await db.close();await rm(folder,{recursive:true,force:true});}
});

async function more(db:PGlite,o:{buy:SimReduceOrderRequest;sell:SimReduceOrderRequest},qty='30000000'){
  const c=context();
  const b:SimReduceOrderRequest={...o.buy,orderId:id(),orderQuantityAtomic:qty};
  const s:SimReduceOrderRequest={...o.sell,orderId:id(),orderQuantityAtomic:qty};
  await reserveSimReduceOnly(mgr(db),b,c);await reserveSimReduceOnly(mgr(db),s,c);
  return {buy:b,sell:s};
}
async function liveOrders(db:PGlite){
  const q=await db.query(`SELECT account,order_id,remaining_qty_atomic,consumed_qty_atomic,
    status,position_version,requested_qty_atomic,cancelled_qty_atomic
    FROM perp_reduce_orders ORDER BY account,order_id`);
  return q.rows as Array<{account:string;order_id:string;remaining_qty_atomic:string;
    consumed_qty_atomic:string;status:string;position_version:number|string;
    requested_qty_atomic:string;cancelled_qty_atomic:string}>;
}

test('B2 two simultaneous outstanding orders per account: partial reduces selected, reanchors other',()=>run(async db=>{
  await prepare(db);const first=await reserve(db,'60000000');const other=await more(db,first);
  const t=trade(first,'20000000');
  const output=await applySimPartialReservedPair(mgr(db),t,context());
  assert.equal(output.openInterest.openInterestAtomic,'80000000');
  assert.equal(output.buyer.position.sizeSignedAtomic,'-80000000');
  const orders=await liveOrders(db);
  assert.equal(orders.length,4);
  for(const row of orders){
    assert.equal(Number(row.position_version),2);
    assert.equal(row.status,'OPEN');
    assert.equal(row.remaining_qty_atomic, row.order_id===first.buy.orderId||row.order_id===first.sell.orderId?'40000000':'30000000');
    assert.equal(row.consumed_qty_atomic,row.order_id===first.buy.orderId||row.order_id===first.sell.orderId?'20000000':'0');
    assert.equal(BigInt(row.requested_qty_atomic),BigInt(row.remaining_qty_atomic)+BigInt(row.consumed_qty_atomic)+BigInt(row.cancelled_qty_atomic));
  }
  assert.equal((await counts(db)).perp_reduce_events,2);
  assert.equal((await verifySimMarketOpenInterest(db,context())).openInterestAtomic,'80000000');
}));

test('B2 repeated partial from SAME order retains real paired history and fresh versions',()=>run(async db=>{
  await prepare(db);const first=await reserve(db,'60000000');await more(db,first);
  await applySimPartialReservedPair(mgr(db),trade(first,'20000000'),context());
  const second={...trade(first,'20000000'),buyerExpectedVersion:2,sellerExpectedVersion:2};
  const next=await applySimPartialReservedPair(mgr(db),second,context());
  assert.equal(next.openInterest.openInterestAtomic,'60000000');
  const rows=await liveOrders(db);
  assert.equal(rows.filter(x=>x.consumed_qty_atomic==='40000000').length,2);
  assert.ok(rows.every(x=>Number(x.position_version)===3));
  assert.equal((await counts(db)).perp_reduce_events,4);
}));

test('B2 cannot exceed updated exposure with a new reservation',()=>run(async db=>{
  await prepare(db);const first=await reserve(db,'60000000');await more(db,first);
  await applySimPartialReservedPair(mgr(db),trade(first,'20000000'),context());
  await assert.rejects(reserveSimReduceOnly(mgr(db),{
    ...first.buy,orderId:id(),expectedPositionVersion:2,orderQuantityAtomic:'20000000',
  },context()),/capacity|exceeds position/i);
  assert.equal((await liveOrders(db)).length,4);
}));

test('B2 cancellation after partial releases only unconsumed remaining and retains consumed accounting',()=>run(async db=>{
  await prepare(db);const first=await reserve(db,'60000000');const other=await more(db,first);
  await applySimPartialReservedPair(mgr(db),trade(first,'20000000'),context());
  await cancelSimReduceReservation(mgr(db),{executionMode:'SIMULATION_ONLY',orderId:other.buy.orderId,
    account:BOB,eventId:id()},context());
  const orders=await liveOrders(db);
  const cancel=orders.find(x=>x.order_id===other.buy.orderId)!;
  assert.equal(cancel.status,'CANCELLED');
  assert.equal(cancel.cancelled_qty_atomic,'30000000');
  const used=orders.find(x=>x.order_id===first.buy.orderId)!;
  assert.equal(used.remaining_qty_atomic,'40000000');
  assert.equal(used.consumed_qty_atomic,'20000000');
  await reserveSimReduceOnly(mgr(db),{...first.buy,orderId:id(),expectedPositionVersion:2,
    orderQuantityAtomic:'40000000'},context());
}));

test('B2 stale position version, oracle sequence and margin version reject without journal writes',()=>run(async db=>{
  await prepare(db);const first=await reserve(db,'60000000');await more(db,first);
  const t=trade(first,'20000000');
  await assert.rejects(applySimPartialReservedPair(mgr(db),{...t,buyerExpectedVersion:0},context()));
  await assert.rejects(applySimPartialReservedPair(mgr(db),t,context('999')));
  await db.query("UPDATE perp_margin_balances SET version=version+1 WHERE account=$1 AND bucket='AVAILABLE'",[BOB.toLowerCase()]);
  await assert.rejects(applySimPartialReservedPair(mgr(db),t,context()));
  assert.deepEqual(await counts(db),{perp_sim_paired_fills:1,perp_position_applications:2,perp_reduce_events:0});
}));

test('B2 rejection of oversize fill and improper BUY/SELL bindings rolls back both accounts',()=>run(async db=>{
  await prepare(db);const first=await reserve(db,'60000000');await more(db,first);
  const t=trade(first,'20000000');
  await assert.rejects(applySimPartialReservedPair(mgr(db),{...t,quantityAtomic:'70000000'},context()));
  await assert.rejects(applySimPartialReservedPair(mgr(db),{...t,buyerOrderId:first.sell.orderId},context()));
  assert.equal((await verifySimMarketOpenInterest(db,context())).openInterestAtomic,'100000000');
  assert.equal((await liveOrders(db)).reduce((n,o)=>n+BigInt(o.consumed_qty_atomic),0n),0n);
}));

test('B2 force SQL event failure after M4 paired journal triggers entire rollback then retry succeeds',()=>run(async db=>{
  await prepare(db);const first=await reserve(db,'60000000');await more(db,first);
  const t=trade(first,'20000000');
  await db.exec(`ALTER TABLE perp_reduce_events ADD CONSTRAINT deny_partial CHECK (event_id <> '${t.fillId}')`);
  await assert.rejects(applySimPartialReservedPair(mgr(db),t,context()));
  assert.deepEqual(await counts(db),{perp_sim_paired_fills:1,perp_position_applications:2,perp_reduce_events:0});
  assert.equal((await verifySimMarketOpenInterest(db,context())).openInterestAtomic,'100000000');
  assert.ok((await liveOrders(db)).every(o=>Number(o.position_version)===1));
  await db.exec('ALTER TABLE perp_reduce_events DROP CONSTRAINT deny_partial');
  assert.equal((await applySimPartialReservedPair(mgr(db),t,context())).openInterest.openInterestAtomic,'80000000');
}));

test('B2 concurrent duplicate partial fill ID records exactly once and replay is fenced',()=>run(async db=>{
  await prepare(db);const first=await reserve(db,'60000000');await more(db,first);
  const t=trade(first,'20000000');
  const all=await Promise.allSettled(Array.from({length:7},()=>applySimPartialReservedPair(mgr(db),t,context())));
  assert.equal(all.filter(x=>x.status==='fulfilled').length,1);
  assert.equal((await counts(db)).perp_sim_paired_fills,2);
  assert.equal((await counts(db)).perp_reduce_events,2);
  assert.equal((await verifySimMarketOpenInterest(db,context())).openInterestAtomic,'80000000');
}));

test('B2 unpaired shadow consumption must not be accepted as paired historic receipt',()=>run(async db=>{
  await prepare(db);const first=await reserve(db,'60000000');await more(db,first);
  await consumeSimReduceReservation(mgr(db),{executionMode:'SIMULATION_ONLY',account:BOB,
    eventId:id(),orderId:first.buy.orderId,quantityAtomic:'10000000'},context());
  await assert.rejects(applySimPartialReservedPair(mgr(db),trade(first,'20000000'),context()),/shadow/i);
  assert.equal((await counts(db)).perp_sim_paired_fills,1);
}));

test('B2 persistent disk restart restores partial order sizes, paired receipts and OI',{timeout:45000},async()=>{
  const folder=await mkdtemp(join(tmpdir(),'perp-partial-reserved-'));let db:PGlite|undefined;
  try{
    db=await open(folder);await prepare(db);const first=await reserve(db,'60000000');await more(db,first);
    const t=trade(first,'20000000');await applySimPartialReservedPair(mgr(db),t,context());
    await db.close();db=undefined;db=await open(folder);
    assert.equal((await verifySimMarketOpenInterest(db,context())).openInterestAtomic,'80000000');
    assert.equal((await counts(db)).perp_reduce_events,2);
    assert.ok((await liveOrders(db)).every(o=>Number(o.position_version)===2));
    await assert.rejects(applySimPartialReservedPair(mgr(db),t,context()));
    const remaining={...trade(first,'20000000'),buyerExpectedVersion:2,sellerExpectedVersion:2};
    assert.equal((await applySimPartialReservedPair(mgr(db),remaining,context())).openInterest.openInterestAtomic,'60000000');
  }finally{if(db)await db.close();await rm(folder,{recursive:true,force:true});}
});

test('B2 one-sided SQL failure on SECOND sorted account rolls back both previously written M4 fills',()=>run(async db=>{
  await prepare(db);const first=await reserve(db,'60000000');await more(db,first);
  const t=trade(first,'20000000');const later=[ALICE,BOB].map(x=>x.toLowerCase()).sort()[1];
  await db.exec(`ALTER TABLE perp_reduce_events ADD CONSTRAINT qa_fail_second_account
    CHECK (NOT (event_id = '${t.fillId}' AND account = '${later}'))`);
  await assert.rejects(applySimPartialReservedPair(mgr(db),t,context()));
  assert.deepEqual(await counts(db),{perp_sim_paired_fills:1,perp_position_applications:2,perp_reduce_events:0});
  assert.equal((await verifySimMarketOpenInterest(db,context())).openInterestAtomic,'100000000');
  assert.ok((await liveOrders(db)).every(o=>o.consumed_qty_atomic==='0'&&Number(o.position_version)===1));
  await db.exec('ALTER TABLE perp_reduce_events DROP CONSTRAINT qa_fail_second_account');
  assert.equal((await applySimPartialReservedPair(mgr(db),t,context())).openInterest.openInterestAtomic,'80000000');
}));

test('B2 cancel versus partial fill is serializable and never exceeds resulting position',()=>run(async db=>{
  await prepare(db);const first=await reserve(db,'60000000');await more(db,first);
  const t=trade(first,'20000000');
  const c={executionMode:'SIMULATION_ONLY' as const,account:BOB,orderId:first.buy.orderId,eventId:id()};
  const [fill,cancel]=await Promise.allSettled([
    applySimPartialReservedPair(mgr(db),t,context()),
    cancelSimReduceReservation(mgr(db),c,context()),
  ]);
  const oi=(await verifySimMarketOpenInterest(db,context())).openInterestAtomic;
  assert.ok(oi==='100000000'||oi==='80000000');
  assert.ok(fill.status==='fulfilled'||cancel.status==='fulfilled');
  const orders=await liveOrders(db);
  for(const account of [ALICE,BOB]){
    const rows=orders.filter(x=>x.account===account.toLowerCase()&&x.status==='OPEN');
    const openTotal=rows.reduce((n,r)=>n+BigInt(r.remaining_qty_atomic),0n);
    const expected=oi==='100000000'?100000000n:80000000n;
    assert.ok(openTotal<=expected);
  }
  assert.equal((await counts(db)).perp_sim_paired_fills,oi==='80000000'?2:1);
}));

test('B2 changed OTHER open order oracle fingerprint rejects partial without consuming selected',()=>run(async db=>{
  await prepare(db);const first=await reserve(db,'60000000');const other=await more(db,first);
  await db.query('UPDATE perp_reduce_orders SET snapshot_hash=$1 WHERE order_id=$2',[
    '0x'+'a'.repeat(64),other.buy.orderId]);
  await assert.rejects(applySimPartialReservedPair(mgr(db),trade(first,'20000000'),context()));
  assert.deepEqual(await counts(db),{perp_sim_paired_fills:1,perp_position_applications:2,perp_reduce_events:0});
}));

test('B3 raw SQL snapshot change under reduce-only guard must fail at COMMIT',()=>run(async db=>{
  await prepare(db);await reserve(db);
  const before=await db.query('SELECT size_signed_atomic,version FROM perp_position_snapshots WHERE account=$1',[ALICE.toLowerCase()]);
  await assert.rejects(mgr(db).withTransaction(async tx=>{
    await tx.query(`UPDATE perp_position_snapshots SET size_signed_atomic='90000000',
       open_cost_numerator='5850000000000000',version=version+1,last_fill_id=$1
       WHERE account=$2`,[id(),ALICE.toLowerCase()]);
  }),/guard|position|receipt|paired/i);
  const after=await db.query('SELECT size_signed_atomic,version FROM perp_position_snapshots WHERE account=$1',[ALICE.toLowerCase()]);
  assert.deepEqual(after.rows,before.rows);
}));

test('B3 caller-supplied guarded=true on low-level M4 pair cannot skip reservation settlement',()=>run(async db=>{
  await prepare(db);const o=await reserve(db);const t=trade(o);
  await assert.rejects(mgr(db).withTransaction(tx=>applySimPairedFillWithinTransaction(tx,t,context(),true as unknown as {buyerOrderId:string;sellerOrderId:string})),
    /guard|position|receipt|paired|reduc/i);
  assert.equal((await counts(db)).perp_sim_paired_fills,1);
  assert.equal((await counts(db)).perp_reduce_events,0);
  assert.equal((await verifySimMarketOpenInterest(db,context())).openInterestAtomic,'100000000');
}));

test('B3 low-level single-account writer cannot silently commit under a reduce guard',()=>run(async db=>{
  await prepare(db);await reserve(db);
  const c=context();
  await assert.rejects(mgr(db).withTransaction(tx=>applySimPerpFillWithinTransaction(tx,{
    executionMode:'SIMULATION_ONLY',fillId:id(),account:ALICE,side:'SELL',
    priceAtomic:'6500000',quantityAtomic:'10000000',expectedVersion:1,
    chainId:c.config.chainId,verifyingContract:c.config.verifyingContract,
    market:c.config.market,collateralToken:c.config.collateralToken,
    configRevision:c.config.revision,
  },c)),/guard|position|receipt|paired/i);
  assert.equal((await counts(db)).perp_position_applications,2);
}));

test('B3 valid reservation IDs alone cannot bypass atomic reservation CONSUME at commit',()=>run(async db=>{
  await prepare(db);const o=await reserve(db);const t=trade(o);
  await assert.rejects(mgr(db).withTransaction(tx=>applySimPairedFillWithinTransaction(tx,t,context(),{
    buyerOrderId:o.buy.orderId,sellerOrderId:o.sell.orderId,
  })),/guard|receipt|paired/i);
  assert.deepEqual(await counts(db),{perp_sim_paired_fills:1,perp_position_applications:2,perp_reduce_events:0});
  assert.equal((await verifySimMarketOpenInterest(db,context())).openInterestAtomic,'100000000');
  // The identical transaction can still execute through the FULL verified path.
  const actual=await applySimReservedPairedFill(mgr(db),t,context());
  assert.equal(actual.openInterest.openInterestAtomic,'60000000');
}));

test('B3 missing migration 013 forbids even a matching caller proof in the guarded M4 writer',async()=>{
  const db=new PGlite();await db.waitReady;
  try{
    for(const name of ['008_perp_margin_ledger','010_perp_position_ledger','011_perp_pair_clearing','012_perp_reduce_reservations']){
      await db.exec(await readFile(fileURLToPath(new URL(`../sql/${name}.sql`,import.meta.url)),'utf8'));
    }
    await prepare(db);const o=await reserve(db);const t=trade(o);
    await assert.rejects(mgr(db).withTransaction(tx=>applySimPairedFillWithinTransaction(tx,t,context(),{
      buyerOrderId:o.buy.orderId,sellerOrderId:o.sell.orderId,
    })),/requires DB commit constraint 013/i);
    assert.equal((await counts(db)).perp_position_applications,2);
  }finally{await db.close();}
});

test('B3 raw SQL corruption of a previously valid guarded position cannot commit',()=>run(async db=>{
  await prepare(db);const o=await reserve(db);await applySimReservedPairedFill(mgr(db),trade(o),context());
  const before=await db.query('SELECT open_cost_numerator,version FROM perp_position_snapshots WHERE account=$1',[ALICE.toLowerCase()]);
  await assert.rejects(mgr(db).withTransaction(async tx=>{
    await tx.query(`UPDATE perp_position_snapshots
      SET open_cost_numerator='99999999' WHERE account=$1`,[ALICE.toLowerCase()]);
  }),/guard|position|receipt|paired/i);
  const after=await db.query('SELECT open_cost_numerator,version FROM perp_position_snapshots WHERE account=$1',[ALICE.toLowerCase()]);
  assert.deepEqual(after.rows,before.rows);
}));

test('B3 guard on ALICE/BOB does not block an unrelated account pair in the same market',()=>run(async db=>{
  await prepare(db);await reserve(db);
  const CAROL=privateKeyToAccount(generatePrivateKey()).address;
  const DAN=privateKeyToAccount(generatePrivateKey()).address;
  const tradeOther:SimPairedFill={executionMode:'SIMULATION_ONLY',fillId:id(),
    buyerAccount:CAROL,sellerAccount:DAN,priceAtomic:'6500000',quantityAtomic:'10000000',
    buyerExpectedVersion:0,sellerExpectedVersion:0};
  const r=await applySimPairedFill(mgr(db),tradeOther,context());
  assert.equal(r.openInterest.openInterestAtomic,'110000000');
  assert.equal((await counts(db)).perp_reduce_events,0);
}));

test('B3 SQL-only mutation without journal on guarded DELETE is rejected',()=>run(async db=>{
  await prepare(db);await reserve(db);
  await assert.rejects(mgr(db).withTransaction(async tx=>{
    await tx.query('DELETE FROM perp_position_snapshots WHERE account=$1',[ALICE.toLowerCase()]);
  }));
  assert.equal((await counts(db)).perp_position_applications,2);
}));
