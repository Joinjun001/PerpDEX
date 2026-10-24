import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import type {OrderTransactionManager} from '../src/orders/order-transactions.ts';
import type {PerpPositionContext} from '../src/perp/position-engine.ts';
import {hashPerpMarketConfig,buildSimPerpOrderTypedData,admitSimPerpOrder,
  buildSimPerpCancelTypedData,cancelSimPerpOrder,type SimPerpOrderInput} from '../src/perp/sim-order.ts';
import {assessPersistedSignedSimPerpPair,preparePersistedSignedSimPerpPair,type SignedSimPairCandidate} from '../src/perp/signed-sim-pair-gate.ts';
import {applySimPairedFill} from '../src/perp/paired-clearing.ts';
import {executePreparedSignedSimPair} from '../src/perp/signed-sim-pair-execution.ts';
import {reconcileSignedSimAccount} from '../src/perp/signed-sim-account-reconciliation.ts';
import {inspectSignedSimFillProgress} from '../src/perp/signed-sim-fill-progress.ts';

const NOW=1800000000;
const domain={chainId:11155111,verifyingContract:'0x1111111111111111111111111111111111111111'};
const token='0x3333333333333333333333333333333333333333';
const alice=privateKeyToAccount(generatePrivateKey()),bob=privateKeyToAccount(generatePrivateKey());
function context():PerpPositionContext{return {domain,nowSeconds:NOW,trustedSourceId:'pair-fixture',
  config:{chainId:domain.chainId,verifyingContract:domain.verifyingContract,market:'BTC-USD-PERP',
    baseAsset:'BTC',quoteAsset:'USD',collateralToken:token,sourceId:'pair-fixture',
    oracleSourceId:'pair-oracle',revision:1,status:'APPROVED',validFrom:NOW-100,
    validUntil:NOW+500,baseDecimals:8,priceDecimals:2,collateralDecimals:6,
    tickSize:'5',lotSize:'100',minQuantity:'100',maxQuantity:'10000000000',
    maxOpenInterest:'20000000000',initialMarginBps:1000,maintenanceMarginBps:500,
    maxLeverage:10,maxPriceDeviationBps:300,maxConfidenceBps:100,maxOracleAgeSeconds:30},
  snapshot:{chainId:domain.chainId,verifyingContract:domain.verifyingContract,
    market:'BTC-USD-PERP',configRevision:1,sourceId:'pair-oracle',indexPrice:'6500000',
    markPrice:'6500000',publishedAt:NOW-1,sourceSequence:'101',confidenceBps:10}};}
function order(ctx:PerpPositionContext,account:string,nonce:string,side:'BUY'|'SELL',
  price='6500000'):SimPerpOrderInput{return {account,nonce,side,market:ctx.config.market,
    price,quantity:'100000000',expiresAt:NOW+200,configRevision:1,
    marketConfigHash:hashPerpMarketConfig(ctx.config),collateralToken:token,
    reduceOnly:false,marginMode:'ISOLATED',executionMode:'SIMULATION_ONLY'};}
function manager(db:PGlite):OrderTransactionManager{return {withTransaction:fn=>db.transaction(
  async tx=>fn({async query(sql,args=[]){const q=await tx.query(sql,[...args]);
    return {rows:q.rows,rowCount:q.affectedRows??null};}}))};}
