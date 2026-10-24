import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import type {OrderTransactionManager} from '../src/orders/order-transactions.ts';
import type {PerpMarketConfig} from '../src/perp/market-config.ts';
import type {PerpPriceSnapshot} from '../src/perp/price-snapshot.ts';
import type {PerpPositionContext,PerpPositionFill} from '../src/perp/position-engine.ts';
import {applySimPerpFillToLedger,readSimPerpPosition,PerpPositionLedgerError} from '../src/perp/position-ledger.ts';

const DOMAIN={chainId:11155111,verifyingContract:'0x1111111111111111111111111111111111111111'};
const OTHER_DOMAIN={chainId:1,verifyingContract:DOMAIN.verifyingContract};
const TOKEN='0x3333333333333333333333333333333333333333';
const ALT_TOKEN='0x4444444444444444444444444444444444444444';
const ALICE=privateKeyToAccount(generatePrivateKey()).address;
const BOB=privateKeyToAccount(generatePrivateKey()).address;
const NOW=1800000000;
const SOURCE='unit-test-trusted-policy';
let counter=1;
function nextId(){return `0x${(counter++).toString(16).padStart(64,'0')}`;}
function context(configPatch:Partial<PerpMarketConfig>={},snapshotPatch:Partial<PerpPriceSnapshot>={},
  domain=DOMAIN):PerpPositionContext {
  const base:PerpMarketConfig={chainId:domain.chainId,verifyingContract:domain.verifyingContract,
    market:'BTC-USD-PERP',baseAsset:'BTC',quoteAsset:'USD',collateralToken:TOKEN,
    sourceId:SOURCE,oracleSourceId:'mock-source',revision:1,status:'APPROVED',
    validFrom:NOW-100,validUntil:NOW+900,
    baseDecimals:8,priceDecimals:2,collateralDecimals:6,tickSize:'5',lotSize:'100',
    minQuantity:'100',maxQuantity:'1000000000000000',maxOpenInterest:'2000000000000000',
    initialMarginBps:1000,maintenanceMarginBps:500,maxLeverage:10,
    maxPriceDeviationBps:300,maxConfidenceBps:100,maxOracleAgeSeconds:30};
  const config={...base,...configPatch};
  const snapshot:PerpPriceSnapshot={chainId:config.chainId,
    verifyingContract:config.verifyingContract,market:config.market,
    sourceId:config.oracleSourceId,configRevision:config.revision,
    indexPrice:'6500000',markPrice:'6500000',publishedAt:NOW-1,
    sourceSequence:'100',confidenceBps:20,...snapshotPatch};
  return {domain,config,trustedSourceId:SOURCE,snapshot,nowSeconds:NOW};
}
function fill(ctx:PerpPositionContext,account=ALICE,changes:Partial<PerpPositionFill>={}):PerpPositionFill{
  return {chainId:ctx.config.chainId,verifyingContract:ctx.config.verifyingContract,
    market:ctx.config.market,collateralToken:ctx.config.collateralToken,
    configRevision:ctx.config.revision,account,side:'BUY',priceAtomic:'6500000',
    quantityAtomic:'100000000',fillId:nextId(),expectedVersion:0,executionMode:'SIMULATION_ONLY',
    ...changes};
}
function manager(db:PGlite):OrderTransactionManager {
  return {withTransaction:fn=>db.transaction(async tx=>fn({
    async query(sql,params=[]){const r=await tx.query(sql,[...params]);return {rows:r.rows,rowCount:r.affectedRows??null};},
  }))};
}
async function openDb(path?:string):Promise<PGlite>{
  const db=new PGlite(path);await db.waitReady;
  const sql=await readFile(fileURLToPath(new URL('../sql/010_perp_position_ledger.sql',import.meta.url)),'utf8');
  await db.exec(sql);return db;
}
async function run<T>(fn:(db:PGlite)=>Promise<T>):Promise<T>{
  const db=await openDb();try{return await fn(db);}finally{await db.close();}
}
async function apply(db:PGlite,input:PerpPositionFill,ctx:PerpPositionContext){
  return applySimPerpFillToLedger(manager(db),input,ctx);
}
async function rows(db:PGlite,table:'perp_position_applications'|'perp_position_snapshots'){
  const q=await db.query(`SELECT * FROM ${table}`);return q.rows as Array<Record<string,unknown>>;
}

