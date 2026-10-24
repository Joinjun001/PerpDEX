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





async function signedCancel(db:PGlite,inputAccount=alice){
 const o=(await db.query('SELECT order_id,nonce FROM perp_sim_orders WHERE account=$1',
 [inputAccount.address.toLowerCase()])).rows[0] as {order_id:string;nonce:string};
 const cancel={account:inputAccount.address,nonce:o.nonce,orderId:o.order_id,
   deadline:NOW+300,executionMode:'SIMULATION_ONLY' as const};
 return {cancel,signature:await inputAccount.signTypedData(buildSimPerpCancelTypedData(cancel,domain,NOW))};
}
test('C3-B signed cancellation commits immutable receipt, nonce and full M3 RELEASE',()=>run(async db=>{
 await create(db);
 const {cancel,signature}=await signedCancel(db);
 const before=await counts(db);
 const result=await cancelSimPerpOrder(cancel,signature,domain,manager(db),NOW);
 assert.equal(result.status,'CANCELED');assert.equal(result.balances.reserved,'0');
 const receipt=await db.query('SELECT * FROM perp_signed_cancel_receipts WHERE order_id=$1',[cancel.orderId]);
 assert.equal(receipt.rows.length,1);
 const r=receipt.rows[0] as Record<string,string>;
 assert.equal(r.amount,((await db.query('SELECT initial_margin FROM perp_sim_orders WHERE account=$1',
  [alice.address.toLowerCase()])).rows[0] as {initial_margin:string}).initial_margin);
 assert.equal(r.cancel_signature,signature.toLowerCase());
 const entries=await db.query('SELECT leg,bucket,signed_delta FROM perp_margin_entries WHERE operation_id=$1 ORDER BY leg',[r.release_id]);
 assert.deepEqual((entries.rows as {leg:number;bucket:string}[]).map(x=>x.bucket),['RESERVED','AVAILABLE']);
 assert.equal((await reconcileSignedSimAccount(alice.address,context(),manager(db))).canceledOrderCount,1);
 const after=await counts(db);
 assert.equal(after[0]-before[0],1);assert.equal(after[1]-before[1],2);
 assert.equal(((await db.query('SELECT status FROM order_nonces WHERE account=$1',[alice.address.toLowerCase()])).rows[0] as {status:string}).status,'CANCELED');
}));
test('C3-B direct nonce plus order status forgery fails COMMIT and rolls back',()=>run(async db=>{
 await create(db);const before=await counts(db);
 await assert.rejects(db.transaction(async tx=>{
  await tx.query("UPDATE order_nonces SET status='CANCELED' WHERE account=$1",[alice.address.toLowerCase()]);
  await tx.query("UPDATE perp_sim_orders SET status='CANCELED' WHERE account=$1",[alice.address.toLowerCase()]);
 }),/cancellation requires matching immutable receipt/i);
 assert.deepEqual(await counts(db),before);
 assert.equal(((await db.query('SELECT status FROM perp_sim_orders WHERE account=$1',[alice.address.toLowerCase()])).rows[0] as {status:string}).status,'OPEN');
}));
test('C3-B unbacked direct SQL receipt cannot commit before releasing M3 operation',()=>run(async db=>{
 await create(db);
 const {cancel,signature}=await signedCancel(db);
 const original=(await db.query('SELECT * FROM perp_sim_orders WHERE order_id=$1',[cancel.orderId])).rows[0] as Record<string,string|number>;
 await assert.rejects(db.query(`INSERT INTO perp_signed_cancel_receipts
  (chain_id,verifying_contract,account,nonce,order_id,market,collateral_token,
   release_id,amount,cancel_deadline,cancel_digest,cancel_signature)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
  [domain.chainId,domain.verifyingContract,alice.address.toLowerCase(),cancel.nonce,cancel.orderId,
   'BTC-USD-PERP',token,'a'.repeat(64),original.initial_margin,cancel.deadline,'0x'+'a'.repeat(64),signature.toLowerCase()]),
   /foreign key|missing|violates/i);
 assert.equal(((await db.query('SELECT count(*)::int n FROM perp_signed_cancel_receipts')).rows[0] as {n:number}).n,0);
}));
test('C3-B wrong cancellation signer rejected with no changes',()=>run(async db=>{
 await create(db);const before=await counts(db);
 const {cancel}=await signedCancel(db);
 const other=await bob.signTypedData(buildSimPerpCancelTypedData(cancel,domain,NOW));
 await assert.rejects(cancelSimPerpOrder(cancel,other,domain,manager(db),NOW),/invalid simulation cancel signature/i);
 assert.deepEqual(await counts(db),before);
}));
test('C3-B duplicate/parallel signed cancellation never releases twice',()=>run(async db=>{
 await create(db);const {cancel,signature}=await signedCancel(db);
 const result=await Promise.allSettled(Array.from({length:3},
  ()=>cancelSimPerpOrder(cancel,signature,domain,manager(db),NOW)));
 assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(((await db.query('SELECT count(*)::int n FROM perp_signed_cancel_receipts')).rows[0] as {n:number}).n,1);
 const q=await db.query("SELECT count(*)::int n FROM perp_margin_operations WHERE action='RELEASE'");
 assert.equal((q.rows[0] as {n:number}).n,1);
}));
test('C3-B injecting receipt INSERT outage atomically rolls back nonce/status/RELEASE',()=>run(async db=>{
 await create(db);const {cancel,signature}=await signedCancel(db);
 const before=await counts(db);
 const broken:OrderTransactionManager={withTransaction:fn=>manager(db).withTransaction(tx=>fn({
   query:(sql,args)=>{if(sql.includes('INSERT INTO perp_signed_cancel_receipts'))throw Error('injected receipt outage');
     return tx.query(sql,args);},
 }))};
 await assert.rejects(cancelSimPerpOrder(cancel,signature,domain,broken,NOW),/injected receipt outage/);
 assert.deepEqual(await counts(db),before);
 assert.equal(((await db.query('SELECT status FROM perp_sim_orders WHERE account=$1',[alice.address.toLowerCase()])).rows[0] as {status:string}).status,'OPEN');
 assert.equal(((await db.query("SELECT count(*)::int n FROM perp_signed_cancel_receipts")).rows[0] as {n:number}).n,0);
}));
test('C3-B signed receipt is append-only and duplicate order receipt is impossible',()=>run(async db=>{
 await create(db);const {cancel,signature}=await signedCancel(db);
 await cancelSimPerpOrder(cancel,signature,domain,manager(db),NOW);
 await assert.rejects(db.query("UPDATE perp_signed_cancel_receipts SET amount='1'"),/append-only/i);
 await assert.rejects(db.query('DELETE FROM perp_signed_cancel_receipts'),/append-only/i);
 await assert.rejects(cancelSimPerpOrder(cancel,signature,domain,manager(db),NOW),/already terminal/i);
 const receipt=await db.query('SELECT amount FROM perp_signed_cancel_receipts');
 assert.equal(receipt.rows.length,1);
}));
test('C3-B canceled account RESERVED DB balance tampering rejected at COMMIT',()=>run(async db=>{
 await create(db);const {cancel,signature}=await signedCancel(db);
 await cancelSimPerpOrder(cancel,signature,domain,manager(db),NOW);
 await assert.rejects(db.query("UPDATE perp_margin_balances SET balance='1' WHERE account=$1 AND bucket='RESERVED'",
  [alice.address.toLowerCase()]),/posting sum/i);
 const result=await reconcileSignedSimAccount(alice.address,context(),manager(db));
 assert.equal(result.balances.reserved,'0');
}));
test('C3-B SQL 018 idempotent and preserves a committed signed cancellation',()=>run(async db=>{
 await create(db);const {cancel,signature}=await signedCancel(db);
 await cancelSimPerpOrder(cancel,signature,domain,manager(db),NOW);
 const sql=await readFile(fileURLToPath(new URL('../sql/018_perp_signed_cancel_integrity.sql',import.meta.url)),'utf8');
 await db.exec(sql);
 const r=await db.query('SELECT count(*)::int n FROM perp_signed_cancel_receipts');
 assert.equal((r.rows[0] as {n:number}).n,1);
}));

test('C3-B SQL 017 without 018 fails closed and legacy unaudited cancels block migration',async()=>{
 const db=new PGlite();await db.waitReady;
 try{
  for(const name of ['001_order_nonces','008_perp_margin_ledger','009_perp_sim_orders',
    '010_perp_position_ledger','011_perp_pair_clearing','012_perp_reduce_reservations',
    '013_perp_guarded_position_commit','014_perp_reduce_ledger_integrity',
    '015_perp_signed_opening_fence','016_perp_signed_pair_preparations',
    '017_perp_signed_pair_executions']){
   await db.exec(await readFile(fileURLToPath(new URL(`../sql/${name}.sql`,import.meta.url)),'utf8'));
  }
  for(const bucket of ['AVAILABLE','POSITION','RESERVED']){
   await db.query(`INSERT INTO perp_margin_balances
    (chain_id,verifying_contract,market,collateral_token,account,bucket,balance)
    VALUES($1,$2,'BTC-USD-PERP',$3,$4,$5,$6)`,
    [domain.chainId,domain.verifyingContract,token,alice.address.toLowerCase(),
     bucket,bucket==='AVAILABLE'?'100000000000':'0']);
  }
  const item=order(context(),alice.address,'101','BUY');
  const signed=await alice.signTypedData(buildSimPerpOrderTypedData(item,domain,NOW));
  await admitSimPerpOrder(item,signed,domain,manager(db),context().config,
    context().trustedSourceId,context().snapshot,NOW);
  const {cancel,signature}=await signedCancel(db);
  await assert.rejects(cancelSimPerpOrder(cancel,signature,domain,manager(db),NOW),
    /requires commit-fenced SQL 018/i);
  await db.transaction(async tx=>{
   await tx.query("UPDATE order_nonces SET status='CANCELED' WHERE account=$1",[alice.address.toLowerCase()]);
   await tx.query("UPDATE perp_sim_orders SET status='CANCELED' WHERE account=$1",[alice.address.toLowerCase()]);
  });
  const sql=await readFile(fileURLToPath(new URL('../sql/018_perp_signed_cancel_integrity.sql',import.meta.url)),'utf8');
  await assert.rejects(db.exec(sql),/legacy CANCELED signed orders require supervised authenticated receipt migration/i);
 }finally{await db.close();}
});
