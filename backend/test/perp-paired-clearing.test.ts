import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import type {OrderTransactionManager} from '../src/orders/order-transactions.ts';
import type {PerpPositionContext,PerpPositionFill} from '../src/perp/position-engine.ts';
import type {PerpMarketConfig} from '../src/perp/market-config.ts';
import type {PerpPriceSnapshot} from '../src/perp/price-snapshot.ts';
import {applySimPairedFill,verifySimMarketOpenInterest,computeSimMarketOpenInterest,
  PairedClearingError,type SimPairedFill} from '../src/perp/paired-clearing.ts';
import {applySimPerpFillToLedger,readSimPerpPosition,PerpPositionLedgerError} from '../src/perp/position-ledger.ts';
const DOMAIN={chainId:11155111,verifyingContract:'0x1111111111111111111111111111111111111111'};
const TOKEN='0x3333333333333333333333333333333333333333';
const ALICE=privateKeyToAccount(generatePrivateKey()).address;
const BOB=privateKeyToAccount(generatePrivateKey()).address;
const CAROL=privateKeyToAccount(generatePrivateKey()).address;
const DAVE=privateKeyToAccount(generatePrivateKey()).address;
const NOW=1800000000;
const SOURCE='test-approved';
let serial=1;
function id(){return `0x${(serial++).toString(16).padStart(64,'0')}`;}
function ctx(configOverride:Partial<PerpMarketConfig>={},snapOverride:Partial<PerpPriceSnapshot>={}):PerpPositionContext{
  const config:PerpMarketConfig={market:'BTC-USD-PERP',baseAsset:'BTC',quoteAsset:'USD',
    collateralToken:TOKEN,chainId:DOMAIN.chainId,verifyingContract:DOMAIN.verifyingContract,
    sourceId:SOURCE,oracleSourceId:'test-oracle',revision:1,status:'APPROVED',
    validFrom:NOW-100,validUntil:NOW+1000,baseDecimals:8,priceDecimals:2,collateralDecimals:6,
    tickSize:'5',lotSize:'100',minQuantity:'100',maxQuantity:'1000000000000',
    maxOpenInterest:'2000000000000',initialMarginBps:1000,maintenanceMarginBps:500,
    maxLeverage:10,maxPriceDeviationBps:300,maxConfidenceBps:100,maxOracleAgeSeconds:30,
    ...configOverride};
  const snapshot:PerpPriceSnapshot={chainId:config.chainId,verifyingContract:config.verifyingContract,
    market:config.market,configRevision:config.revision,sourceId:config.oracleSourceId,
    indexPrice:'6500000',markPrice:'6500000',publishedAt:NOW-1,sourceSequence:'1',confidenceBps:10,
    ...snapOverride};
  return {domain:DOMAIN,config,trustedSourceId:SOURCE,snapshot,nowSeconds:NOW};
}
function trade(patch:Partial<SimPairedFill>={}):SimPairedFill{
  return {fillId:id(),buyerAccount:ALICE,sellerAccount:BOB,quantityAtomic:'100000000',
    priceAtomic:'6500000',buyerExpectedVersion:0,sellerExpectedVersion:0,
    executionMode:'SIMULATION_ONLY',...patch};
}
function manager(db:PGlite):OrderTransactionManager {
  return {withTransaction:fn=>db.transaction(async transaction=>fn({
    async query(sql,args=[]){const q=await transaction.query(sql,[...args]);return {rows:q.rows,rowCount:q.affectedRows??null};},
  }))};
}
async function initialized(folder?:string){
  const db=new PGlite(folder);await db.waitReady;
  for(const name of ['010_perp_position_ledger','011_perp_pair_clearing']){
    await db.exec(await readFile(fileURLToPath(new URL(`../sql/${name}.sql`,import.meta.url)),'utf8'));
  }
  return db;
}
async function run(fn:(db:PGlite)=>Promise<void>){const db=await initialized();try{await fn(db);}finally{await db.close();}}
async function pair(db:PGlite,t:SimPairedFill,c=ctx()){return applySimPairedFill(manager(db),t,c);}
async function check(db:PGlite,c=ctx()){return verifySimMarketOpenInterest(db,c);}
async function count(db:PGlite,table:'perp_sim_paired_fills'|'perp_position_applications'|'perp_position_snapshots'){
  const r=await db.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
  return (r.rows[0] as {count:number}).count;
}
function standalone(account:string,c=ctx()):PerpPositionFill{
  return {fillId:id(),account,side:'BUY',priceAtomic:'6500000',quantityAtomic:'100000000',
    chainId:c.config.chainId,verifyingContract:c.config.verifyingContract,
    market:c.config.market,collateralToken:c.config.collateralToken,configRevision:c.config.revision,
    expectedVersion:0,executionMode:'SIMULATION_ONLY'};
}

test('initial market has flat zero OI, no persisted state',()=>run(async db=>{
  const before=await check(db);assert.equal(before.openInterestAtomic,'0');
  assert.equal(before.longQuantityAtomic,before.shortQuantityAtomic);
  assert.equal(await count(db,'perp_sim_paired_fills'),0);
}));