test('empty position read is read-only and never seeds accounts or margin',()=>run(async db=>{
  const ctx=context();const p=await readSimPerpPosition(db,ALICE,ctx);
  assert.equal(p.sizeSignedAtomic,'0');assert.equal(p.version,0);
  assert.equal((await rows(db,'perp_position_snapshots')).length,0);
  assert.equal((await rows(db,'perp_position_applications')).length,0);
}));

test('BUY long: one atomic application, exact cost, snapshot and permanent journal',()=>run(async db=>{
  const ctx=context(),event=fill(ctx);
  const done=await apply(db,event,ctx);
  assert.equal(done.position.version,1);
  assert.equal(done.position.sizeSignedAtomic,'100000000');
  assert.equal(done.position.openCostNumerator,'650000000000000');
  assert.equal((await rows(db,'perp_position_snapshots')).length,1);
  const log=await rows(db,'perp_position_applications');assert.equal(log.length,1);
  assert.equal(log[0]?.fill_id,event.fillId);
  assert.equal(log[0]?.config_hash instanceof String, false);
  assert.equal(typeof log[0]?.config_hash,'string');
  assert.deepEqual(await readSimPerpPosition(db,ALICE,ctx),done.position);
}));

test('incremental entry, partial long close, full flat and short reversal are persisted',()=>run(async db=>{
  const ctx=context(),higher=context({}, {markPrice:'6600000',indexPrice:'6600000'});
  const entry=await apply(db,fill(ctx),ctx);
  const add=await apply(db,fill(higher,ALICE,{expectedVersion:1,side:'BUY',priceAtomic:'6600000',quantityAtomic:'100000000'}),higher);
  assert.equal(add.position.sizeSignedAtomic,'200000000');
  assert.equal(add.mark.averageEntryPriceFloorAtomic,'6550000');
  const cut=await apply(db,fill(higher,ALICE,{expectedVersion:2,side:'SELL',priceAtomic:'6600000',quantityAtomic:'50000000'}),higher);
  assert.equal(cut.position.sizeSignedAtomic,'150000000');
  assert.equal(cut.realizedDeltaAtomic,'250000000');
  const flip=await apply(db,fill(higher,ALICE,{expectedVersion:3,side:'SELL',priceAtomic:'6600000',quantityAtomic:'200000000'}),higher);
  assert.equal(flip.position.sizeSignedAtomic,'-50000000');
  assert.equal(flip.closedQuantityAtomic,'150000000');
  assert.equal(flip.openedQuantityAtomic,'50000000');
  assert.equal((await rows(db,'perp_position_applications')).length,4);
  assert.deepEqual(await readSimPerpPosition(db,ALICE,higher),flip.position);
  assert.equal(entry.position.version,1);
}));

test('long-short counterparty may use same global fillId in different account journals',()=>run(async db=>{
  const ctx=context(),same=nextId();
  const buyer=await apply(db,fill(ctx,ALICE,{fillId:same,side:'BUY'}),ctx);
  const seller=await apply(db,fill(ctx,BOB,{fillId:same,side:'SELL'}),ctx);
  assert.equal(buyer.position.sizeSignedAtomic,'100000000');
  assert.equal(seller.position.sizeSignedAtomic,'-100000000');
  assert.equal((await rows(db,'perp_position_applications')).length,2);
  await assert.rejects(apply(db,fill(ctx,ALICE,{fillId:same,expectedVersion:1}),ctx),PerpPositionLedgerError);
}));

