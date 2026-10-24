import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {buildSimPerpOrderTypedData,buildSimPerpCancelTypedData,
  admitSimPerpOrder,cancelSimPerpOrder,hashPerpMarketConfig,type SimPerpOrderInput} from '../src/perp/sim-order.ts';
import {assessPersistedSignedSimPerpOrder} from '../src/perp/signed-sim-risk-gate.ts';
import type {PerpPositionContext} from '../src/perp/position-engine.ts';
import type {OrderTransactionManager} from '../src/orders/order-transactions.ts';
import {applySimPairedFill} from '../src/perp/paired-clearing.ts';

const NOW=1800000000;
const domain={chainId:11155111,verifyingContract:'0x1111111111111111111111111111111111111111'};
const token='0x3333333333333333333333333333333333333333';
const source='signed-gate-fixture';
const alice=privateKeyToAccount(generatePrivateKey());
const bob=privateKeyToAccount(generatePrivateKey());
function context():PerpPositionContext{return {domain,nowSeconds:NOW,trustedSourceId:source,
  config:{chainId:domain.chainId,verifyingContract:domain.verifyingContract,
    market:'BTC-USD-PERP',baseAsset:'BTC',quoteAsset:'USD',collateralToken:token,
    sourceId:source,oracleSourceId:'gate-oracle',revision:1,status:'APPROVED',
    validFrom:NOW-100,validUntil:NOW+500,baseDecimals:8,priceDecimals:2,
    collateralDecimals:6,tickSize:'5',lotSize:'100',minQuantity:'100',
    maxQuantity:'10000000000',maxOpenInterest:'20000000000',initialMarginBps:1000,
    maintenanceMarginBps:500,maxLeverage:10,maxPriceDeviationBps:300,
    maxConfidenceBps:100,maxOracleAgeSeconds:30},
  snapshot:{chainId:domain.chainId,verifyingContract:domain.verifyingContract,
    market:'BTC-USD-PERP',configRevision:1,sourceId:'gate-oracle',
    indexPrice:'6500000',markPrice:'6500000',publishedAt:NOW-1,
    sourceSequence:'101',confidenceBps:10}};}
function order(ctx=context(),account=alice.address,nonce='101'):
  SimPerpOrderInput{return {account,nonce,side:'BUY',market:ctx.config.market,
    price:'6500000',quantity:'100000000',expiresAt:NOW+200,
    configRevision:ctx.config.revision,marketConfigHash:hashPerpMarketConfig(ctx.config),
    collateralToken:ctx.config.collateralToken,reduceOnly:false,
    marginMode:'ISOLATED',executionMode:'SIMULATION_ONLY'};}
function manager(db:PGlite):OrderTransactionManager{return {withTransaction:fn=>db.transaction(
  async tx=>fn({async query(sql,args=[]){const q=await tx.query(sql,[...args]);
    return {rows:q.rows,rowCount:q.affectedRows??null};}}))};}
async function open(dir?:string){const db=new PGlite(dir);await db.waitReady;
  for(const name of ['001_order_nonces','008_perp_margin_ledger','009_perp_sim_orders',
    '010_perp_position_ledger','011_perp_pair_clearing','012_perp_reduce_reservations',
    '013_perp_guarded_position_commit','014_perp_reduce_ledger_integrity']){
    await db.exec(await readFile(fileURLToPath(new URL(`../sql/${name}.sql`,import.meta.url)),'utf8'));
  }return db;}
