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
import {transferIsolatedMargin} from '../src/perp/margin-ledger.ts';

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
async function open(dir?:string,include020=true){const db=new PGlite(dir);await db.waitReady;
  for(const file of ['001_order_nonces','008_perp_margin_ledger','009_perp_sim_orders',
    '010_perp_position_ledger','011_perp_pair_clearing','012_perp_reduce_reservations',
    '013_perp_guarded_position_commit','014_perp_reduce_ledger_integrity',
    '015_perp_signed_opening_fence','016_perp_signed_pair_preparations',
    '017_perp_signed_pair_executions',
    '018_perp_signed_cancel_integrity',
    '019_perp_signed_order_fill_progress',
    '020_perp_signed_account_margin_conservation']){
    if(!include020&&file.startsWith('020_'))continue;
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





async function marginAccounting(db:PGlite,who=alice){
 const whoAddr=who.address.toLowerCase();
 const q=await db.query(`SELECT bucket,balance FROM perp_margin_balances WHERE account=$1`,[whoAddr]);
 const balances=new Map((q.rows as Array<{bucket:string;balance:string}>).map(r=>[r.bucket,BigInt(r.balance)]));
 const sums=await db.query(`SELECT bucket,COALESCE(SUM(signed_delta::numeric),0)::text AS total
   FROM perp_margin_entries WHERE account=$1 GROUP BY bucket`,[whoAddr]);
 const posted=new Map((sums.rows as Array<{bucket:string;total:string}>).map(r=>[r.bucket,BigInt(r.total)]));
 const im=await db.query(`SELECT status,initial_margin FROM perp_sim_orders WHERE account=$1`,[whoAddr]);
 const orders=im.rows as Array<{status:string;initial_margin:string}>;
 const open=orders.filter(o=>o.status==='OPEN').reduce((sum,o)=>sum+BigInt(o.initial_margin),0n);
 const filled=orders.filter(o=>o.status==='FILLED').reduce((sum,o)=>sum+BigInt(o.initial_margin),0n);
 assert.equal(balances.get('RESERVED'),posted.get('RESERVED')??0n);
 assert.equal(balances.get('POSITION'),posted.get('POSITION')??0n);
 assert.ok((balances.get('RESERVED')??0n)>=open);
 assert.ok((balances.get('POSITION')??0n)>=filled);
 return {open,filled,balances,posted,orders};
}
test('C3-C2-A two OPEN signed orders conserve exact aggregated RESERVED postings',()=>run(async db=>{
 await create(db);
 const next=order(context(),alice.address,'102','BUY','6530000');
 const signed=await alice.signTypedData(buildSimPerpOrderTypedData(next,domain,NOW));
 await admitSimPerpOrder(next,signed,domain,manager(db),context().config,
   context().trustedSourceId,context().snapshot,NOW);
 const before=await counts(db);
 const {open,filled,balances}=await marginAccounting(db);
 assert.equal(filled,0n);assert.ok(open>0n);
 assert.equal(balances.get('RESERVED'),open);
 assert.deepEqual(await counts(db),before);
}));
test('C3-C2-A signed FILLED allocates POSITION; subsequent OPEN stays RESERVED',()=>run(async db=>{
 const pair=await create(db);
 await preparePersistedSignedSimPerpPair(pair,context(),manager(db));
 await executePreparedSignedSimPair(pair,context(),manager(db));
 const next=order(context(),alice.address,'102','BUY','6530000');
 const signed=await alice.signTypedData(buildSimPerpOrderTypedData(next,domain,NOW));
 await admitSimPerpOrder(next,signed,domain,manager(db),context().config,
   context().trustedSourceId,context().snapshot,NOW);
 const {open,filled,balances}=await marginAccounting(db);
 assert.ok(open>0n&&filled>0n);
 assert.equal(balances.get('RESERVED'),open);
 assert.equal(balances.get('POSITION'),filled);
 assert.deepEqual((await reconcileSignedSimAccount(alice.address,context(),manager(db))).openOrderCount,1);
}));
test('C3-C2-A signed CANCELED plus other OPEN conserves remaining reservation',()=>run(async db=>{
 const pair=await create(db);
 const next=order(context(),alice.address,'102','BUY');
 const signed=await alice.signTypedData(buildSimPerpOrderTypedData(next,domain,NOW));
 await admitSimPerpOrder(next,signed,domain,manager(db),context().config,
   context().trustedSourceId,context().snapshot,NOW);
 const query=await db.query(`SELECT order_id FROM perp_sim_orders WHERE account=$1 AND nonce='101'`,
   [alice.address.toLowerCase()]);
 const cancel={account:alice.address,nonce:pair.buyer.input.nonce,
   orderId:(query.rows[0] as {order_id:string}).order_id,deadline:NOW+300,
   executionMode:'SIMULATION_ONLY' as const};
 const signature=await alice.signTypedData(buildSimPerpCancelTypedData(cancel,domain,NOW));
 await cancelSimPerpOrder(cancel,signature,domain,manager(db),NOW);
 const {open,balances,orders}=await marginAccounting(db);
 assert.equal(orders.filter(o=>o.status==='CANCELED').length,1);
 assert.equal(balances.get('RESERVED'),open);
}));
test('C3-C2-A unrelated M3 RESERVE remains separate non-withdrawable surplus',()=>run(async db=>{
 await create(db);
 const start=await marginAccounting(db);
 await transferIsolatedMargin(manager(db),domain,{account:alice.address,
   market:'BTC-USD-PERP',collateralToken:token,operationId:'unrelated-booked-margin',
   action:'RESERVE',amount:'777'});
 const {open,balances}=await marginAccounting(db);
 assert.equal(open,start.open);
 assert.equal((balances.get('RESERVED')??0n)-open,777n);
 const report=await reconcileSignedSimAccount(alice.address,context(),manager(db));
 assert.equal(report.nonSignedReservedAtomic,'777');
}));
test('C3-C2-A direct SQL RESERVED balance inflation rolls back at COMMIT',()=>run(async db=>{
 await create(db);
 const before=await counts(db);
 await assert.rejects(db.query(`UPDATE perp_margin_balances SET balance=(balance::numeric+1)::text
   WHERE account=$1 AND bucket='RESERVED'`,[alice.address.toLowerCase()]),
   /RESERVED\/POSITION balance differs from M3 postings/i);
 await marginAccounting(db);
 assert.deepEqual(await counts(db),before);
}));
test('C3-C2-A direct SQL POSITION balance inflation rolls back at COMMIT',()=>run(async db=>{
 await create(db);
 await assert.rejects(db.query(`UPDATE perp_margin_balances SET balance='1'
   WHERE account=$1 AND bucket='POSITION'`,[alice.address.toLowerCase()]),
   /RESERVED\/POSITION balance differs from M3 postings/i);
 await marginAccounting(db);
}));
test('C3-C2-A unbalanced direct M3 operation cannot commit under signed account',()=>run(async db=>{
 await create(db);
 const before=await counts(db);
 await assert.rejects(db.query(`INSERT INTO perp_margin_operations
   (chain_id,verifying_contract,market,collateral_token,operation_id,
    account,action,from_bucket,to_bucket,amount)
   VALUES($1,$2,'BTC-USD-PERP',$3,'unbacked-direct-sql',$4,
    'RESERVE','AVAILABLE','RESERVED','1')`,
   [domain.chainId,domain.verifyingContract,token,alice.address.toLowerCase()]),
   /M3 operation lacks matching double-entry posting/i);
 assert.deepEqual(await counts(db),before);
}));
test('C3-C2-A half-posted direct M3 operation cannot commit and rolls back',()=>run(async db=>{
 await create(db);const before=await counts(db);
 await assert.rejects(db.transaction(async tx=>{
   await tx.query(`INSERT INTO perp_margin_operations
    (chain_id,verifying_contract,market,collateral_token,operation_id,
     account,action,from_bucket,to_bucket,amount)
     VALUES($1,$2,'BTC-USD-PERP',$3,'partial-operation',$4,
       'RESERVE','AVAILABLE','RESERVED','100')`,
      [domain.chainId,domain.verifyingContract,token,alice.address.toLowerCase()]);
   await tx.query(`INSERT INTO perp_margin_entries
     (chain_id,verifying_contract,market,collateral_token,operation_id,leg,
      account,bucket,signed_delta)
     VALUES($1,$2,'BTC-USD-PERP',$3,'partial-operation',0,$4,'AVAILABLE','-100')`,
      [domain.chainId,domain.verifyingContract,token,alice.address.toLowerCase()]);
 }),/M3 operation lacks matching double-entry posting/i);
 assert.deepEqual(await counts(db),before);
}));
test('C3-C2-A concurrent admissions of unique signed nonces remain fully reserved',()=>run(async db=>{
 await create(db);
 const extra=['102','103','104'].map(x=>order(context(),alice.address,x,'BUY'));
 const signed=await Promise.all(extra.map(o=>alice.signTypedData(buildSimPerpOrderTypedData(o,domain,NOW))));
 const result=await Promise.allSettled(extra.map((o,i)=>admitSimPerpOrder(
   o,signed[i],domain,manager(db),context().config,context().trustedSourceId,
   context().snapshot,NOW)));
 assert.equal(result.filter(x=>x.status==='fulfilled').length,3);
 const {open,balances,orders}=await marginAccounting(db);
 assert.equal(orders.filter(x=>x.status==='OPEN').length,4);
 assert.equal(balances.get('RESERVED'),open);
}));
test('C3-C2-A concurrent valid signed cancel and new admission preserve journal',()=>run(async db=>{
 const pair=await create(db);
 const id=(await db.query(`SELECT order_id FROM perp_sim_orders WHERE account=$1`,
   [alice.address.toLowerCase()])).rows[0] as {order_id:string};
 const cancel={account:alice.address,nonce:pair.buyer.input.nonce,orderId:id.order_id,
  deadline:NOW+300,executionMode:'SIMULATION_ONLY' as const};
 const cancelSig=await alice.signTypedData(buildSimPerpCancelTypedData(cancel,domain,NOW));
 const next=order(context(),alice.address,'102','BUY');
 const sig=await alice.signTypedData(buildSimPerpOrderTypedData(next,domain,NOW));
 const both=await Promise.allSettled([
   cancelSimPerpOrder(cancel,cancelSig,domain,manager(db),NOW),
   admitSimPerpOrder(next,sig,domain,manager(db),context().config,
     context().trustedSourceId,context().snapshot,NOW),
 ]);
 assert.equal(both.filter(x=>x.status==='fulfilled').length,2);
 const {orders,open,balances}=await marginAccounting(db);
 assert.equal(orders.filter(x=>x.status==='OPEN').length,1);
 assert.equal(orders.filter(x=>x.status==='CANCELED').length,1);
 assert.equal(balances.get('RESERVED'),open);
}));
test('C3-C2-A forced second M3 leg error rolls back signed admission/nonce',()=>run(async db=>{
 await create(db);
 const next=order(context(),alice.address,'102','BUY');
 const sig=await alice.signTypedData(buildSimPerpOrderTypedData(next,domain,NOW));
 const before=await counts(db);
 const broken:OrderTransactionManager={withTransaction:fn=>manager(db).withTransaction(tx=>fn({
   query:(sql,args)=>{if(sql.includes('INSERT INTO perp_margin_entries')&&args?.includes(1))
     throw Error('forced second posting failure');
     return tx.query(sql,args);},
 }))};
 await assert.rejects(admitSimPerpOrder(next,sig,domain,broken,context().config,
  context().trustedSourceId,context().snapshot,NOW),/forced second posting failure/i);
 assert.deepEqual(await counts(db),before);
 assert.equal(((await db.query(`SELECT COUNT(*)::int n FROM perp_sim_orders WHERE account=$1`,
   [alice.address.toLowerCase()])).rows[0] as {n:number}).n,1);
}));
test('C3-C2-A SQL 020 migration repeat preserves mixed signed and unrelated M3',()=>run(async db=>{
 await create(db);
 await transferIsolatedMargin(manager(db),domain,{account:alice.address,market:'BTC-USD-PERP',
  collateralToken:token,operationId:'external-other-reserve',action:'RESERVE',amount:'99'});
 const before=await counts(db);
 const sql=await readFile(fileURLToPath(new URL(
  '../sql/020_perp_signed_account_margin_conservation.sql',import.meta.url)),'utf8');
 await db.exec(sql);
 assert.deepEqual(await counts(db),before);
 await marginAccounting(db);
}));

test('C3-C2-A duplicate same-nonce admission cannot create another reservation',()=>run(async db=>{
 await create(db);const before=await counts(db);
 const duplicate=order(context(),alice.address,'101','BUY');
 const signature=await alice.signTypedData(buildSimPerpOrderTypedData(duplicate,domain,NOW));
 await assert.rejects(admitSimPerpOrder(duplicate,signature,domain,manager(db),
   context().config,context().trustedSourceId,context().snapshot,NOW),
   /nonce already|already consumed|already used|duplicate/i);
 assert.deepEqual(await counts(db),before);
 await marginAccounting(db);
}));
test('C3-C2-A migration preflight refuses previously overstated signed RESERVED balance',async()=>{
 const db=await open(undefined,false);
 try{
  await create(db);
  await db.query(`UPDATE perp_margin_balances
    SET balance=(balance::numeric+100)::text
    WHERE account=$1 AND bucket='RESERVED'`,[alice.address.toLowerCase()]);
  const sql=await readFile(fileURLToPath(new URL(
    '../sql/020_perp_signed_account_margin_conservation.sql',import.meta.url)),'utf8');
  await assert.rejects(db.exec(sql),
    /RESERVED\/POSITION balance differs from M3 postings/i);
  const result=await db.query(`SELECT status FROM perp_sim_orders WHERE account=$1`,
    [alice.address.toLowerCase()]);
  assert.equal(result.rows.length,1);
  assert.equal((result.rows[0] as {status:string}).status,'OPEN');
 }finally{await db.close();}
});
