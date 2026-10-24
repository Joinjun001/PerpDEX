import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PGlite} from '@electric-sql/pglite';
import {privateKeyToAccount,generatePrivateKey} from 'viem/accounts';
import type {OrderTransactionManager} from '../src/orders/order-transactions.ts';
import type {PerpPositionContext,PerpPositionFill} from '../src/perp/position-engine.ts';
import type {PerpMarketConfig} from '../src/perp/market-config.ts';
import type {PerpPriceSnapshot} from '../src/perp/price-snapshot.ts';
import {applySimPerpFillToLedger} from '../src/perp/position-ledger.ts';
import {reserveSimReduceOnly,consumeSimReduceReservation,cancelSimReduceReservation,
  type SimReduceOrderRequest,type SimReduceEventRequest,SimReduceReservationError} from '../src/perp/reduce-reservations.ts';
const DOMAIN={chainId:11155111,verifyingContract:'0x1111111111111111111111111111111111111111'};
const TOKEN='0x3333333333333333333333333333333333333333';
const USER=privateKeyToAccount(generatePrivateKey()).address;
const SECOND=privateKeyToAccount(generatePrivateKey()).address;
const NOW=1800000000;
let counter=1;
const id=()=>`0x${(counter++).toString(16).padStart(64,'0')}`;
function ctx(patch:Partial<PerpMarketConfig>={},price:Partial<PerpPriceSnapshot>={}):PerpPositionContext{
  const config:PerpMarketConfig={chainId:DOMAIN.chainId,verifyingContract:DOMAIN.verifyingContract,
    market:'BTC-USD-PERP',baseAsset:'BTC',quoteAsset:'USD',collateralToken:TOKEN,
    sourceId:'reduce-fixture',oracleSourceId:'reduce-oracle',revision:1,status:'APPROVED',
    validFrom:NOW-100,validUntil:NOW+900,baseDecimals:8,priceDecimals:2,collateralDecimals:6,
    tickSize:'5',lotSize:'100',minQuantity:'100',maxQuantity:'10000000000',
    maxOpenInterest:'20000000000',initialMarginBps:1000,maintenanceMarginBps:500,
    maxLeverage:10,maxPriceDeviationBps:300,maxConfidenceBps:100,maxOracleAgeSeconds:30,...patch};
  const snapshot:PerpPriceSnapshot={chainId:config.chainId,verifyingContract:config.verifyingContract,
    market:config.market,configRevision:config.revision,sourceId:config.oracleSourceId,
    indexPrice:'6500000',markPrice:'6500000',sourceSequence:'100',publishedAt:NOW-1,
    confidenceBps:10,...price};
  return {domain:DOMAIN,config,snapshot,trustedSourceId:'reduce-fixture',nowSeconds:NOW};
}
function manager(db:PGlite):OrderTransactionManager{
  return {withTransaction:fn=>db.transaction(async tx=>fn({
    async query(sql,params=[]){const r=await tx.query(sql,[...params]);return {rows:r.rows,rowCount:r.affectedRows??null};},
  }))};
}
async function dbOpen(dir?:string){
  const db=new PGlite(dir);await db.waitReady;
  for(const migration of ['008_perp_margin_ledger','010_perp_position_ledger','012_perp_reduce_reservations']){
    await db.exec(await readFile(fileURLToPath(new URL(`../sql/${migration}.sql`,import.meta.url)),'utf8'));
  }
  return db;
}
async function seeded(db:PGlite,context=ctx(),account=USER,side:'BUY'|'SELL'='BUY',amount='100000000'){
  const c=context.config;
  for(const bucket of ['AVAILABLE','RESERVED','POSITION']){
    await db.query(`INSERT INTO perp_margin_balances
      (chain_id,verifying_contract,market,collateral_token,account,bucket,balance)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [c.chainId,c.verifyingContract.toLowerCase(),c.market,c.collateralToken.toLowerCase(),account.toLowerCase(),
        bucket,bucket==='AVAILABLE'?'1000000000':'0']);
  }
  const fill:PerpPositionFill={fillId:id(),side,account,priceAtomic:'6500000',quantityAtomic:amount,
    chainId:c.chainId,verifyingContract:c.verifyingContract,market:c.market,
    collateralToken:c.collateralToken,configRevision:c.revision,expectedVersion:0,executionMode:'SIMULATION_ONLY'};
  await applySimPerpFillToLedger(manager(db),fill,context);
}
function order(qty='40000000',options:Partial<SimReduceOrderRequest>={}):SimReduceOrderRequest{
  return {executionMode:'SIMULATION_ONLY',orderId:id(),account:USER,side:'SELL',
    priceAtomic:'6500000',orderQuantityAtomic:qty,expectedPositionVersion:1,...options};
}
function event(o:SimReduceOrderRequest,qty='10000000',patch:Partial<SimReduceEventRequest>={}):SimReduceEventRequest{
  return {executionMode:'SIMULATION_ONLY',account:o.account,orderId:o.orderId,
    eventId:id(),quantityAtomic:qty,...patch};
}
function cancelEvent(o:SimReduceOrderRequest):SimReduceEventRequest{return {...event(o),quantityAtomic:undefined};}
async function inspect(db:PGlite){
  const guard=await db.query('SELECT consumed_qty_atomic,position_size_atomic,position_version FROM perp_reduce_guards');
  const orders=await db.query('SELECT order_id,status,requested_qty_atomic,remaining_qty_atomic,consumed_qty_atomic,cancelled_qty_atomic FROM perp_reduce_orders ORDER BY order_id');
  const history=await db.query('SELECT event_id,action,quantity_atomic FROM perp_reduce_events ORDER BY event_id');
  return {guard:guard.rows as Array<{consumed_qty_atomic:string;position_size_atomic:string;position_version:number|string}>,
    orders:orders.rows as Array<{remaining_qty_atomic:string;status:string;order_id:string}>,
    history:history.rows as Array<{event_id:string;action:string;quantity_atomic:string}>};
}
async function withDb(fn:(db:PGlite)=>Promise<void>){const db=await dbOpen();try{await fn(db);}finally{await db.close();}}

test('no seeded position or no explicitly seeded margin buckets is rejected, never creates funds',()=>withDb(async db=>{
  const request=order();
  await assert.rejects(reserveSimReduceOnly(manager(db),request,ctx()),SimReduceReservationError);
  const rows=await db.query('SELECT COUNT(*)::int n FROM perp_reduce_orders');assert.equal((rows.rows[0] as {n:number})?.n,0);
  const c=ctx();
  const fill:PerpPositionFill={fillId:id(),side:'BUY',account:USER,priceAtomic:'6500000',quantityAtomic:'100000000',
    chainId:c.config.chainId,verifyingContract:c.config.verifyingContract,market:c.config.market,
    collateralToken:c.config.collateralToken,configRevision:c.config.revision,expectedVersion:0,executionMode:'SIMULATION_ONLY'};
  await applySimPerpFillToLedger(manager(db),fill,c);
  await assert.rejects(reserveSimReduceOnly(manager(db),request,c),SimReduceReservationError);
}));

test('several reduce-only orders must share one capped persistent position capacity',()=>withDb(async db=>{
  await seeded(db);
  const a=order('40000000'),b=order('50000000'),c=order('20000000');
  assert.equal((await reserveSimReduceOnly(manager(db),a,ctx())).remainingQuantityAtomic,'40000000');
  assert.equal((await reserveSimReduceOnly(manager(db),b,ctx())).remainingQuantityAtomic,'50000000');
  await assert.rejects(reserveSimReduceOnly(manager(db),c,ctx()),/capacity|exceeds position/i);
  assert.equal((await inspect(db)).orders.length,2);
}));

test('15 simultaneous competing 40% orders commit at most 2 under 1 BTC capacity',()=>withDb(async db=>{
  await seeded(db);
  const requests=Array.from({length:15},()=>order('40000000'));
  const result=await Promise.allSettled(requests.map(r=>reserveSimReduceOnly(manager(db),r,ctx())));
  assert.equal(result.filter(x=>x.status==='fulfilled').length,2);
  assert.equal(result.filter(x=>x.status==='rejected').length,13);
  assert.equal((await inspect(db)).orders.length,2);
}));

test('identical reservation replay returns same row; changed payload with same ID fails',()=>withDb(async db=>{
  await seeded(db);const a=order();
  assert.equal((await reserveSimReduceOnly(manager(db),a,ctx())).replayed,false);
  assert.equal((await reserveSimReduceOnly(manager(db),a,ctx())).replayed,true);
  await assert.rejects(reserveSimReduceOnly(manager(db),{...a,orderQuantityAtomic:'30000000'},ctx()),SimReduceReservationError);
  assert.equal((await inspect(db)).orders.length,1);
}));

test('partial consumption followed by cancellation preserves consumed quota but releases unconsumed',()=>withDb(async db=>{
  await seeded(db);const a=order('70000000');
  await reserveSimReduceOnly(manager(db),a,ctx());
  const consume=event(a,'20000000');
  const partial=await consumeSimReduceReservation(manager(db),consume,ctx());
  assert.equal(partial.remainingQuantityAtomic,'50000000');
  assert.equal(partial.consumedQuantityAtomic,'20000000');
  const cancelled=await cancelSimReduceReservation(manager(db),cancelEvent(a),ctx());
  assert.equal(cancelled.status,'CANCELLED');
  assert.equal(cancelled.remainingQuantityAtomic,'0');
  assert.equal(cancelled.cancelledQuantityAtomic,'50000000');
  assert.equal((await inspect(db)).guard[0]?.consumed_qty_atomic,'20000000');
  const b=order('80000000');
  await reserveSimReduceOnly(manager(db),b,ctx());
  await assert.rejects(reserveSimReduceOnly(manager(db),order('10000000'),ctx()));
}));

test('duplicate consume cannot release capacity twice; eventId reuse across orders forbidden',()=>withDb(async db=>{
  await seeded(db);const a=order('60000000');await reserveSimReduceOnly(manager(db),a,ctx());
  const f=event(a,'30000000');
  assert.equal((await consumeSimReduceReservation(manager(db),f,ctx())).replayed,false);
  assert.equal((await consumeSimReduceReservation(manager(db),f,ctx())).replayed,true);
  assert.equal((await inspect(db)).guard[0]?.consumed_qty_atomic,'30000000');
  await assert.rejects(consumeSimReduceReservation(manager(db),{...f,quantityAtomic:'10000000'},ctx()));
  await assert.rejects(consumeSimReduceReservation(manager(db),event(a,'101'),ctx()),/lot size/);
  const b=order('50000000');await assert.rejects(reserveSimReduceOnly(manager(db),b,ctx()));
  const c=order('10000000');await reserveSimReduceOnly(manager(db),c,ctx());
  await assert.rejects(consumeSimReduceReservation(manager(db),{...f,orderId:c.orderId},ctx()));
}));

test('cancel replay is idempotent; repeated cancellation with new ID never releases twice',()=>withDb(async db=>{
  await seeded(db);const a=order('60000000');await reserveSimReduceOnly(manager(db),a,ctx());
  const cancellation=cancelEvent(a);
  assert.equal((await cancelSimReduceReservation(manager(db),cancellation,ctx())).replayed,false);
  assert.equal((await cancelSimReduceReservation(manager(db),cancellation,ctx())).replayed,true);
  await assert.rejects(cancelSimReduceReservation(manager(db),cancelEvent(a),ctx()));
  assert.equal((await inspect(db)).history.length,1);
  await assert.rejects(cancelSimReduceReservation(manager(db),event(a),ctx()),/must not specify/);
  await reserveSimReduceOnly(manager(db),order('100000000'),ctx());
}));

test('race cancel vs consume: exactly one action wins, no overconsumption or duplicate release',()=>withDb(async db=>{
  await seeded(db);const a=order('60000000');await reserveSimReduceOnly(manager(db),a,ctx());
  const [x,y]=await Promise.allSettled([
    cancelSimReduceReservation(manager(db),cancelEvent(a),ctx()),
    consumeSimReduceReservation(manager(db),event(a,'60000000'),ctx()),
  ]);
  assert.equal([x,y].filter(v=>v.status==='fulfilled').length,1);
  const state=await inspect(db);
  assert.equal(state.history.length,1);
  assert.equal(state.orders[0]?.remaining_qty_atomic,'0');
  const consumed=BigInt(String(state.guard[0]?.consumed_qty_atomic));
  assert.ok(consumed===0n||consumed===60000000n);
}));

test('snapshot sequence and margin bucket version changes prohibit using old reservation to consume',()=>withDb(async db=>{
  await seeded(db);const a=order();await reserveSimReduceOnly(manager(db),a,ctx());
  await assert.rejects(consumeSimReduceReservation(manager(db),event(a),ctx({}, {sourceSequence:'101'})),/oracle or margin changed/);
  await db.query(`UPDATE perp_margin_balances SET version=version+1 WHERE bucket='AVAILABLE'`);
  await assert.rejects(consumeSimReduceReservation(manager(db),event(a),ctx()),/oracle or margin changed/);
  assert.equal((await inspect(db)).orders[0]?.remaining_qty_atomic,'40000000');
  // Emergency cancel can release outstanding reservation even after oracle/margin drift.
  assert.equal((await cancelSimReduceReservation(manager(db),cancelEvent(a),ctx({}, {sourceSequence:'101'}))).status,'CANCELLED');
}));

test('position version change invalidates capacity rather than reusing old quote',()=>withDb(async db=>{
  await seeded(db);const a=order();await reserveSimReduceOnly(manager(db),a,ctx());
  await db.query(`UPDATE perp_position_snapshots SET version=version+1,last_fill_id=$1 WHERE account=$2`,[id(),USER.toLowerCase()]);
  await assert.rejects(consumeSimReduceReservation(manager(db),event(a),ctx()));
  await assert.rejects(reserveSimReduceOnly(manager(db),order(),ctx()));
}));

test('forced SQL event insert failure rolls back remaining quantity and guard consumption',()=>withDb(async db=>{
  await seeded(db);const a=order();await reserveSimReduceOnly(manager(db),a,ctx());
  const consume=event(a,'10000000');
  await db.exec(`ALTER TABLE perp_reduce_events ADD CONSTRAINT qa_reject_event CHECK (event_id <> '${consume.eventId}')`);
  await assert.rejects(consumeSimReduceReservation(manager(db),consume,ctx()));
  assert.equal((await inspect(db)).orders[0]?.remaining_qty_atomic,'40000000');
  assert.equal((await inspect(db)).guard[0]?.consumed_qty_atomic,'0');
  await db.exec('ALTER TABLE perp_reduce_events DROP CONSTRAINT qa_reject_event');
  assert.equal((await consumeSimReduceReservation(manager(db),consume,ctx())).remainingQuantityAtomic,'30000000');
}));

test('append-only events refuse UPDATE/DELETE even without TypeScript service',()=>withDb(async db=>{
  await seeded(db);const a=order();await reserveSimReduceOnly(manager(db),a,ctx());
  const consume=event(a);await consumeSimReduceReservation(manager(db),consume,ctx());
  await assert.rejects(db.query(`DELETE FROM perp_reduce_events WHERE event_id=$1`,[consume.eventId]),/append-only/);
  await assert.rejects(db.query(`UPDATE perp_reduce_events SET quantity_atomic='1' WHERE event_id=$1`,[consume.eventId]),/append-only/);
}));

test('SHORT reduce-only BUY works with same quota; market/account scope separated',()=>withDb(async db=>{
  await seeded(db,ctx(),USER,'SELL');await seeded(db,ctx(),SECOND,'BUY');
  const a=order('40000000',{side:'BUY'});
  assert.equal((await reserveSimReduceOnly(manager(db),a,ctx())).status,'OPEN');
  const second=order('100000000',{account:SECOND});
  assert.equal((await reserveSimReduceOnly(manager(db),second,ctx())).status,'OPEN');
  assert.equal((await inspect(db)).orders.length,2);
}));

test('invalid order/status/market context fails closed and cannot alter quantity',()=>withDb(async db=>{
  await seeded(db);const a=order();await reserveSimReduceOnly(manager(db),a,ctx());
  for(const patch of [{executionMode:'LIVE' as 'SIMULATION_ONLY'},{side:'BUY' as const},
    {orderQuantityAtomic:'150000000'},{priceAtomic:'7500000'},
    {expectedPositionVersion:0},{account:SECOND},{orderId:'bad'}]){
    await assert.rejects(reserveSimReduceOnly(manager(db),{...a,...patch},ctx()));
  }
  await assert.rejects(reserveSimReduceOnly(manager(db),order(),ctx({status:'DRAFT'})));
  await assert.rejects(reserveSimReduceOnly(manager(db),order(),ctx({}, {publishedAt:NOW-100})));
  assert.equal((await inspect(db)).orders.length,1);
}));

test('disk close/reopen preserves consumed quota and replay fences',{timeout:45000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'perpdex-reduce-'));let db:PGlite|undefined;
  try{
    db=await dbOpen(dir);await seeded(db);
    const a=order('60000000');await reserveSimReduceOnly(manager(db),a,ctx());
    const f=event(a,'20000000');await consumeSimReduceReservation(manager(db),f,ctx());
    const cancel=cancelEvent(a);await cancelSimReduceReservation(manager(db),cancel,ctx());
    await db.close();db=undefined;
    db=await dbOpen(dir);
    assert.equal((await inspect(db)).guard[0]?.consumed_qty_atomic,'20000000');
    assert.equal((await consumeSimReduceReservation(manager(db),f,ctx())).replayed,true);
    assert.equal((await cancelSimReduceReservation(manager(db),cancel,ctx())).replayed,true);
    await reserveSimReduceOnly(manager(db),order('80000000'),ctx());
    await assert.rejects(reserveSimReduceOnly(manager(db),order('100'),ctx()));
  }finally{if(db)await db.close();await rm(dir,{recursive:true,force:true});}
});