test('one paired fill atomically opens equal LONG/SHORT and two journals',()=>run(async db=>{
  const t=trade(),result=await pair(db,t);
  assert.equal(result.buyer.position.sizeSignedAtomic,'100000000');
  assert.equal(result.seller.position.sizeSignedAtomic,'-100000000');
  assert.equal(result.openInterest.openInterestAtomic,'100000000');
  assert.equal(result.buyer.mark.realizedPnlAtomic,'0');
  assert.equal(result.seller.mark.realizedPnlAtomic,'0');
  assert.equal(await count(db,'perp_position_applications'),2);
  assert.equal(await count(db,'perp_sim_paired_fills'),1);
  assert.deepEqual(await check(db),result.openInterest);
  const buyers=await db.query('SELECT side,quantity_atomic,price_atomic FROM perp_position_applications WHERE fill_id=$1 ORDER BY side',[t.fillId]);
  assert.deepEqual((buyers.rows as Array<{side:string;quantity_atomic:string;price_atomic:string}>).map(r=>r.side),['BUY','SELL']);
}));

test('OI grows and shrinks under market matched trades, including full close',()=>run(async db=>{
  await pair(db,trade());
  const grow=await pair(db,trade({buyerExpectedVersion:1,sellerExpectedVersion:1,quantityAtomic:'50000000'}));
  assert.equal(grow.openInterest.openInterestAtomic,'150000000');
  const shrink=await pair(db,trade({buyerAccount:BOB,sellerAccount:ALICE,
    buyerExpectedVersion:2,sellerExpectedVersion:2,quantityAtomic:'80000000'}));
  assert.equal(shrink.openInterest.openInterestAtomic,'70000000');
  const flat=await pair(db,trade({buyerAccount:BOB,sellerAccount:ALICE,
    buyerExpectedVersion:3,sellerExpectedVersion:3,quantityAtomic:'70000000'}));
  assert.equal(flat.openInterest.openInterestAtomic,'0');
  assert.equal(flat.buyer.position.sizeSignedAtomic,'0');
  assert.equal(flat.seller.position.sizeSignedAtomic,'0');
  assert.equal(await count(db,'perp_position_applications'),8);
  assert.equal(await count(db,'perp_sim_paired_fills'),4);
}));

test('position flip through opposite trade preserves OI equality',()=>run(async db=>{
  await pair(db,trade());
  const reverse=await pair(db,trade({buyerAccount:BOB,sellerAccount:ALICE,
    buyerExpectedVersion:1,sellerExpectedVersion:1,quantityAtomic:'250000000'}));
  assert.equal(reverse.buyer.position.sizeSignedAtomic,'150000000');
  assert.equal(reverse.seller.position.sizeSignedAtomic,'-150000000');
  assert.equal(reverse.openInterest.openInterestAtomic,'150000000');
  assert.deepEqual(await check(db),reverse.openInterest);
}));

test('different opposing accounts share fill ID, but replay after other pairs is rejected',()=>run(async db=>{
  const a=trade();await pair(db,a);
  await pair(db,trade({buyerExpectedVersion:1,sellerExpectedVersion:1}));
  const old=await check(db);
  await assert.rejects(pair(db,{...a,buyerExpectedVersion:2,sellerExpectedVersion:2}),PairedClearingError);
  assert.deepEqual(await check(db),old);
  assert.equal(await count(db,'perp_sim_paired_fills'),2);
}));

test('same fill ID cannot be reused with other accounts, policies or amounts',()=>run(async db=>{
  const a=trade();await pair(db,a);
  for(const modified of [
    {...a,buyerAccount:CAROL,sellerAccount:DAVE,buyerExpectedVersion:0,sellerExpectedVersion:0},
    {...a,quantityAtomic:'50000000',buyerExpectedVersion:1,sellerExpectedVersion:1},
  ])await assert.rejects(pair(db,modified),PairedClearingError);
  assert.equal(await count(db,'perp_sim_paired_fills'),1);
}));

test('self-match, bad execution context, stale oracle and wrong market fail closed',()=>run(async db=>{
  const t=trade();
  for(const bad of [{sellerAccount:ALICE},{executionMode:'LIVE' as 'SIMULATION_ONLY'},
    {priceAtomic:'0'},{quantityAtomic:'0'},{fillId:'bad'},{buyerExpectedVersion:-1}]){
    await assert.rejects(pair(db,{...t,...bad}));
  }
  await assert.rejects(pair(db,t,ctx({status:'DRAFT'})));
  await assert.rejects(pair(db,t,ctx({}, {publishedAt:NOW-50})));
  await assert.rejects(pair(db,t,ctx({chainId:1})));
  assert.equal(await count(db,'perp_sim_paired_fills'),0);
  assert.equal(await count(db,'perp_position_applications'),0);
}));

