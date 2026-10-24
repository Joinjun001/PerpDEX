import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {keccak256,toHex} from 'viem';
import {buildOrderTypedData} from '../src/orders/signature.ts';
import {getIsolatedMarginBalances} from '../src/perp/margin-ledger.ts';
import {buildSimPerpOrderTypedData,buildSimPerpCancelTypedData,admitSimPerpOrder,
  cancelSimPerpOrder,hashPerpMarketConfig,SimPerpOrderError,type SimPerpOrderInput,type SimCancelInput} from '../src/perp/sim-order.ts';
import type {OrderTransactionManager} from '../src/orders/order-transactions.ts';
import type {PerpMarketConfig} from '../src/perp/market-config.ts';
import type {PerpPriceSnapshot} from '../src/perp/price-snapshot.ts';

const domain={chainId:11155111,verifyingContract:'0x1111111111111111111111111111111111111111'};
const ALT_DOMAIN={chainId:1,verifyingContract:domain.verifyingContract};
const token='0x3333333333333333333333333333333333333333';
const wallet=privateKeyToAccount(generatePrivateKey());
const other=privateKeyToAccount(generatePrivateKey());
const source='local-fixture-registry';
const NOW=Math.floor(Date.now()/1000);
let nonce=400001;
let db:PGlite;
const START=(100000000000n).toString();
const RESERVE=(6510000000n).toString();
const REQUIRED=['001_order_nonces','008_perp_margin_ledger','009_perp_sim_orders'];
function transaction(instance:PGlite):OrderTransactionManager{
  return {withTransaction:fn=>instance.transaction(async client=>fn({
    async query(sql,params=[]){const r=await client.query(sql,[...params]);return {rows:r.rows,rowCount:r.affectedRows??null};},
  }))};
}
async function initialize(path?:string){
  const database=new PGlite(path);await database.waitReady;
  for(const name of REQUIRED)await database.exec(await readFile(fileURLToPath(new URL(`../sql/${name}.sql`,import.meta.url)),'utf8'));
  return database;
}
function policy(changes:Partial<PerpMarketConfig>={}):PerpMarketConfig {
  return {market:'BTC-USD-PERP',baseAsset:'BTC',quoteAsset:'USD',collateralToken:token,
    chainId:domain.chainId,verifyingContract:domain.verifyingContract,sourceId:source,
    oracleSourceId:'local-mock',revision:2,status:'APPROVED',validFrom:NOW-60,validUntil:NOW+900,
    baseDecimals:8,priceDecimals:2,collateralDecimals:6,tickSize:'5',lotSize:'100',
    minQuantity:'100',maxQuantity:'1000000000000000',maxOpenInterest:'2000000000000000',
    initialMarginBps:1000,maintenanceMarginBps:500,maxLeverage:10,
    maxPriceDeviationBps:300,maxConfidenceBps:100,maxOracleAgeSeconds:30,...changes};
}
function oracle(changes:Partial<PerpPriceSnapshot>={}):PerpPriceSnapshot{
  return {chainId:domain.chainId,verifyingContract:domain.verifyingContract,market:'BTC-USD-PERP',
    configRevision:2,sourceId:'local-mock',indexPrice:'6500000',markPrice:'6510000',
    publishedAt:NOW-1,sourceSequence:'10',confidenceBps:10,...changes};
}
function order(changes:Partial<SimPerpOrderInput>={}):SimPerpOrderInput{
  return {account:wallet.address,market:'BTC-USD-PERP',side:'BUY',price:'6510000',
    quantity:'100000000',nonce:String(nonce++),expiresAt:NOW+600,
    reduceOnly:false,marginMode:'ISOLATED',configRevision:2,collateralToken:token,
    executionMode:'SIMULATION_ONLY',marketConfigHash:hashPerpMarketConfig(policy()),...changes};
}
async function sign(input:SimPerpOrderInput, signer=wallet, dom=domain){
  return signer.signTypedData(buildSimPerpOrderTypedData(input,dom,NOW));
}
async function cancelSign(input:SimCancelInput, signer=wallet){
  return signer.signTypedData(buildSimPerpCancelTypedData(input,domain,NOW));
}
async function opening(database:PGlite,amount=START,account=wallet.address){
  // TEST FIXTURE ONLY: no usable production credit/mint API is provided.
  await database.query(`INSERT INTO perp_margin_balances
    (chain_id,verifying_contract,market,collateral_token,account,bucket,balance)
    VALUES($1,$2,'BTC-USD-PERP',$3,$4,'AVAILABLE',$5)`,
    [domain.chainId,domain.verifyingContract,token,account.toLowerCase(),amount]);
}
function account(input=order({nonce:'100'})){
  return {market:input.market,account:input.account,collateralToken:input.collateralToken};
}
async function totals(database:PGlite,input:SimPerpOrderInput){
  return getIsolatedMarginBalances(database,domain,account(input));
}
async function admission(database:PGlite,input:SimPerpOrderInput){
  return admitSimPerpOrder(input,await sign(input),domain,transaction(database),policy(),source,oracle(),NOW);
}
async function row(database:PGlite,input:SimPerpOrderInput){
  const r=await database.query(`SELECT status,initial_margin,order_id FROM perp_sim_orders
    WHERE chain_id=$1 AND verifying_contract=$2 AND account=$3 AND nonce=$4`,
    [domain.chainId,domain.verifyingContract,input.account.toLowerCase(),input.nonce]);
  return r.rows[0] as {status:string;initial_margin:string;order_id:string}|undefined;
}
before(async()=>{db=await initialize();});
after(async()=>{if(db)await db.close();});

