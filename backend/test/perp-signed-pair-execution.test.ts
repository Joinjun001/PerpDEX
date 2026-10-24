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
    '019_perp_signed_order_fill_progress']){
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



test('B2-B signed full pair atomically consumes both orders, M3 allocations and M4 paired OI',()=>run(async db=>{
 const p=await create(db,context(),'6565000','6435000');
 await preparePersistedSignedSimPerpPair(p,context(),manager(db));
 const before=await counts(db);
 const r=await executePreparedSignedSimPair(p,context(),manager(db));
 assert.equal(r.status,'FILLED');assert.equal(r.executionAuthorized,false);
 const q=await db.query("SELECT status FROM perp_sim_orders ORDER BY account");
 assert.deepEqual((q.rows as {status:string}[]).map(x=>x.status),['FILLED','FILLED']);
 const terminal=await db.query('SELECT * FROM perp_signed_pair_executions');
 assert.equal(terminal.rows.length,1);
 const journal=await db.query('SELECT account,side FROM perp_position_applications WHERE fill_id=$1',[p.fillId]);
 assert.equal(journal.rows.length,2);
 const oi=await db.query('SELECT open_interest_atomic FROM perp_market_open_interest');
 assert.equal((oi.rows[0] as {open_interest_atomic:string}).open_interest_atomic,p.quantityAtomic);
 const margin=await db.query("SELECT account,bucket,balance FROM perp_margin_balances WHERE bucket IN ('POSITION','RESERVED')");
 for(const account of [alice.address.toLowerCase(),bob.address.toLowerCase()]){
  const position=(margin.rows as {account:string;bucket:string;balance:string}[]).find(x=>x.account===account&&x.bucket==='POSITION');
  const reserved=(margin.rows as {account:string;bucket:string;balance:string}[]).find(x=>x.account===account&&x.bucket==='RESERVED');
  assert.ok(position&&BigInt(position.balance)>0n);
  assert.equal(reserved?.balance,'0');
 }
 const after=await counts(db);
 assert.equal(after[0]-before[0],2);
 assert.equal(after[3]-before[3],2);
 assert.equal(after[4]-before[4],1);
 const nonce=await db.query("SELECT status FROM order_nonces");
 assert.ok((nonce.rows as {status:string}[]).every(x=>x.status==='USED'));
}));
test('B2-B replayed or competing execution never allocates/fills twice',()=>run(async db=>{
 const p=await create(db);await preparePersistedSignedSimPerpPair(p,context(),manager(db));
 const result=await Promise.allSettled(Array.from({length:3},()=>executePreparedSignedSimPair(p,context(),manager(db))));
 assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
 assert.equal((await db.query('SELECT count(*)::int n FROM perp_signed_pair_executions')).rows.length,1);
 assert.equal(((await db.query('SELECT count(*)::int n FROM perp_position_applications')).rows[0] as {n:number}).n,2);
 await assert.rejects(executePreparedSignedSimPair(p,context(),manager(db)),/already committed|stale|shadow/i);
}));
test('B2-B canceled preparation and forged signature cannot reach terminal',()=>run(async db=>{
 const p=await create(db);await preparePersistedSignedSimPerpPair(p,context(),manager(db));
 await assert.rejects(executePreparedSignedSimPair({...p,buyer:{...p.buyer,signature:p.seller.signature}},context(),manager(db)),/signature/i);
 const q=await db.query('SELECT order_id FROM perp_sim_orders WHERE account=$1',[bob.address.toLowerCase()]);
 const cancel={account:bob.address,nonce:p.seller.input.nonce,orderId:(q.rows[0] as {order_id:string}).order_id,
  deadline:NOW+300,executionMode:'SIMULATION_ONLY' as const};
 const signature=await bob.signTypedData(buildSimPerpCancelTypedData(cancel,domain,NOW));
 await cancelSimPerpOrder(cancel,signature,domain,manager(db),NOW);
 await assert.rejects(executePreparedSignedSimPair(p,context(),manager(db)),/shadow|stale/i);
 assert.equal(((await db.query('SELECT count(*)::int n FROM perp_signed_pair_executions')).rows[0] as {n:number}).n,0);
}));
test('B2-B injected failure after M4 application rolls back all accounts and ledger',()=>run(async db=>{
 const p=await create(db);await preparePersistedSignedSimPerpPair(p,context(),manager(db));
 const before=await counts(db);
 const broken:OrderTransactionManager={withTransaction:fn=>manager(db).withTransaction(tx=>fn({
   query:(sql,args)=>{if(sql.includes('INSERT INTO perp_signed_pair_executions'))throw Error('forced terminal failure');
   return tx.query(sql,args);},
 }))};
 await assert.rejects(executePreparedSignedSimPair(p,context(),broken),/forced terminal failure/);
 assert.deepEqual(await counts(db),before);
 assert.equal(((await db.query('SELECT count(*)::int n FROM perp_signed_pair_executions')).rows[0] as {n:number}).n,0);
 assert.ok((await db.query('SELECT status FROM perp_sim_orders')).rows.every((x:any)=>x.status==='OPEN'));
}));
test('B2-B direct SQL FILLED without terminal receipt fails and does not touch funds',()=>run(async db=>{
 const p=await create(db);await preparePersistedSignedSimPerpPair(p,context(),manager(db));
 await assert.rejects(db.query("UPDATE perp_sim_orders SET status='FILLED' WHERE account=$1",[alice.address.toLowerCase()]),/terminal execution receipt/i);
 const q=await db.query('SELECT status FROM perp_sim_orders');
 assert.ok(q.rows.every((x:any)=>x.status==='OPEN'));
}));
test('B2-B terminal journal cannot be mutated, and SQL 001-017 reapply is safe',()=>run(async db=>{
 const p=await create(db);await preparePersistedSignedSimPerpPair(p,context(),manager(db));
 await executePreparedSignedSimPair(p,context(),manager(db));
 await assert.rejects(db.query('DELETE FROM perp_signed_pair_executions'),/append-only/i);
 await assert.rejects(db.query("UPDATE perp_signed_pair_executions SET market='NONE'"),/append-only/i);
 const sql=await readFile(fileURLToPath(new URL('../sql/017_perp_signed_pair_executions.sql',import.meta.url)),'utf8');
 await db.exec(sql);
 assert.equal(((await db.query('SELECT count(*)::int n FROM perp_signed_pair_executions')).rows[0] as {n:number}).n,1);
}));

test('B2-B direct SQL post-execution bucket tamper fails at COMMIT',()=>run(async db=>{
 const p=await create(db);await preparePersistedSignedSimPerpPair(p,context(),manager(db));
 await executePreparedSignedSimPair(p,context(),manager(db));
 const before=await db.query("SELECT balance FROM perp_margin_balances WHERE account=$1 AND bucket='POSITION'",
   [alice.address.toLowerCase()]);
 await assert.rejects(db.query("UPDATE perp_margin_balances SET balance='0' WHERE account=$1 AND bucket='POSITION'",
   [alice.address.toLowerCase()]),/posting sum/i);
 const after=await db.query("SELECT balance FROM perp_margin_balances WHERE account=$1 AND bucket='POSITION'",
   [alice.address.toLowerCase()]);
 assert.equal((after.rows[0] as {balance:string}).balance,(before.rows[0] as {balance:string}).balance);
}));
test('B2-B direct SQL post-execution position snapshot mutation fails at COMMIT',()=>run(async db=>{
 const p=await create(db);await preparePersistedSignedSimPerpPair(p,context(),manager(db));
 await executePreparedSignedSimPair(p,context(),manager(db));
 await assert.rejects(db.query("UPDATE perp_position_snapshots SET size_signed_atomic='0',open_cost_numerator='0' WHERE account=$1",
   [alice.address.toLowerCase()]),/snapshot mismatch/i);
 const snap=await db.query('SELECT size_signed_atomic FROM perp_position_snapshots WHERE account=$1',[alice.address.toLowerCase()]);
 assert.equal((snap.rows[0] as {size_signed_atomic:string}).size_signed_atomic,p.quantityAtomic);
}));
test('B2-B concurrent cancel versus execute permits one consistent outcome',()=>run(async db=>{
 const p=await create(db);await preparePersistedSignedSimPerpPair(p,context(),manager(db));
 const q=await db.query('SELECT order_id FROM perp_sim_orders WHERE account=$1',[bob.address.toLowerCase()]);
 const cancel={account:bob.address,nonce:p.seller.input.nonce,orderId:(q.rows[0] as {order_id:string}).order_id,
 deadline:NOW+300,executionMode:'SIMULATION_ONLY' as const};
 const sig=await bob.signTypedData(buildSimPerpCancelTypedData(cancel,domain,NOW));
 const [a,b]=await Promise.allSettled([
   executePreparedSignedSimPair(p,context(),manager(db)),
   cancelSimPerpOrder(cancel,sig,domain,manager(db),NOW),
 ]);
 assert.equal([a,b].filter(x=>x.status==='fulfilled').length,1);
 const q2=await db.query('SELECT status FROM perp_sim_orders');
 const all=(q2.rows as Array<{status:string}>).map(x=>x.status);
 const executions=(await db.query('SELECT COUNT(*)::int n FROM perp_signed_pair_executions')).rows[0] as {n:number};
 if(executions.n===1) assert.deepEqual(all,['FILLED','FILLED']);
 else assert.ok(all.includes('CANCELED')&&all.includes('OPEN'));
}));
test('B2-B injected second M3 allocation failure rolls back M4 and first allocation',()=>run(async db=>{
 const p=await create(db);await preparePersistedSignedSimPerpPair(p,context(),manager(db));
 const before=await counts(db);let calls=0;
 const broken:OrderTransactionManager={withTransaction:fn=>manager(db).withTransaction(tx=>fn({
   query:(sql,args)=>{
     if(sql.includes('INSERT INTO perp_margin_operations')&&++calls===2)throw Error('forced second allocation failure');
     return tx.query(sql,args);
   },
 }))};
 await assert.rejects(executePreparedSignedSimPair(p,context(),broken),/second allocation failure/);
 assert.deepEqual(await counts(db),before);
 assert.equal(((await db.query('SELECT COUNT(*)::int n FROM perp_signed_pair_executions')).rows[0] as {n:number}).n,0);
}));

test('B2-B forged terminal receipt cannot commit without M4 paired and M3 allocations',()=>run(async db=>{
 const p=await create(db);await preparePersistedSignedSimPerpPair(p,context(),manager(db));
 const prep=(await db.query('SELECT * FROM perp_signed_pair_preparations WHERE fill_id=$1',
  [p.fillId])).rows[0] as Record<string,string|number>;
 const fake=()=>db.query(`INSERT INTO perp_signed_pair_executions
   (chain_id,verifying_contract,market,collateral_token,fill_id,
    buyer_order_id,seller_order_id,buyer_allocation_id,seller_allocation_id)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
   [domain.chainId,domain.verifyingContract,'BTC-USD-PERP',token,p.fillId,
    prep.buyer_order_id,prep.seller_order_id,'a'.repeat(64),'b'.repeat(64)]);
 await assert.rejects(fake(),/foreign key|violates|missing|mismatch/i);
 const q=await db.query('SELECT COUNT(*)::int n FROM perp_signed_pair_executions');
 assert.equal((q.rows[0] as {n:number}).n,0);
 assert.ok((await db.query('SELECT status FROM perp_sim_orders')).rows.every((x:any)=>x.status==='OPEN'));
}));
test('B2-B PGlite restart preserves terminal receipt, margin and replay fence',{timeout:45000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'perpdex-signed-pair-'));
 let db:PGlite|undefined;
 try{
  db=await open(dir);const p=await create(db);
  await preparePersistedSignedSimPerpPair(p,context(),manager(db));
  await executePreparedSignedSimPair(p,context(),manager(db));
  await db.close();db=undefined;
  db=new PGlite(dir);await db.waitReady;
  const q=await db.query('SELECT fill_id FROM perp_signed_pair_executions');
  assert.equal((q.rows[0] as {fill_id:string}).fill_id,p.fillId);
  const states=await db.query('SELECT status FROM perp_sim_orders');
  assert.ok(states.rows.every((x:any)=>x.status==='FILLED'));
  await assert.rejects(executePreparedSignedSimPair(p,context(),manager(db)),
    /already committed|stale|shadow/i);
 }finally{if(db)await db.close();await rm(dir,{recursive:true,force:true});}
});

test('B2-B independent SQL market OI corruption cannot commit after signed execution',()=>run(async db=>{
 const p=await create(db);await preparePersistedSignedSimPerpPair(p,context(),manager(db));
 await executePreparedSignedSimPair(p,context(),manager(db));
 await assert.rejects(db.query("UPDATE perp_market_open_interest SET open_interest_atomic='0'"),
   /market OI conservation violated/i);
 const q=await db.query('SELECT open_interest_atomic FROM perp_market_open_interest');
 assert.equal((q.rows[0] as {open_interest_atomic:string}).open_interest_atomic,p.quantityAtomic);
}));
