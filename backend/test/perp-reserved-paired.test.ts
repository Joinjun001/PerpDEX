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
import {applySimPairedFill,verifySimMarketOpenInterest,type SimPairedFill} from '../src/perp/paired-clearing.ts';
import {applySimReservedPairedFill,type SimReservedPairedFill} from '../src/perp/reserved-paired-clearing.ts';
import {reserveSimReduceOnly,type SimReduceOrderRequest,consumeSimReduceReservation} from '../src/perp/reduce-reservations.ts';
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
  for(const name of ['008_perp_margin_ledger','010_perp_position_ledger','011_perp_pair_clearing','012_perp_reduce_reservations']){
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