test('non-consecutive duplicate fill with UPDATED version is rejected, not re-executed',()=>run(async db=>{
  const ctx=context(),first=fill(ctx);
  await apply(db,first,ctx);
  await apply(db,fill(ctx,ALICE,{expectedVersion:1}),ctx);
  const before=await readSimPerpPosition(db,ALICE,ctx);
  await assert.rejects(apply(db,{...first,expectedVersion:2},ctx),PerpPositionLedgerError);
  assert.deepEqual(await readSimPerpPosition(db,ALICE,ctx),before);
  assert.equal((await rows(db,'perp_position_applications')).length,2);
}));

test('same account and fill ID in different markets/tokens rejected, domains isolated',()=>run(async db=>{
  const ctx=context(),otherMarket=context({market:'ETH-USD-PERP',baseAsset:'ETH'});
  const otherToken=context({collateralToken:ALT_TOKEN});
  const id=nextId();await apply(db,fill(ctx,ALICE,{fillId:id}),ctx);
  for(const other of [otherMarket,otherToken]){
    await assert.rejects(apply(db,fill(other,ALICE,{fillId:id}),other));
  }
  assert.equal((await rows(db,'perp_position_applications')).length,1);
  const otherDomain=context({}, {},OTHER_DOMAIN);
  const allowed=await apply(db,fill(otherDomain,ALICE,{fillId:id}),otherDomain);
  assert.equal(allowed.position.version,1);
  assert.equal((await rows(db,'perp_position_applications')).length,2);
}));

test('stale expectedVersion and invalid market, account, source or price leave no extra record',()=>run(async db=>{
  const ctx=context(),first=fill(ctx);
  await apply(db,first,ctx);
  const snapshot=await readSimPerpPosition(db,ALICE,ctx);
  for(const patch of [{expectedVersion:0},{account:BOB,expectedVersion:1},
    {market:'ETH-USD-PERP',expectedVersion:1},{executionMode:'LIVE' as const,expectedVersion:1},
    {priceAtomic:'7500000',expectedVersion:1}]){
    await assert.rejects(apply(db,fill(ctx,ALICE,patch as Partial<PerpPositionFill>),ctx));
  }
  await assert.rejects(apply(db,fill(ctx,ALICE,{expectedVersion:1}),context({status:'REVOKED'})));
  await assert.rejects(apply(db,fill(ctx,ALICE,{expectedVersion:1}),context({}, {publishedAt:NOW-100})));
  assert.equal((await rows(db,'perp_position_applications')).length,1);
  assert.deepEqual(await readSimPerpPosition(db,ALICE,ctx),snapshot);
}));

test('parallel exact replay succeeds once with a single snapshot and journal row',()=>run(async db=>{
  const ctx=context(),f=fill(ctx);
  const results=await Promise.allSettled(Array.from({length:9},()=>apply(db,f,ctx)));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.filter(x=>x.status==='rejected').length,8);
  assert.equal((await rows(db,'perp_position_snapshots')).length,1);
  assert.equal((await rows(db,'perp_position_applications')).length,1);
  assert.equal((await readSimPerpPosition(db,ALICE,ctx)).version,1);
}));

