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
import {assessPersistedSignedSimPerpPair,type SignedSimPairCandidate} from '../src/perp/signed-sim-pair-gate.ts';
import {applySimPairedFill} from '../src/perp/paired-clearing.ts';
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
async function open(){const db=new PGlite();await db.waitReady;
  for(const file of ['001_order_nonces','008_perp_margin_ledger','009_perp_sim_orders',
    '010_perp_position_ledger','011_perp_pair_clearing','012_perp_reduce_reservations',
    '013_perp_guarded_position_commit','014_perp_reduce_ledger_integrity',
    '015_perp_signed_opening_fence']){
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


test('B1 signed admission, paired read-only proof, and signed cancellation remain valid',()=>run(async db=>{
  const p=await create(db);
  const before=await counts(db);
  assert.equal((await prove(db,p)).executionAuthorized,false);
  assert.deepEqual(await counts(db),before);
  const cancel={account:p.buyer.input.account,nonce:p.buyer.input.nonce,
    orderId:((await db.query('SELECT order_id FROM perp_sim_orders WHERE account=$1',
      [alice.address.toLowerCase()])).rows[0] as {order_id:string}).order_id,
    deadline:NOW+300,executionMode:'SIMULATION_ONLY' as const};
  const sig=await alice.signTypedData(buildSimPerpCancelTypedData(cancel,domain,NOW));
  await cancelSimPerpOrder(cancel,sig,domain,manager(db),NOW);
  const status=await db.query('SELECT status FROM perp_sim_orders WHERE account=$1',[alice.address.toLowerCase()]);
  assert.equal((status.rows[0] as {status:string}).status,'CANCELED');
  await assert.rejects(db.query("UPDATE perp_sim_orders SET status='OPEN' WHERE account=$1",
    [alice.address.toLowerCase()]),/status transition is not authorized/i);
}));

test('B1 previous M4 paired writer cannot commit under signed OPEN reservation, but can for canceled pair',()=>run(async db=>{
  const p=await create(db);
  const trade={executionMode:'SIMULATION_ONLY' as const,fillId:p.fillId,
    priceAtomic:p.priceAtomic,quantityAtomic:p.quantityAtomic,
    buyerAccount:alice.address,sellerAccount:bob.address,
    buyerExpectedVersion:0,sellerExpectedVersion:0};
  const before=await counts(db);
  await assert.rejects(applySimPairedFill(manager(db),trade,context()),/signed OPEN.*unbound/i);
  assert.deepEqual(await counts(db),before);
  for(const [o,signer] of [[p.buyer.input,alice],[p.seller.input,bob]] as const){
    const orderId=((await db.query('SELECT order_id FROM perp_sim_orders WHERE account=$1',
      [signer.address.toLowerCase()])).rows[0] as {order_id:string}).order_id;
    const cancel={account:signer.address,nonce:o.nonce,orderId,
      deadline:NOW+300,executionMode:'SIMULATION_ONLY' as const};
    const sig=await signer.signTypedData(buildSimPerpCancelTypedData(cancel,domain,NOW));
    await cancelSimPerpOrder(cancel,sig,domain,manager(db),NOW);
  }
  const result=await applySimPairedFill(manager(db),trade,context());
  assert.equal(result.openInterest.openInterestAtomic,p.quantityAtomic);
}));

test('B1 raw SQL snapshot version change under signed OPEN order fails at commit',()=>run(async db=>{
  const p=await create(db);
  await db.query(`INSERT INTO perp_position_snapshots
    (chain_id,verifying_contract,market,collateral_token,account,config_revision,
    size_signed_atomic,open_cost_numerator,realized_pnl_numerator,version)
    VALUES($1,$2,'BTC-USD-PERP',$3,$4,1,'0','0','0',0)`,
    [domain.chainId,domain.verifyingContract,token,alice.address.toLowerCase()]);
  await assert.rejects(db.transaction(async tx=>{
    await tx.query(`UPDATE perp_position_snapshots SET version=1,last_fill_id=$1
       WHERE account=$2`,[p.fillId,alice.address.toLowerCase()]);
  }),/signed OPEN.*position execution/i);
  const current=await db.query('SELECT version,last_fill_id FROM perp_position_snapshots WHERE account=$1',
    [alice.address.toLowerCase()]);
  assert.equal((current.rows[0] as {version:number}).version,0);
}));

test('B1 M3 ALLOCATE cannot quietly consume shadow order reserved collateral',()=>run(async db=>{
  const p=await create(db),before=await counts(db);
  await assert.rejects(transferIsolatedMargin(manager(db),domain,{
    account:p.buyer.input.account,market:p.buyer.input.market,
    collateralToken:p.buyer.input.collateralToken,operationId:'unbound-allocation',
    action:'ALLOCATE',amount:'1',
  }),/signed OPEN.*margin allocation/i);
  assert.deepEqual(await counts(db),before);
  const res=await db.query(`SELECT balance FROM perp_margin_balances WHERE account=$1 AND bucket='POSITION'`,
    [alice.address.toLowerCase()]);
  assert.equal((res.rows[0] as {balance:string}).balance,'0');
}));

test('B1 signed order immutable: raw SQL payload edits, terminal reopen, deletion are prohibited',()=>run(async db=>{
  await create(db);
  await assert.rejects(db.query("UPDATE perp_sim_orders SET quantity='100' WHERE account=$1",
    [alice.address.toLowerCase()]),/identity is immutable/i);
  await assert.rejects(db.query('DELETE FROM perp_sim_orders WHERE account=$1',
    [alice.address.toLowerCase()]),/cannot be deleted/i);
  const current=await db.query('SELECT quantity,status FROM perp_sim_orders WHERE account=$1',
    [alice.address.toLowerCase()]);
  assert.equal((current.rows[0] as {quantity:string}).quantity,'100000000');
}));

test('B1 SQL nonce-only status corruption contradicts OPEN signed shadow order',()=>run(async db=>{
  await create(db);
  await assert.rejects(db.query("UPDATE order_nonces SET status='CANCELED' WHERE account=$1",
    [alice.address.toLowerCase()]),/signed nonce mutation contradicts shadow order/i);
  const q=await db.query('SELECT status FROM order_nonces WHERE account=$1',[alice.address.toLowerCase()]);
  assert.equal((q.rows[0] as {status:string}).status,'USED');
}));

test('B1 M3 signed historical RESERVE journal is append-only',()=>run(async db=>{
  const p=await create(db);
  const orderId=((await db.query('SELECT order_id FROM perp_sim_orders WHERE account=$1',
    [alice.address.toLowerCase()])).rows[0] as {order_id:string}).order_id;
  await assert.rejects(db.query('UPDATE perp_margin_operations SET amount=$1 WHERE operation_id=$2',
    ['1',orderId.slice(2)]),/append-only/i);
  await assert.rejects(db.query('DELETE FROM perp_margin_entries WHERE operation_id=$1',
    [orderId.slice(2)]),/append-only/i);
  assert.equal((await prove(db,p)).executionAuthorized,false);
}));

test('B1 signed OPEN account does not block an unrelated M4 simulation pair',()=>run(async db=>{
  const o=order(context(),alice.address,'110','BUY');
  const sig=await alice.signTypedData(buildSimPerpOrderTypedData(o,domain,NOW));
  await admitSimPerpOrder(o,sig,domain,manager(db),context().config,context().trustedSourceId,
    context().snapshot,NOW);
  const carol=privateKeyToAccount(generatePrivateKey());
  const out=await applySimPairedFill(manager(db),{
    executionMode:'SIMULATION_ONLY',fillId:'0x'+'9'.repeat(64),
    priceAtomic:'6500000',quantityAtomic:'100000000',
    buyerAccount:bob.address,sellerAccount:carol.address,
    buyerExpectedVersion:0,sellerExpectedVersion:0,
  },context());
  assert.equal(out.openInterest.openInterestAtomic,'100000000');
  assert.equal((await counts(db))[2],1);
}));

test('B1 migration can be reapplied without resetting current signed orders',()=>run(async db=>{
  await create(db);const before=await counts(db);
  const sql=await readFile(fileURLToPath(new URL('../sql/015_perp_signed_opening_fence.sql',import.meta.url)),'utf8');
  await db.exec(sql);
  assert.deepEqual(await counts(db),before);
}));

test('B1 raw balance decrement cannot undercollateralize a signed OPEN order',()=>run(async db=>{
  await create(db);
  const before=await db.query(
    "SELECT balance FROM perp_margin_balances WHERE account=$1 AND bucket='RESERVED'",
    [alice.address.toLowerCase()]);
  await assert.rejects(db.query(
    "UPDATE perp_margin_balances SET balance='0' WHERE account=$1 AND bucket='RESERVED'",
    [alice.address.toLowerCase()]),/signed OPEN margin reservation exceeds reserved bucket/i);
  const after=await db.query(
    "SELECT balance FROM perp_margin_balances WHERE account=$1 AND bucket='RESERVED'",
    [alice.address.toLowerCase()]);
  assert.equal((after.rows[0] as {balance:string}).balance,
    (before.rows[0] as {balance:string}).balance);
}));