test('v2 signed shadow admission atomically stores nonce/order and correct margin reserve',async()=>{
  await opening(db);
  const input=order();
  const result=await admission(db,input);
  assert.equal(result.initialMargin,RESERVE);
  assert.equal(result.status,'OPEN');
  assert.equal(result.balances.available,(BigInt(START)-BigInt(RESERVE)).toString());
  assert.equal(result.balances.reserved,RESERVE);
  assert.equal(result.balances.total,START);
  assert.equal((await row(db,input))?.order_id,result.orderId);
  const journal=await db.query('SELECT signed_delta FROM perp_margin_entries WHERE operation_id=$1 ORDER BY leg',[result.orderId.slice(2)]);
  assert.deepEqual((journal.rows as {signed_delta:string}[]).map(x=>x.signed_delta),[`-${RESERVE}`,RESERVE]);
  // No public M2 order or matching tables were required or touched by this test.
  const cancel:SimCancelInput={account:input.account,nonce:input.nonce,orderId:result.orderId,
    deadline:NOW+300,executionMode:'SIMULATION_ONLY'};
  await cancelSimPerpOrder(cancel,await cancelSign(cancel),domain,transaction(db),NOW);
});

test('signed v2 cancel changes OPEN to CANCELED and releases exactly the reserved amount',async()=>{
  const input=order();const admitted=await admission(db,input);
  const cancel:SimCancelInput={account:input.account,nonce:input.nonce,orderId:admitted.orderId,
    deadline:NOW+300,executionMode:'SIMULATION_ONLY'};
  const signature=await cancelSign(cancel);
  const result=await cancelSimPerpOrder(cancel,signature,domain,transaction(db),NOW);
  assert.equal(result.status,'CANCELED');
  assert.deepEqual(result.balances,{available:START,reserved:'0',positionMargin:'0',total:START});
  assert.equal((await row(db,input))?.status,'CANCELED');
  await assert.rejects(cancelSimPerpOrder(cancel,signature,domain,transaction(db),NOW),SimPerpOrderError);
  assert.deepEqual(await totals(db,input),result.balances);
  const journalCount=await db.query('SELECT COUNT(*)::INTEGER n FROM perp_margin_operations');
  assert.ok((journalCount.rows[0] as {n:number}).n>=2);
});

test('replay, competing admission requests and canceled nonce never double-reserve',async()=>{
  const input=order();const signature=await sign(input);
  const outcomes=await Promise.allSettled(Array.from({length:6},()=>admitSimPerpOrder(input,signature,domain,
    transaction(db),policy(),source,oracle(),NOW)));
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(outcomes.filter(x=>x.status==='rejected').length,5);
  const saved=await row(db,input);assert.equal(saved?.status,'OPEN');
  assert.equal(((await db.query('SELECT COUNT(*)::INTEGER n FROM perp_margin_entries WHERE operation_id=$1',
    [saved!.order_id.slice(2)])).rows[0] as {n:number}).n,2);
});