test('different simultaneous fills with the same old expectedVersion cannot both apply',()=>run(async db=>{
  const ctx=context(),a=fill(ctx),b=fill(ctx);
  const out=await Promise.allSettled([apply(db,a,ctx),apply(db,b,ctx)]);
  assert.equal(out.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(out.filter(x=>x.status==='rejected').length,1);
  assert.equal((await rows(db,'perp_position_applications')).length,1);
}));

test('journal insert constraint failure rolls back snapshot insert and preserves same fill for retry',()=>run(async db=>{
  const ctx=context(),f=fill(ctx);
  await db.exec(`ALTER TABLE perp_position_applications ADD CONSTRAINT qa_block_fill
    CHECK (fill_id <> '${f.fillId}')`);
  try{
    await assert.rejects(apply(db,f,ctx));
    assert.equal((await rows(db,'perp_position_snapshots')).length,0);
    assert.equal((await rows(db,'perp_position_applications')).length,0);
  }finally{await db.exec('ALTER TABLE perp_position_applications DROP CONSTRAINT qa_block_fill');}
  assert.equal((await apply(db,f,ctx)).position.version,1);
}));

test('snapshot UPDATE failure rolls back the append-only journal and allows retry',()=>run(async db=>{
  const ctx=context(),f=fill(ctx);
  await db.exec(`ALTER TABLE perp_position_snapshots ADD CONSTRAINT qa_block_update
    CHECK (version = 0)`);
  try{
    await assert.rejects(apply(db,f,ctx));
    assert.equal((await rows(db,'perp_position_snapshots')).length,0);
    assert.equal((await rows(db,'perp_position_applications')).length,0);
  }finally{await db.exec('ALTER TABLE perp_position_snapshots DROP CONSTRAINT qa_block_update');}
  assert.equal((await apply(db,f,ctx)).position.version,1);
}));

test('journal entries are append-only via database triggers, not just application code',()=>run(async db=>{
  const ctx=context(),f=fill(ctx);await apply(db,f,ctx);
  await assert.rejects(db.query('UPDATE perp_position_applications SET price_atomic=$1 WHERE fill_id=$2',['6600000',f.fillId]),/append-only/);
  await assert.rejects(db.query('DELETE FROM perp_position_applications WHERE fill_id=$1',[f.fillId]),/append-only/);
  assert.equal((await rows(db,'perp_position_applications')).length,1);
}));

test('external snapshot tampering is detected against latest durable journal',()=>run(async db=>{
  const ctx=context(),f=fill(ctx);await apply(db,f,ctx);
  await db.query(`UPDATE perp_position_snapshots SET open_cost_numerator=$1 WHERE last_fill_id=$2`,
    ['660000000000000',f.fillId]);
  await assert.rejects(readSimPerpPosition(db,ALICE,ctx),PerpPositionLedgerError);
  await assert.rejects(apply(db,fill(ctx,ALICE,{expectedVersion:1}),ctx),PerpPositionLedgerError);
  assert.equal((await rows(db,'perp_position_applications')).length,1);
}));

test('policy revision change cannot silently reinterpret persisted cost/quantity units',()=>run(async db=>{
  const ctx=context(),f=fill(ctx);await apply(db,f,ctx);
  const upgraded=context({revision:2}, {configRevision:2});
  await assert.rejects(readSimPerpPosition(db,ALICE,upgraded));
  await assert.rejects(apply(db,fill(upgraded,ALICE,{expectedVersion:1}),upgraded),PerpPositionLedgerError);
  assert.equal((await rows(db,'perp_position_applications')).length,1);
}));

test('PGlite real disk close/reopen retains journal and prevents nonconsecutive replay',{timeout:30000},async()=>{
  const path=await mkdtemp(join(tmpdir(),'perpdex-position-ledger-'));
  let db:PGlite|undefined;
  try{
    db=await openDb(path);const ctx=context(),first=fill(ctx);
    await apply(db,first,ctx);
    const second=fill(ctx,ALICE,{expectedVersion:1});await apply(db,second,ctx);
    const original=await readSimPerpPosition(db,ALICE,ctx);
    await db.close();db=undefined;
    db=await openDb(path);
    assert.deepEqual(await readSimPerpPosition(db,ALICE,ctx),original);
    await assert.rejects(apply(db,{...first,expectedVersion:2},ctx),PerpPositionLedgerError);
    await assert.rejects(apply(db,{...second,expectedVersion:2},ctx),PerpPositionLedgerError);
    const third=await apply(db,fill(ctx,ALICE,{expectedVersion:2,side:'SELL',quantityAtomic:'250000000'}),ctx);
    assert.equal(third.position.sizeSignedAtomic,'-50000000');
    assert.equal((await rows(db,'perp_position_applications')).length,3);
  }finally{if(db)await db.close();await rm(path,{recursive:true,force:true});}
});
