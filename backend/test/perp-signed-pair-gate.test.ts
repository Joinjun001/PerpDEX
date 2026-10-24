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
    '013_perp_guarded_position_commit','014_perp_reduce_ledger_integrity']){
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

test('C2-A two signed orders prove the same matched price, M3 reserves and M4/OI without any writes',()=>run(async db=>{
  const p=await create(db,context(),'6565000','6435000');
  const before=await counts(db);
  const result=await prove(db,p);
  assert.equal(result.executionAuthorized,false);
  assert.equal(result.buyer.preTrade.decision,'SIMULATION_ELIGIBLE');
  assert.equal(result.seller.preTrade.decision,'SIMULATION_ELIGIBLE');
  assert.equal(result.buyer.preTrade.candidate?.position.lastFillId,p.fillId);
  assert.equal(result.seller.preTrade.candidate?.position.lastFillId,p.fillId);
  assert.equal(result.buyer.preTrade.candidate?.position.sizeSignedAtomic,'100000000');
  assert.equal(result.seller.preTrade.candidate?.position.sizeSignedAtomic,'-100000000');
  assert.equal(result.buyer.preTrade.candidate?.realizedDeltaAtomic,'0');
  assert.equal(result.seller.preTrade.candidate?.realizedDeltaAtomic,'0');
  assert.equal(result.marketOiVersion,0);
  assert.deepEqual(await counts(db),before);
}));

test('C2-A denies self-match, forged signature, swapped side and signed limit violations',()=>run(async db=>{
  const p=await create(db,context(),'6565000','6435000');
  const before=await counts(db);
  await assert.rejects(prove(db,{...p,seller:p.buyer}),/self-match/i);
  await assert.rejects(prove(db,{...p,buyer:{...p.buyer,signature:p.seller.signature}}),/signature/i);
  await assert.rejects(prove(db,{...p,buyer:p.seller,seller:p.buyer}),/sides/i);
  await assert.rejects(prove(db,{...p,priceAtomic:'6565005'}),/signed limits/i);
  await assert.rejects(prove(db,{...p,priceAtomic:'6434995'}),/signed limits/i);
  await assert.rejects(prove(db,{...p,priceAtomic:'6500001'}),/ticks/i);
  await assert.rejects(prove(db,{...p,quantityAtomic:'100000100'}),/exceeds signed/i);
  assert.deepEqual(await counts(db),before);
}));

test('C2-A rejects distorted M3 reserve posting and invalid OI without partial commit',()=>run(async db=>{
  const p=await create(db);
  await db.query(`UPDATE perp_margin_operations SET amount='1'
    WHERE account=$1 AND action='RESERVE'`,[bob.address.toLowerCase()]);
  await assert.rejects(prove(db,p),/reserve operation/i);
  const stored=await db.query(`SELECT initial_margin FROM perp_sim_orders WHERE account=$1`,
    [bob.address.toLowerCase()]);
  await db.query(`UPDATE perp_margin_operations SET amount=$1
    WHERE account=$2 AND action='RESERVE'`,[(stored.rows[0] as {initial_margin:string}).initial_margin,bob.address.toLowerCase()]);
  await db.query(`UPDATE perp_market_open_interest SET open_interest_atomic='1'`);
  await assert.rejects(prove(db,p),/OI|positions/i);
  assert.deepEqual((await counts(db)).slice(3),[0,0]);
}));

test('C2-A rejects canceled opposite order, changed trusted oracle and different position version',()=>run(async db=>{
  const p=await create(db);
  await assert.rejects(prove(db,p,{...context(),snapshot:{...context().snapshot,sourceSequence:'102'}}),/oracle|stale/i);
  await assert.rejects(prove(db,{...p,seller:{...p.seller,expectedPositionVersion:1}}),/position version/i);
  const id=(await db.query('SELECT order_id FROM perp_sim_orders WHERE account=$1',[bob.address.toLowerCase()]))
    .rows[0] as {order_id:string};
  const cancel={account:bob.address,nonce:'101',orderId:id.order_id,
    deadline:NOW+300,executionMode:'SIMULATION_ONLY' as const};
  const sig=await bob.signTypedData(buildSimPerpCancelTypedData(cancel,domain,NOW));
  await cancelSimPerpOrder(cancel,sig,domain,manager(db),NOW);
  await assert.rejects(prove(db,p),/shadow order|stale/i);
  assert.deepEqual((await counts(db)).slice(3),[0,0]);
}));

test('C2-A refuses already committed paired fill ID even with otherwise valid opening intents',()=>run(async db=>{
  const p=await create(db);
  await applySimPairedFill(manager(db),{
    executionMode:'SIMULATION_ONLY',fillId:p.fillId,priceAtomic:p.priceAtomic,
    quantityAtomic:p.quantityAtomic,buyerAccount:alice.address,sellerAccount:bob.address,
    buyerExpectedVersion:0,sellerExpectedVersion:0,
  },context());
  await assert.rejects(prove(db,{...p,buyer:{...p.buyer,expectedPositionVersion:1},
    seller:{...p.seller,expectedPositionVersion:1}}),/already committed/i);
}));

test('C2-A injected SQL failure rolls back read-only transaction and keeps both orders reserved',()=>run(async db=>{
  const p=await create(db);const before=await counts(db);
  let seen=0;
  const broken2:OrderTransactionManager={withTransaction:fn=>manager(db).withTransaction(tx=>fn({
    query:(sql,args)=>{if(sql.includes('FROM perp_margin_entries')&&++seen===2)
      throw new Error('simulated SQL outage');return tx.query(sql,args);},
  }))};
  await assert.rejects(prove(db,p,context(),broken2),/simulated SQL outage/i);
  assert.deepEqual(await counts(db),before);
}));