test('invalid policy, stale prices, wrong source, signature or insufficient margin cause zero persistent changes',async()=>{
  const scenarios:[Partial<PerpMarketConfig>,Partial<PerpPriceSnapshot>,string|undefined][]=[
    [{status:'DRAFT'}, {}, undefined],
    [{validUntil:NOW-1}, {}, undefined],
    [{chainId:1}, {}, undefined],
    [{initialMarginBps:1500,maintenanceMarginBps:500,maxLeverage:10}, {}, undefined],
    [{}, {publishedAt:NOW-31}, undefined],
    [{}, {sourceId:'untrusted'}, undefined],
    [{}, {markPrice:'9999999'}, undefined],
    [{}, {}, 'wrong-source'],
  ];
  for(let i=0;i<scenarios.length;i++){
    const input=order();const signature=await sign(input);
    const [p,q,s]=scenarios[i];
    await assert.rejects(admitSimPerpOrder(input,signature,domain,transaction(db),policy(p),s??source,oracle(q),NOW));
    assert.equal(await row(db,input),undefined);
    const nonceRow=await db.query('SELECT status FROM order_nonces WHERE nonce=$1',[input.nonce]);
    assert.equal(nonceRow.rows.length,0);
  }
  const noFunds=order({account:other.address});const sig=await sign(noFunds,other);
  await assert.rejects(admitSimPerpOrder(noFunds,sig,domain,transaction(db),policy(),source,oracle(),NOW));
  assert.equal(await row(db,noFunds),undefined);
  assert.equal((await db.query('SELECT status FROM order_nonces WHERE nonce=$1',[noFunds.nonce])).rows.length,0);
});

test('v1 signature and tampered v2 policy/limit/account cannot admit a perp shadow order',async()=>{
  const input=order();
  const v1=await wallet.signTypedData(buildOrderTypedData(input,domain,NOW));
  await assert.rejects(admitSimPerpOrder(input,v1,domain,transaction(db),policy(),source,oracle(),NOW),SimPerpOrderError);
  const signature=await sign(input);
  for(const patch of [{price:'6510005'},{quantity:'100000100'},{configRevision:3},
    {collateralToken:'0x4444444444444444444444444444444444444444'},
    {market:'ETH-USD-PERP'},{account:other.address}]){
    await assert.rejects(admitSimPerpOrder({...input,...patch},signature,domain,
      transaction(db),policy(),source,oracle(),NOW));
  }
  assert.equal(await row(db,input),undefined);
});

test('wrong chain and unsafe shadow fields reject before nonce or reservation mutation',async()=>{
  const input=order(),signature=await sign(input);
  await assert.rejects(admitSimPerpOrder(input,signature,ALT_DOMAIN,transaction(db),policy(),source,oracle(),NOW));
  for(const fields of [{reduceOnly:true as false},{marginMode:'CROSS' as 'ISOLATED'},
    {executionMode:'LIVE' as 'SIMULATION_ONLY'},{configRevision:0},
    {price:'0'},{price:'6510001'},{quantity:'99'},
  ]){
    await assert.rejects(admitSimPerpOrder({...input,...fields},signature,domain,
      transaction(db),policy(),source,oracle(),NOW));
  }
  assert.equal(await row(db,input),undefined);
});

test('forced reservation posting failure rolls back v2 nonce and shadow order together',async()=>{
  const input=order(),signature=await sign(input);
  await db.exec(`ALTER TABLE perp_margin_entries ADD CONSTRAINT block_sim_reserve CHECK(
    operation_id <> '${(await import('viem')).hashTypedData(buildSimPerpOrderTypedData(input,domain,NOW)).slice(2)}')`);
  try{
    await assert.rejects(admitSimPerpOrder(input,signature,domain,transaction(db),policy(),source,oracle(),NOW));
    assert.equal(await row(db,input),undefined);
    const nonceRecord=await db.query('SELECT status FROM order_nonces WHERE nonce=$1',[input.nonce]);
    assert.equal(nonceRecord.rows.length,0);
  }finally{await db.exec('ALTER TABLE perp_margin_entries DROP CONSTRAINT block_sim_reserve');}
  assert.equal((await admission(db,input)).status,'OPEN');
});