async function open(dir?:string){const db=new PGlite(dir);await db.waitReady;
  for(const file of ['001_order_nonces','008_perp_margin_ledger','009_perp_sim_orders',
    '010_perp_position_ledger','011_perp_pair_clearing','012_perp_reduce_reservations',
    '013_perp_guarded_position_commit','014_perp_reduce_ledger_integrity',
    '015_perp_signed_opening_fence','016_perp_signed_pair_preparations',
    '017_perp_signed_pair_executions',
    '018_perp_signed_cancel_integrity',
    '019_perp_signed_order_fill_progress',
    '020_perp_signed_account_margin_conservation']){
    await db.exec(await readFile(fileURLToPath(new URL(`../sql/${file}.sql`,import.meta.url)),'utf8'));
  }
  await db.query(`INSERT INTO perp_market_open_interest(chain_id,verifying_contract,market,
    collateral_token,config_revision,mode,open_interest_atomic)
    VALUES($1,$2,'BTC-USD-PERP',$3,1,'PAIRED','0')`,[domain.chainId,domain.verifyingContract,token]);
  for(const user of [alice,bob]){
    for(const bucket of ['AVAILABLE','POSITION','RESERVED']){
      await db.query(`INSERT INTO perp_margin_balances
        (chain_id,verifying_contract,market,collateral_token,account,bucket,balance)
        VALUES($1,$2,'BTC-USD-PERP',$3,$4,$5,$6)`,
        [domain.chainId,domain.verifyingContract,token,user.address.toLowerCase(),
          bucket,bucket==='AVAILABLE'?'100000000000':'0']);
    }
  }
  return db;
}
async function create(db:PGlite,ctx=context(),buyPrice='6500000',sellPrice='6500000'){
  const buyer=order(ctx,alice.address,'101','BUY',buyPrice);
  const seller=order(ctx,bob.address,'101','SELL',sellPrice);
  const bSig=await alice.signTypedData(buildSimPerpOrderTypedData(buyer,ctx.domain,NOW));
  const sSig=await bob.signTypedData(buildSimPerpOrderTypedData(seller,ctx.domain,NOW));
  await admitSimPerpOrder(buyer,bSig,ctx.domain,manager(db),ctx.config,ctx.trustedSourceId,ctx.snapshot,NOW);
  await admitSimPerpOrder(seller,sSig,ctx.domain,manager(db),ctx.config,ctx.trustedSourceId,ctx.snapshot,NOW);
  const pair:SignedSimPairCandidate={executionMode:'SIMULATION_ONLY',fillId:'0x'+'6'.repeat(64),
    priceAtomic:'6500000',quantityAtomic:'100000000',
    buyer:{input:buyer,signature:bSig,expectedPositionVersion:0},
    seller:{input:seller,signature:sSig,expectedPositionVersion:0}};
  return pair;
}
async function counts(db:PGlite){
  const rows=[] as number[];
  for(const table of ['perp_margin_operations','perp_margin_entries','perp_sim_orders',
    'perp_position_applications','perp_sim_paired_fills']){
    const q=await db.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
    rows.push((q.rows[0] as {n:number}).n);
  }
  return rows;
}
async function run(fn:(db:PGlite)=>Promise<void>){const db=await open();try{await fn(db);}finally{await db.close();}}
const prove=(db:PGlite,p:SignedSimPairCandidate,ctx=context(),m=manager(db))=>
  assessPersistedSignedSimPerpPair(p,ctx,m);