test('forced seller journal failure rolls back buyer, seller, OI and pair entry',()=>run(async db=>{
  const t=trade();
  await db.exec(`ALTER TABLE perp_position_applications ADD CONSTRAINT reject_seller
    CHECK (fill_id <> '${t.fillId}' OR account <> '${BOB.toLowerCase()}')`);
  try{
    await assert.rejects(pair(db,t));
    assert.equal(await count(db,'perp_position_snapshots'),0);
    assert.equal(await count(db,'perp_position_applications'),0);
    assert.equal(await count(db,'perp_sim_paired_fills'),0);
    assert.equal((await check(db)).openInterestAtomic,'0');
  }finally{await db.exec('ALTER TABLE perp_position_applications DROP CONSTRAINT reject_seller');}
  assert.equal((await pair(db,t)).openInterest.openInterestAtomic,'100000000');
}));

test('forced paired-journal failure rolls back both already-written account journals',()=>run(async db=>{
  const t=trade();await db.exec(`ALTER TABLE perp_sim_paired_fills ADD CONSTRAINT reject_pair
    CHECK (fill_id <> '${t.fillId}')`);
  try{
    await assert.rejects(pair(db,t));
    assert.equal(await count(db,'perp_position_snapshots'),0);
    assert.equal(await count(db,'perp_position_applications'),0);
    assert.equal(await count(db,'perp_sim_paired_fills'),0);
  }finally{await db.exec('ALTER TABLE perp_sim_paired_fills DROP CONSTRAINT reject_pair');}
  assert.equal((await pair(db,t)).openInterest.openInterestAtomic,'100000000');
}));

test('duplicate concurrent paired executions accept exactly one and keep tracked OI',()=>run(async db=>{
  const t=trade();const result=await Promise.allSettled(Array.from({length:8},()=>pair(db,t)));
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(result.filter(r=>r.status==='rejected').length,7);
  assert.equal(await count(db,'perp_position_applications'),2);
  assert.equal(await count(db,'perp_sim_paired_fills'),1);
  assert.equal((await check(db)).openInterestAtomic,'100000000');
}));

test('stale counterpart version denies the entire market fill and leaves other side unchanged',()=>run(async db=>{
  await pair(db,trade());
  const t=trade({buyerExpectedVersion:1,sellerExpectedVersion:0});
  await assert.rejects(pair(db,t));
  assert.equal((await readSimPerpPosition(db,ALICE,ctx())).version,1);
  assert.equal((await readSimPerpPosition(db,BOB,ctx())).version,1);
  assert.equal(await count(db,'perp_position_applications'),2);
  assert.equal(await count(db,'perp_sim_paired_fills'),1);
}));

test('single-party API cannot bypass already tracked paired market OI',()=>run(async db=>{
  await pair(db,trade());
  await assert.rejects(applySimPerpFillToLedger(manager(db),standalone(CAROL),ctx()),PerpPositionLedgerError);
  assert.equal((await check(db)).openInterestAtomic,'100000000');
}));

test('preexisting unbalanced single-party M4-T2 snapshot refuses paired bootstrap',()=>run(async db=>{
  await applySimPerpFillToLedger(manager(db),standalone(ALICE),ctx());
  await assert.rejects(pair(db,trade()));
  assert.equal(await count(db,'perp_sim_paired_fills'),0);
  const observed=await computeSimMarketOpenInterest(db,ctx());
  assert.equal(observed.longQuantityAtomic,'100000000');
  assert.equal(observed.shortQuantityAtomic,'0');
  await assert.rejects(check(db),PairedClearingError);
}));

test('tampered tracked OI or one-sided snapshot are detected and stop subsequent pair',()=>run(async db=>{
  await pair(db,trade());
  await db.query(`UPDATE perp_market_open_interest SET open_interest_atomic='1'`);
  await assert.rejects(check(db),PairedClearingError);
  await assert.rejects(pair(db,trade({buyerExpectedVersion:1,sellerExpectedVersion:1})),PairedClearingError);
  await db.query(`UPDATE perp_market_open_interest SET open_interest_atomic='100000000'`);
  await db.query(`UPDATE perp_position_snapshots SET size_signed_atomic='0',open_cost_numerator='0' WHERE account=$1`,[BOB.toLowerCase()]);
  await assert.rejects(check(db),PairedClearingError);
  await assert.rejects(pair(db,trade({buyerExpectedVersion:1,sellerExpectedVersion:1})),PairedClearingError);
}));

test('closed/OI journal is append-only and restart preserves paired fill replay fence',{timeout:45000},async()=>{
  const folder=await mkdtemp(join(tmpdir(),'perpdex-paired-'));
  let db:PGlite|undefined;
  try{
    db=await initialized(folder);
    const first=trade();await pair(db,first);
    const after=await check(db);
    await assert.rejects(db.query('DELETE FROM perp_sim_paired_fills WHERE fill_id=$1',[first.fillId]),/append-only/);
    await db.close();db=undefined;
    db=await initialized(folder);
    assert.deepEqual(await check(db),after);
    await assert.rejects(pair(db,{...first,buyerExpectedVersion:1,sellerExpectedVersion:1}),PairedClearingError);
    const second=await pair(db,trade({buyerExpectedVersion:1,sellerExpectedVersion:1}));
    assert.equal(second.openInterest.openInterestAtomic,'200000000');
  }finally{if(db)await db.close();await rm(folder,{recursive:true,force:true});}
});