test('tampered or wrong signer cancellation leaves order and margin unchanged',async()=>{
  const input=order(),accepted=await admission(db,input);
  const before=await totals(db,input);
  const cancel:SimCancelInput={account:input.account,nonce:input.nonce,orderId:accepted.orderId,
    deadline:NOW+300,executionMode:'SIMULATION_ONLY'};
  await assert.rejects(cancelSimPerpOrder(cancel,await cancelSign(cancel,other),domain,transaction(db),NOW),SimPerpOrderError);
  await assert.rejects(cancelSimPerpOrder({...cancel,orderId:'0x'+'f'.repeat(64)},await cancelSign(cancel),domain,transaction(db),NOW),SimPerpOrderError);
  await assert.rejects(cancelSimPerpOrder(cancel,await cancelSign(cancel),ALT_DOMAIN,transaction(db),NOW),SimPerpOrderError);
  assert.deepEqual(await totals(db,input),before);
  assert.equal((await row(db,input))?.status,'OPEN');
});

test('failed release posting rolls back cancellation status and nonce tombstone',async()=>{
  const input=order(),accepted=await admission(db,input);
  const cancel:SimCancelInput={account:input.account,nonce:input.nonce,orderId:accepted.orderId,
    deadline:NOW+300,executionMode:'SIMULATION_ONLY'};
  const signature=await cancelSign(cancel);
  const before=await totals(db,input);
  // Existing reserve postings debit AVAILABLE at leg=0. This only rejects a new
  // RELEASE credit into AVAILABLE at leg=1, after the status+nonce mutations.
  const blockedId=keccak256(toHex(`perp-sim-cancel:${accepted.orderId}`)).slice(2);
  await db.exec(`ALTER TABLE perp_margin_entries ADD CONSTRAINT stop_sim_cancel CHECK (operation_id <> '${blockedId}')`);
  try{
    await assert.rejects(cancelSimPerpOrder(cancel,signature,domain,transaction(db),NOW));
    assert.equal((await row(db,input))?.status,'OPEN');
    const nr=await db.query('SELECT status FROM order_nonces WHERE nonce=$1',[input.nonce]);
    assert.equal((nr.rows[0] as {status:string}).status,'USED');
    assert.deepEqual(await totals(db,input),before);
  }finally{await db.exec('ALTER TABLE perp_margin_entries DROP CONSTRAINT stop_sim_cancel');}
  assert.equal((await cancelSimPerpOrder(cancel,signature,domain,transaction(db),NOW)).status,'CANCELED');
});

test('disk restart preserves shadow order, reservation, nonce and only one signed release', {timeout:30000},async()=>{
  const path=await mkdtemp(join(tmpdir(),'perpdex-sim-order-'));
  let database:PGlite|undefined;
  try{
    database=await initialize(path);await opening(database);
    const input=order(),signed=await sign(input);
    const saved=await admitSimPerpOrder(input,signed,domain,transaction(database),policy(),source,oracle(),NOW);
    await database.close();database=undefined;
    database=await initialize(path);
    assert.equal((await row(database,input))?.status,'OPEN');
    await assert.rejects(admitSimPerpOrder(input,signed,domain,transaction(database),policy(),source,oracle(),NOW));
    const cancel:SimCancelInput={account:input.account,nonce:input.nonce,orderId:saved.orderId,
      deadline:NOW+300,executionMode:'SIMULATION_ONLY'};
    const signature=await cancelSign(cancel);
    assert.equal((await cancelSimPerpOrder(cancel,signature,domain,transaction(database),NOW)).balances.total,START);
    await database.close();database=undefined;
    database=await initialize(path);
    assert.equal((await row(database,input))?.status,'CANCELED');
    assert.deepEqual(await totals(database,input),{available:START,reserved:'0',positionMargin:'0',total:START});
    await assert.rejects(cancelSimPerpOrder(cancel,signature,domain,transaction(database),NOW));
  }finally{if(database)await database.close();await rm(path,{recursive:true,force:true});}
});