async function idFor(db:PGlite,who=alice){
 const q=await db.query('SELECT order_id FROM perp_sim_orders WHERE account=$1 ORDER BY nonce LIMIT 1',
 [who.address.toLowerCase()]);
 return (q.rows[0] as {order_id:string}).order_id;
}
test('C3-C1 OPEN signed order projects 0 filled, all unfilled/executable; PREPARED is not a fill',()=>run(async db=>{
 const p=await create(db);
 const id=await idFor(db);
 const before=await counts(db);
 const initial=await inspectSignedSimFillProgress(id,domain,manager(db));
 assert.equal(initial.status,'OPEN');
 assert.equal(initial.totalQuantityAtomic,'100000000');
 assert.equal(initial.cumulativeFilledQuantityAtomic,'0');
 assert.equal(initial.unfilledQuantityAtomic,'100000000');
 assert.equal(initial.executableRemainingQuantityAtomic,'100000000');
 assert.equal(initial.committedFillCount,0);
 assert.equal(initial.partialFillsAuthorized,false);
 assert.equal(initial.executionAuthorized,false);
 await preparePersistedSignedSimPerpPair(p,context(),manager(db));
 const after=await inspectSignedSimFillProgress(id,domain,manager(db));
 assert.deepEqual(after,initial);
 assert.deepEqual(await counts(db),before);
}));
test('C3-C1 two FULL terminal legs become 1 committed fill and 0 unfilled each',()=>run(async db=>{
 const p=await create(db);
 await preparePersistedSignedSimPerpPair(p,context(),manager(db));
 await executePreparedSignedSimPair(p,context(),manager(db));
 const before=await counts(db);
 for(const party of [alice,bob]){
  const report=await inspectSignedSimFillProgress(await idFor(db,party),domain,manager(db));
  assert.equal(report.status,'FILLED');
  assert.equal(report.committedFillCount,1);
  assert.equal(report.cumulativeFilledQuantityAtomic,report.totalQuantityAtomic);
  assert.equal(report.unfilledQuantityAtomic,'0');
  assert.equal(report.executableRemainingQuantityAtomic,'0');
 }
 assert.deepEqual(await counts(db),before);
 await assert.rejects(executePreparedSignedSimPair(p,context(),manager(db)),/already committed|shadow|stale/i);
}));
test('C3-C1 cancellation leaves unfilled original quantity but revokes executable remainder',()=>run(async db=>{
 const p=await create(db);
 const id=await idFor(db);
 const c={account:alice.address,nonce:p.buyer.input.nonce,orderId:id,
   deadline:NOW+300,executionMode:'SIMULATION_ONLY' as const};
 const sig=await alice.signTypedData(buildSimPerpCancelTypedData(c,domain,NOW));
 await cancelSimPerpOrder(c,sig,domain,manager(db),NOW);
 const result=await inspectSignedSimFillProgress(id,domain,manager(db));
 assert.equal(result.status,'CANCELED');
 assert.equal(result.committedFillCount,0);
 assert.equal(result.cumulativeFilledQuantityAtomic,'0');
 assert.equal(result.unfilledQuantityAtomic,'100000000');
 assert.equal(result.executableRemainingQuantityAtomic,'0');
 assert.equal((await inspectSignedSimFillProgress(await idFor(db,bob),domain,manager(db))).status,'OPEN');
}));
test('C3-C1 multiple OPEN orders remain separate canonical quantity liabilities',()=>run(async db=>{
 await create(db);
 const second=order(context(),alice.address,'102','BUY','6530000');
 const sig=await alice.signTypedData(buildSimPerpOrderTypedData(second,domain,NOW));
 const admission=await admitSimPerpOrder(second,sig,domain,manager(db),
  context().config,context().trustedSourceId,context().snapshot,NOW);
 const q=await db.query('SELECT order_id FROM perp_sim_orders WHERE account=$1 ORDER BY nonce',
  [alice.address.toLowerCase()]);
 assert.equal(q.rows.length,2);
 const statuses=await Promise.all((q.rows as Array<{order_id:string}>)
  .map(x=>inspectSignedSimFillProgress(x.order_id,domain,manager(db))));
 assert.ok(statuses.every(x=>x.status==='OPEN'&&x.committedFillCount===0));
 assert.equal(statuses.reduce((a,x)=>a+BigInt(x.executableRemainingQuantityAtomic),0n),200000000n);
 assert.equal(statuses[1].orderId,admission.orderId);
}));
test('C3-C1 concurrent read and signed cancel leave only valid terminal or OPEN projection',()=>run(async db=>{
 await create(db); const id=await idFor(db);
 const c={account:alice.address,nonce:'101',orderId:id,deadline:NOW+300,
   executionMode:'SIMULATION_ONLY' as const};
 const sig=await alice.signTypedData(buildSimPerpCancelTypedData(c,domain,NOW));
 const attempts=await Promise.allSettled([
   inspectSignedSimFillProgress(id,domain,manager(db)),
   cancelSimPerpOrder(c,sig,domain,manager(db),NOW),
   inspectSignedSimFillProgress(id,domain,manager(db)),
 ]);
 assert.equal(attempts.filter(x=>x.status==='rejected').length,0);
 const readings=[attempts[0],attempts[2]].map(x=>(x as PromiseFulfilledResult<Awaited<
  ReturnType<typeof inspectSignedSimFillProgress>>>).value);
 assert.ok(readings.every(x=>x.status==='OPEN'||x.status==='CANCELED'));
 assert.equal((await inspectSignedSimFillProgress(id,domain,manager(db))).status,'CANCELED');
}));
test('C3-C1 direct SQL signed quantity tampering rejected by immutable order fence',()=>run(async db=>{
 await create(db);const id=await idFor(db);
 await assert.rejects(db.query("UPDATE perp_sim_orders SET quantity='1' WHERE order_id=$1",[id]),
  /identity is immutable/i);
 const result=await inspectSignedSimFillProgress(id,domain,manager(db));
 assert.equal(result.totalQuantityAtomic,'100000000');
}));
test('C3-C1 direct SQL FILLED status without a terminal receipt fails atomically',()=>run(async db=>{
 await create(db);const id=await idFor(db);
 const before=await counts(db);
 await assert.rejects(db.query("UPDATE perp_sim_orders SET status='FILLED' WHERE order_id=$1",[id]),
  /terminal execution receipt/i);
 assert.deepEqual(await counts(db),before);
 assert.equal((await inspectSignedSimFillProgress(id,domain,manager(db))).status,'OPEN');
}));
test('C3-C1 mid-query injected SQL failure has no persisted state effect',()=>run(async db=>{
 await create(db);const id=await idFor(db);const before=await counts(db);
 const broken:OrderTransactionManager={withTransaction:fn=>manager(db).withTransaction(tx=>fn({
  query:(sql,args)=>{if(sql.includes('FROM perp_signed_order_fill_progress')){
    throw new Error('injected projection read error');}
   return tx.query(sql,args);},
 }))};
 await assert.rejects(inspectSignedSimFillProgress(id,domain,broken),/injected projection read error/i);
 assert.deepEqual(await counts(db),before);
 assert.equal((await inspectSignedSimFillProgress(id,domain,manager(db))).status,'OPEN');
}));
test('C3-C1 SQL 019 can be reapplied after committed FULL and CANCELED records',()=>run(async db=>{
 const p=await create(db);
 await preparePersistedSignedSimPerpPair(p,context(),manager(db));
 await executePreparedSignedSimPair(p,context(),manager(db));
 const second=order(context(),alice.address,'103','BUY','6530000');
 const signed=await alice.signTypedData(buildSimPerpOrderTypedData(second,domain,NOW));
 const admitted=await admitSimPerpOrder(second,signed,domain,manager(db),context().config,
   context().trustedSourceId,context().snapshot,NOW);
 const cancel={account:alice.address,nonce:second.nonce,orderId:admitted.orderId,
   deadline:NOW+300,executionMode:'SIMULATION_ONLY' as const};
 const cancellationSignature=await alice.signTypedData(buildSimPerpCancelTypedData(cancel,domain,NOW));
 await cancelSimPerpOrder(cancel,cancellationSignature,domain,manager(db),NOW);
 const sql=await readFile(fileURLToPath(new URL('../sql/019_perp_signed_order_fill_progress.sql',import.meta.url)),'utf8');
 await db.exec(sql);
 const a=await inspectSignedSimFillProgress(await idFor(db),domain,manager(db));
 assert.equal(a.status,'FILLED'); assert.equal(a.committedFillCount,1);
 const c=await inspectSignedSimFillProgress(admitted.orderId,domain,manager(db));
 assert.equal(c.status,'CANCELED');assert.equal(c.executableRemainingQuantityAtomic,'0');
}));
