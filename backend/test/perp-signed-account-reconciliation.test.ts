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
    '017_perp_signed_pair_executions']){
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




test('C3-A read-only reconciliation reports paired OPEN reserves and flat mark, no writes',()=>run(async db=>{
 const p=await create(db);
 const before=await counts(db);
 const a=await reconcileSignedSimAccount(alice.address,context(),manager(db));
 const b=await reconcileSignedSimAccount(bob.address,context(),manager(db));
 const initial=(await db.query('SELECT initial_margin FROM perp_sim_orders WHERE account=$1',
   [alice.address.toLowerCase()])).rows[0] as {initial_margin:string};
 assert.equal(a.executionAuthorized,false);assert.equal(b.executionAuthorized,false);
 assert.equal(a.openOrderCount,1);assert.equal(a.filledOrderCount,0);
 assert.equal(a.openReservationLiabilityAtomic,initial.initial_margin);
 assert.equal(a.terminalAllocationLiabilityAtomic,'0');
 assert.equal(a.balances.reserved,initial.initial_margin);
 assert.equal(a.positionSizeSignedAtomic,'0');
 assert.equal(a.realizedPnlAtomic,'0');assert.equal(a.unrealizedPnlAtomic,'0');
 assert.equal(a.feesAndFunding,'NOT_ACCOUNTED');
 assert.deepEqual(await counts(db),before);
 void p;
}));
test('C3-A after signed paired FILLED returns durable M3 allocation and zero unbooked PnL',()=>run(async db=>{
 const p=await create(db,context(),'6565000','6435000');
 await preparePersistedSignedSimPerpPair(p,context(),manager(db));
 await executePreparedSignedSimPair(p,context(),manager(db));
 const before=await counts(db);
 for(const [a,side] of [[alice,'100000000'],[bob,'-100000000']] as const){
   const got=await reconcileSignedSimAccount(a.address,context(),manager(db));
   assert.equal(got.filledOrderCount,1);
   assert.equal(got.openOrderCount,0);
   assert.equal(got.openReservationLiabilityAtomic,'0');
   assert.equal(got.terminalAllocationLiabilityAtomic,got.balances.positionMargin);
   assert.equal(got.balances.reserved,'0');
   assert.equal(got.positionSizeSignedAtomic,side);
   assert.equal(got.positionVersion,1);
   assert.equal(got.realizedPnlNumerator,'0');
   assert.equal(got.unclassifiedPositionMarginAtomic,'0');
 }
 assert.deepEqual(await counts(db),before);
}));
test('C3-A signed cancellation releases pending obligation while the other side remains OPEN',()=>run(async db=>{
 const p=await create(db);
 const q=await db.query('SELECT order_id FROM perp_sim_orders WHERE account=$1',[alice.address.toLowerCase()]);
 const input={account:alice.address,nonce:p.buyer.input.nonce,
  orderId:(q.rows[0] as {order_id:string}).order_id,deadline:NOW+300,
  executionMode:'SIMULATION_ONLY' as const};
 const sig=await alice.signTypedData(buildSimPerpCancelTypedData(input,domain,NOW));
 await cancelSimPerpOrder(input,sig,domain,manager(db),NOW);
 const report=await reconcileSignedSimAccount(alice.address,context(),manager(db));
 assert.equal(report.canceledOrderCount,1);assert.equal(report.openOrderCount,0);
 assert.equal(report.openReservationLiabilityAtomic,'0');
 assert.equal(report.balances.reserved,'0');
 const b=await reconcileSignedSimAccount(bob.address,context(),manager(db));
 assert.equal(b.openOrderCount,1);
}));
test('C3-A multiple signed OPEN reservations sum exactly, repeated audit is idempotent',()=>run(async db=>{
 await create(db);
 const second=order(context(),alice.address,'102','BUY','6530000');
 const sig=await alice.signTypedData(buildSimPerpOrderTypedData(second,domain,NOW));
 await admitSimPerpOrder(second,sig,domain,manager(db),context().config,
   context().trustedSourceId,context().snapshot,NOW);
 const before=await counts(db);
 const [one,two,three]=await Promise.all(Array.from({length:3},
   ()=>reconcileSignedSimAccount(alice.address,context(),manager(db))));
 assert.deepEqual(one,two);assert.deepEqual(two,three);
 assert.equal(one.openOrderCount,2);
 assert.equal(one.openReservationLiabilityAtomic,one.balances.reserved);
 assert.equal(one.nonSignedReservedAtomic,'0');
 assert.deepEqual(await counts(db),before);
}));
test('C3-A historical FILLED obligation and new OPEN reserve are distinguished',()=>run(async db=>{
 const p=await create(db);
 await preparePersistedSignedSimPerpPair(p,context(),manager(db));
 await executePreparedSignedSimPair(p,context(),manager(db));
 const second=order(context(),alice.address,'102','BUY','6530000');
 const sig=await alice.signTypedData(buildSimPerpOrderTypedData(second,domain,NOW));
 await admitSimPerpOrder(second,sig,domain,manager(db),context().config,
  context().trustedSourceId,context().snapshot,NOW);
 const report=await reconcileSignedSimAccount(alice.address,context(),manager(db));
 assert.equal(report.filledOrderCount,1);assert.equal(report.openOrderCount,1);
 assert.equal(report.terminalAllocationLiabilityAtomic,report.balances.positionMargin);
 assert.equal(report.openReservationLiabilityAtomic,report.balances.reserved);
 assert.equal(report.nonSignedReservedAtomic,'0');
}));
test('C3-A invalid market context, account, and stale oracle fail without mutation',()=>run(async db=>{
 await create(db);
 const before=await counts(db);
 await assert.rejects(reconcileSignedSimAccount('not-an-address',context(),manager(db)),/account/i);
 await assert.rejects(reconcileSignedSimAccount(alice.address,
  {...context(),snapshot:{...context().snapshot,sourceSequence:'0',publishedAt:NOW-100}},
  manager(db)),/oracle|stale|sequence/i);
 const bad={...context(),config:{...context().config,revision:2}};
 await assert.rejects(reconcileSignedSimAccount(alice.address,bad,manager(db)),/revision|config|policy/i);
 assert.deepEqual(await counts(db),before);
}));
test('C3-A injected SQL failure rolls back read-only audit and retains M3/M4 state',()=>run(async db=>{
 await create(db);const before=await counts(db);
 const broken:OrderTransactionManager={withTransaction:fn=>manager(db).withTransaction(tx=>fn({
  query:(sql,args)=>{if(sql.includes('FROM perp_margin_entries'))throw Error('injected audit failure');
   return tx.query(sql,args);},
 }))};
 await assert.rejects(reconcileSignedSimAccount(alice.address,context(),broken),/injected audit failure/);
 assert.deepEqual(await counts(db),before);
 const good=await reconcileSignedSimAccount(alice.address,context(),manager(db));
 assert.equal(good.openOrderCount,1);
}));
test('C3-A committed signed RESERVED tampering is blocked by SQL 015 and audit stays valid',()=>run(async db=>{
 await create(db);
 await assert.rejects(db.query(`UPDATE perp_margin_balances SET balance='0' WHERE account=$1 AND bucket='RESERVED'`,
   [alice.address.toLowerCase()]),/signed OPEN margin reservation exceeds/i);
 const report=await reconcileSignedSimAccount(alice.address,context(),manager(db));
 assert.equal(report.openReservationLiabilityAtomic,report.balances.reserved);
}));

test('C3-A rejects forged signed cancellation without append-only RELEASE receipt',()=>run(async db=>{
 await create(db);
 await db.transaction(async tx=>{
   await tx.query("UPDATE order_nonces SET status='CANCELED' WHERE account=$1",
     [alice.address.toLowerCase()]);
   await tx.query("UPDATE perp_sim_orders SET status='CANCELED' WHERE account=$1",
     [alice.address.toLowerCase()]);
 });
 await assert.rejects(reconcileSignedSimAccount(alice.address,context(),manager(db)),
   /cancellation missing matching M3 RELEASE/i);
 const bad=(await db.query('SELECT balance FROM perp_margin_balances WHERE account=$1 AND bucket=$2',
   [alice.address.toLowerCase(),'RESERVED'])).rows[0] as {balance:string};
 assert.ok(BigInt(bad.balance)>0n);
}));
