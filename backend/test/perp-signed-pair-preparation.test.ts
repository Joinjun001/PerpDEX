import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import type {OrderTransactionManager} from '../src/orders/order-transactions.ts';
import type {PerpPositionContext} from '../src/perp/position-engine.ts';
import {hashPerpMarketConfig,buildSimPerpOrderTypedData,admitSimPerpOrder,
  buildSimPerpCancelTypedData,cancelSimPerpOrder,type SimPerpOrderInput} from '../src/perp/sim-order.ts';
import {assessPersistedSignedSimPerpPair,preparePersistedSignedSimPerpPair,type SignedSimPairCandidate} from '../src/perp/signed-sim-pair-gate.ts';
import {applySimPairedFill} from '../src/perp/paired-clearing.ts';

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
async function open(){const db=new PGlite();await db.waitReady;
  for(const file of ['001_order_nonces','008_perp_margin_ledger','009_perp_sim_orders',
    '010_perp_position_ledger','011_perp_pair_clearing','012_perp_reduce_reservations',
    '013_perp_guarded_position_commit','014_perp_reduce_ledger_integrity',
    '015_perp_signed_opening_fence','016_perp_signed_pair_preparations']){
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


test('B2-A independently signed full opening pair stores only immutable PREPARED evidence',()=>run(async db=>{
  const p=await create(db,context(),'6565000','6435000');
  const before=await counts(db);
  const r=await preparePersistedSignedSimPerpPair(p,context(),manager(db));
  assert.equal(r.status,'PREPARED');
  assert.equal(r.executionAuthorized,false);
  assert.equal(r.fillId,p.fillId);
  assert.deepEqual(await counts(db),before);
  const q=await db.query('SELECT * FROM perp_signed_pair_preparations WHERE fill_id=$1',[p.fillId]);
  assert.equal(q.rows.length,1);
  const prep=q.rows[0] as Record<string,string|number>;
  assert.equal(prep.quantity_atomic,p.quantityAtomic);
  assert.equal(prep.price_atomic,p.priceAtomic);
  assert.equal(prep.buyer_account,alice.address.toLowerCase());
  assert.equal(prep.seller_account,bob.address.toLowerCase());
  assert.equal(((await db.query('SELECT COUNT(*)::integer AS n FROM perp_position_applications')).rows[0] as {n:number}).n,0);
  const b=await db.query('SELECT balance FROM perp_margin_balances WHERE bucket=$1 AND account=$2',
    ['POSITION',alice.address.toLowerCase()]);
  assert.equal((b.rows[0] as {balance:string}).balance,'0');
}));

test('B2-A same fillId replay and parallel preparation commit exactly once',()=>run(async db=>{
  const p=await create(db);
  const [a,b,c]=await Promise.allSettled(Array.from({length:3},
    ()=>preparePersistedSignedSimPerpPair(p,context(),manager(db))));
  assert.equal([a,b,c].filter(r=>r.status==='fulfilled').length,1);
  const q=await db.query('SELECT COUNT(*)::integer AS n FROM perp_signed_pair_preparations');
  assert.equal((q.rows[0] as {n:number}).n,1);
}));

test('B2-A only full, fresh FLAT orders qualify; partial quantity or bad signature cannot prepare',()=>run(async db=>{
  const p=await create(db); const before=await counts(db);
  await assert.rejects(preparePersistedSignedSimPerpPair({...p,quantityAtomic:'40000000'},context(),manager(db)),
    /full quantity/i);
  await assert.rejects(preparePersistedSignedSimPerpPair({
    ...p,seller:{...p.seller,signature:p.buyer.signature}},context(),manager(db)),/signature/i);
  await assert.rejects(preparePersistedSignedSimPerpPair({...p,
    priceAtomic:'6500001'},context(),manager(db)),/ticks/i);
  assert.equal(((await db.query('SELECT COUNT(*)::integer AS n FROM perp_signed_pair_preparations')).rows[0] as {n:number}).n,0);
  assert.deepEqual(await counts(db),before);
}));

test('B2-A cancellation after preparation leaves historical proof but revokes current eligibility',()=>run(async db=>{
  const p=await create(db);
  await preparePersistedSignedSimPerpPair(p,context(),manager(db));
  const q=await db.query('SELECT order_id FROM perp_sim_orders WHERE account=$1',[bob.address.toLowerCase()]);
  const cancel={account:bob.address,nonce:p.seller.input.nonce,
    orderId:(q.rows[0] as {order_id:string}).order_id,
    deadline:NOW+300,executionMode:'SIMULATION_ONLY' as const};
  const sig=await bob.signTypedData(buildSimPerpCancelTypedData(cancel,domain,NOW));
  await cancelSimPerpOrder(cancel,sig,domain,manager(db),NOW);
  assert.equal(((await db.query('SELECT COUNT(*)::integer AS n FROM perp_signed_pair_preparations')).rows[0] as {n:number}).n,1);
  await assert.rejects(assessPersistedSignedSimPerpPair(p,context(),manager(db)),/shadow order/i);
  await assert.rejects(preparePersistedSignedSimPerpPair({...p,fillId:'0x'+'5'.repeat(64)},
    context(),manager(db)),/shadow order/i);
}));

test('B2-A preparation cannot bypass SQL 015 OPEN-order paired fill or allocation fence',()=>run(async db=>{
  const p=await create(db);
  await preparePersistedSignedSimPerpPair(p,context(),manager(db));
  const before=await counts(db);
  await assert.rejects(applySimPairedFill(manager(db),{
    executionMode:'SIMULATION_ONLY',fillId:p.fillId,priceAtomic:p.priceAtomic,
    quantityAtomic:p.quantityAtomic,buyerAccount:alice.address,sellerAccount:bob.address,
    buyerExpectedVersion:0,sellerExpectedVersion:0},context()),/signed OPEN/i);
  assert.deepEqual(await counts(db),before);
}));

test('B2-A UPDATE/DELETE and direct SQL forged matched-price candidate are rejected',()=>run(async db=>{
  const p=await create(db);await preparePersistedSignedSimPerpPair(p,context(),manager(db));
  await assert.rejects(db.query('UPDATE perp_signed_pair_preparations SET price_atomic=$1',[p.priceAtomic]),
    /append-only/i);
  await assert.rejects(db.query('DELETE FROM perp_signed_pair_preparations'),/append-only/i);
  // A different fillId alone is not proof: the deferred SQL cross-check
  // rejects an invalid candidate limit price even under direct SQL insertion.
  await assert.rejects(db.query(`INSERT INTO perp_signed_pair_preparations
    (chain_id,verifying_contract,market,collateral_token,fill_id,buyer_order_id,
     seller_order_id,buyer_account,seller_account,quantity_atomic,price_atomic,
     config_revision,config_hash,oracle_sequence,market_oi_version,
     buyer_position_version,seller_position_version,buyer_reserved_margin,seller_reserved_margin)
    SELECT chain_id,verifying_contract,market,collateral_token,$1,buyer_order_id,
     seller_order_id,buyer_account,seller_account,quantity_atomic,'1',
     config_revision,config_hash,oracle_sequence,market_oi_version,
     buyer_position_version,seller_position_version,buyer_reserved_margin,seller_reserved_margin
    FROM perp_signed_pair_preparations WHERE fill_id=$2`,
    ['0x'+'8'.repeat(64),p.fillId]),/durable open orders or limits/i);
  const q=await db.query('SELECT COUNT(*)::integer AS n FROM perp_signed_pair_preparations');
  assert.equal((q.rows[0] as {n:number}).n,1);
}));

test('B2-A injected INSERT error rolls back candidate without modifying orders or margin',()=>run(async db=>{
  const p=await create(db);const before=await counts(db);
  const broken:OrderTransactionManager={withTransaction:fn=>manager(db).withTransaction(tx=>fn({
    query:(sql,args)=>{if(sql.includes('INSERT INTO perp_signed_pair_preparations')){
      throw new Error('simulated prepare SQL outage');}
      return tx.query(sql,args);},
  }))};
  await assert.rejects(preparePersistedSignedSimPerpPair(p,context(),broken),/SQL outage/);
  assert.deepEqual(await counts(db),before);
  const q=await db.query('SELECT COUNT(*)::integer AS n FROM perp_signed_pair_preparations');
  assert.equal((q.rows[0] as {n:number}).n,0);
}));

test('B2-A SQL 016 migration is repeatable and preserves preparation history',()=>run(async db=>{
  const p=await create(db);await preparePersistedSignedSimPerpPair(p,context(),manager(db));
  const sql=await readFile(fileURLToPath(new URL('../sql/016_perp_signed_pair_preparations.sql',import.meta.url)),'utf8');
  await db.exec(sql);
  const q=await db.query('SELECT COUNT(*)::integer AS n FROM perp_signed_pair_preparations');
  assert.equal((q.rows[0] as {n:number}).n,1);
}));