async function fixture(db:PGlite,account=alice.address,amount='100000000000'){
  await db.query(`INSERT INTO perp_market_open_interest (chain_id,verifying_contract,
    market,collateral_token,config_revision,mode,open_interest_atomic)
    VALUES($1,$2,'BTC-USD-PERP',$3,1,'PAIRED','0') ON CONFLICT DO NOTHING`,
    [domain.chainId,domain.verifyingContract,token]);
  for(const bucket of ['AVAILABLE','POSITION','RESERVED'])await db.query(
    `INSERT INTO perp_margin_balances(chain_id,verifying_contract,market,collateral_token,account,bucket,balance)
     VALUES($1,$2,'BTC-USD-PERP',$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
    [domain.chainId,domain.verifyingContract,token,account.toLowerCase(),bucket,
      bucket==='AVAILABLE'?amount:'0']);
}
async function sign(o:SimPerpOrderInput,signer=alice,ctx=context()){
  return signer.signTypedData(buildSimPerpOrderTypedData(o,ctx.domain,NOW));
}
async function admit(db:PGlite,o:SimPerpOrderInput,signature:string,ctx=context()){
  return admitSimPerpOrder(o,signature,ctx.domain,manager(db),ctx.config,source,ctx.snapshot,NOW);
}
async function assess(db:PGlite,o:SimPerpOrderInput,signature:string,ctx=context(),
  quantity=o.quantity,version=0){return assessPersistedSignedSimPerpOrder(o,signature,ctx,manager(db),quantity,version);}
async function readOnlyCounts(db:PGlite){const tables=['perp_sim_orders','perp_margin_operations',
  'perp_position_applications','perp_sim_paired_fills'];
  const values:number[]=[];for(const table of tables){const q=await db.query(`SELECT COUNT(*)::int n FROM ${table}`);
    values.push(Number((q.rows[0] as {n:number}).n));}return values;}
async function run(fn:(db:PGlite)=>Promise<void>){const db=await open();try{await fn(db);}finally{await db.close();}}

test('C1 v2 signed opening order: one transaction proves M3 journal, nonce, policy, flat M4 and risk pre/post; no writes',()=>run(async db=>{
  await fixture(db);const o=order(),sig=await sign(o);const admitted=await admit(db,o,sig);
  const before=await readOnlyCounts(db);
  const result=await assess(db,o,sig);
  assert.equal(result.orderId,admitted.orderId);
  assert.equal(result.reservedInitialMarginAtomic,admitted.initialMargin);
  assert.equal(result.oracleSequence,'101');
  assert.equal(result.executionAuthorized,false);
  assert.equal(result.preTrade.executionAuthorized,false);
  assert.equal(result.preTrade.before.status,'FLAT');
  assert.equal(result.preTrade.decision,'SIMULATION_ELIGIBLE');
  assert.equal(result.preTrade.candidate?.position.sizeSignedAtomic,'100000000');
  assert.equal(result.preTrade.after?.status,'HEALTHY');
  assert.deepEqual(await readOnlyCounts(db),before);
  const snapshots=await db.query('SELECT COUNT(*)::int n FROM perp_position_snapshots');
  assert.equal((snapshots.rows[0] as {n:number}).n,0);
}));

test('C1 reject forged v2 signature, tampered order, domain, policy and oracle',()=>run(async db=>{
  await fixture(db);const o=order(),sig=await sign(o);await admit(db,o,sig);
  await assert.rejects(assess(db,o,await sign(o,bob)),/signature/i);
  await assert.rejects(assess(db,{...o,quantity:'200000000'},sig));
  await assert.rejects(assess(db,o,sig,{...context(),domain:{...domain,chainId:1}}));
  await assert.rejects(assess(db,o,sig,{...context(),config:{...context().config,revision:2}}));
  await assert.rejects(assess(db,o,sig,{...context(),snapshot:{...context().snapshot,sourceSequence:'102'}}),/oracle|stale/i);
  assert.equal((await readOnlyCounts(db))[2],0);
}));

test('C1 nonce replay/cancellation fences: duplicate admission and canceled shadow are rejected',()=>run(async db=>{
  await fixture(db);const o=order(),sig=await sign(o);const added=await admit(db,o,sig);
  await assert.rejects(admit(db,o,sig));
  const cancel={account:o.account,nonce:o.nonce,orderId:added.orderId,
    deadline:NOW+300,executionMode:'SIMULATION_ONLY' as const};
  const csig=await alice.signTypedData(buildSimPerpCancelTypedData(cancel,domain,NOW));
  await cancelSimPerpOrder(cancel,csig,domain,manager(db),NOW);
  await assert.rejects(assess(db,o,sig),/shadow order|stale/i);
}));

test('C1 insufficient persisted M3 RESERVED and altered reserve posting fail closed',()=>run(async db=>{
  await fixture(db);const o=order(),sig=await sign(o);await admit(db,o,sig);
  await db.query("UPDATE perp_margin_balances SET balance='0' WHERE account=$1 AND bucket='RESERVED'",[alice.address.toLowerCase()]);
  await assert.rejects(assess(db,o,sig),/reservation|reserved/i);
}));

test('C1 wrong position version, OI corruption, market mode mismatch fail closed',()=>run(async db=>{
  await fixture(db);const o=order(),sig=await sign(o);await admit(db,o,sig);
  await assert.rejects(assess(db,o,sig,context(),o.quantity,1),/position version/i);
  await db.query("UPDATE perp_market_open_interest SET open_interest_atomic='1' WHERE market='BTC-USD-PERP'");
  await assert.rejects(assess(db,o,sig),/OI|positions/i);
  await db.query("UPDATE perp_market_open_interest SET open_interest_atomic='0',mode='UNPAIRED' WHERE market='BTC-USD-PERP'");
  await assert.rejects(assess(db,o,sig),/paired market/i);
}));

test('C1 multiple concurrent readers and repeated assessment never create fills or move margin',()=>run(async db=>{
  await fixture(db);const o=order(),sig=await sign(o);await admit(db,o,sig);
  const before=await readOnlyCounts(db);
  const outcomes=await Promise.allSettled(Array.from({length:6},()=>assess(db,o,sig)));
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,6);
  assert.deepEqual(await readOnlyCounts(db),before);
}));

test('C1 guard with Reduce-only reservations cannot be interpreted as signed opening margin',()=>run(async db=>{
  await fixture(db);const o=order(),sig=await sign(o);await admit(db,o,sig);
  // Valid existing zero-position anchor, preserving SQL 013/014 constraints.
  await db.query(`INSERT INTO perp_position_snapshots
    (chain_id,verifying_contract,market,collateral_token,account,config_revision,
     size_signed_atomic,open_cost_numerator,realized_pnl_numerator,version)
    VALUES($1,$2,'BTC-USD-PERP',$3,$4,1,'0','0','0',0)`,
    [domain.chainId,domain.verifyingContract,token,alice.address.toLowerCase()]);
  await db.query(`INSERT INTO perp_reduce_guards
    (chain_id,verifying_contract,market,collateral_token,account,
     position_version,position_size_atomic,config_revision,config_hash)
    VALUES($1,$2,'BTC-USD-PERP',$3,$4,0,'0',1,$5)`,
    [domain.chainId,domain.verifyingContract,token,alice.address.toLowerCase(),
      hashPerpMarketConfig(context().config)]);
  await assert.rejects(assess(db,o,sig),/reduce-only guard/i);
}));

test('C1 DB SQL error aborts read-only transaction without changing reserved or nonce',()=>run(async db=>{
  await fixture(db);const o=order(),sig=await sign(o);await admit(db,o,sig);
  const before=await readOnlyCounts(db);
  const broken:OrderTransactionManager={withTransaction:fn=>manager(db).withTransaction(tx=>fn({
    query:(sql,args)=>{if(sql.includes('FROM perp_margin_entries'))throw new Error('simulated SQL outage');
      return tx.query(sql,args);},
  }))};
  await assert.rejects(assessPersistedSignedSimPerpOrder(o,sig,context(),broken),/simulated SQL outage/);
  assert.deepEqual(await readOnlyCounts(db),before);
  const tombstone=await db.query('SELECT status FROM order_nonces WHERE nonce=$1',[o.nonce]);
  assert.equal((tombstone.rows[0] as {status:string}).status,'USED');
}));

test('C1 durable disk restart preserves signed order, nonce, reserve and risk-only replay',{timeout:45000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'perp-signed-risk-'));let db:PGlite|undefined;
  try{db=await open(dir);await fixture(db);const o=order(),sig=await sign(o);
    const admitted=await admit(db,o,sig);await db.close();db=undefined;
    db=await open(dir);const r=await assess(db,o,sig);
    assert.equal(r.orderId,admitted.orderId);
    assert.equal(r.preTrade.decision,'SIMULATION_ELIGIBLE');
    assert.deepEqual(await readOnlyCounts(db),[1,1,0,0]);
  }finally{if(db)await db.close();await rm(dir,{recursive:true,force:true});}
});

test('C1 partial virtual fill evaluates post-risk but cannot consume reserved margin',()=>run(async db=>{
  await fixture(db);const o=order(),sig=await sign(o);await admit(db,o,sig);
  const before=await readOnlyCounts(db);
  const r=await assess(db,o,sig,context(),'40000000');
  assert.equal(r.preTrade.simulatedFillQuantityAtomic,'40000000');
  assert.equal(r.preTrade.candidate?.position.sizeSignedAtomic,'40000000');
  assert.equal(r.preTrade.remainingOrderQuantityAtomic,'60000000');
  assert.deepEqual(await readOnlyCounts(db),before);
}));

test('C1 tampered M3 RESERVE operation or entry refuses durable signed collateral proof',()=>run(async db=>{
  await fixture(db);const o=order(),sig=await sign(o);const receipt=await admit(db,o,sig);
  await db.query("UPDATE perp_margin_operations SET amount='1' WHERE operation_id=$1",[receipt.orderId.slice(2)]);
  await assert.rejects(assess(db,o,sig),/reserve operation/i);
  await db.query('UPDATE perp_margin_operations SET amount=$2 WHERE operation_id=$1',
    [receipt.orderId.slice(2),receipt.initialMargin]);
  await db.query("UPDATE perp_margin_entries SET signed_delta='1' WHERE operation_id=$1 AND leg=1",[receipt.orderId.slice(2)]);
  await assert.rejects(assess(db,o,sig),/double-entry/i);
}));

test('C1 concurrent signed orders cannot share a reservation for the same nonce',()=>run(async db=>{
  await fixture(db);const a=order(),b={...a,nonce:'102'};
  const sa=await sign(a),sb=await sign(b);
  const out=await Promise.allSettled([
    admit(db,a,sa),admit(db,a,sa),admit(db,b,sb),admit(db,b,sb),
  ]);
  assert.equal(out.filter(x=>x.status==='fulfilled').length,2);
  const ra=await assess(db,a,sa);const rb=await assess(db,b,sb);
  assert.notEqual(ra.orderId,rb.orderId);
  const bucket=await db.query("SELECT balance FROM perp_margin_balances WHERE account=$1 AND bucket='RESERVED'",[alice.address.toLowerCase()]);
  assert.equal((bucket.rows[0] as {balance:string}).balance,
    (BigInt(ra.reservedInitialMarginAtomic)+BigInt(rb.reservedInitialMarginAtomic)).toString());
  assert.equal((await readOnlyCounts(db))[2],0);
}));

test('C1 changed M4 position requires fresh expected version and never commits hypothetical fill',()=>run(async db=>{
  await fixture(db);const o=order(),sig=await sign(o);await admit(db,o,sig);
  const trade={fillId:'0x'+'5'.repeat(64),executionMode:'SIMULATION_ONLY' as const,
    buyerAccount:alice.address,sellerAccount:bob.address,priceAtomic:o.price,
    quantityAtomic:o.quantity,buyerExpectedVersion:0,sellerExpectedVersion:0};
  await applySimPairedFill(manager(db),trade,context());
  await assert.rejects(assess(db,o,sig),/position version/i);
  const before=await readOnlyCounts(db);
  const result=await assess(db,o,sig,context(),o.quantity,1);
  assert.equal(result.positionVersion,1);
  assert.equal(result.preTrade.before.positionVersion,1);
  assert.equal(result.executionAuthorized,false);
  assert.deepEqual(await readOnlyCounts(db),before);
}));
