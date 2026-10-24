import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PGlite} from '@electric-sql/pglite';
import {keccak256,toHex} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import type {OrderTransactionManager} from '../src/orders/order-transactions.ts';
import {buildOrderTypedData} from '../src/orders/signature.ts';
import {acceptAndMatchSignedOrder} from '../src/matching/accept-and-match.ts';
import {listSettlementSourceFills,type SettlementSourceFill} from '../src/settlement/fill-source.ts';
import {enqueueSettlementFill,claimSettlementPreparation,finishSettlementPreparation} from '../src/settlement/outbox.ts';
import {buildSettlementApprovalTypedData,type SettlementPolicyInput} from '../src/settlement/policy.ts';
import {recordApprovedSettlementIntent,getSettlementIntent,executeSettlementDryRun,
  quarantineInterruptedSimulation,SettlementIntentError} from '../src/settlement/dry-run.ts';
import {InMemoryMockReceiptProvider,reconcileMockSettlement,getSettlementReconciliation,
  SettlementReconciliationError,type MockReceipt,type MockObservation} from '../src/settlement/reconcile.ts';

const DOMAIN={chainId:11155111,verifyingContract:'0x1111111111111111111111111111111111111111'};
const WRONG={chainId:1,verifyingContract:DOMAIN.verifyingContract};
const buyer=privateKeyToAccount(generatePrivateKey()),seller=privateKeyToAccount(generatePrivateKey());
const approver=privateKeyToAccount(generatePrivateKey()),attacker=privateKeyToAccount(generatePrivateKey());
let db:PGlite,seq=50000;
const now=Math.floor(Date.now()/1000);
function tx(instance:PGlite):OrderTransactionManager{
  return {withTransaction:fn=>instance.transaction(async client=>fn({
    async query(sql,values=[]){const r=await client.query(sql,[...values]);return {rows:r.rows,rowCount:r.affectedRows??null};},
  }))};
}
async function initialized(directory?:string){
  const instance=new PGlite(directory);await instance.waitReady;
  for(const name of ['001_order_nonces','002_orders','003_order_cancel_receipts','004_order_book','005_settlement_outbox','006_settlement_intents','007_settlement_reconciliations']){
    await instance.exec(await readFile(fileURLToPath(new URL('../sql/'+name+'.sql',import.meta.url)),'utf8'));
  }
  return instance;
}
async function place(wallet:typeof buyer,market:string,side:'BUY'|'SELL',dbInstance=db){
  const order={account:wallet.address,market,side,price:side==='BUY'?'110':'90',quantity:'12',nonce:String(seq++),expiresAt:now+3600};
  const signature=await wallet.signTypedData(buildOrderTypedData(order,DOMAIN,now));
  return acceptAndMatchSignedOrder(order,signature,DOMAIN,tx(dbInstance),now);
}
async function fill(market:string,dbInstance=db):Promise<SettlementSourceFill>{
  await place(seller,market,'SELL',dbInstance);
  const taker=await place(buyer,market,'BUY',dbInstance);
  const all=await listSettlementSourceFills(dbInstance,DOMAIN);
  return all.find(x=>x.takerOrderId===taker.orderId)!;
}
async function ready(source:SettlementSourceFill,dbInstance=db){
  await enqueueSettlementFill(tx(dbInstance),DOMAIN,source.fillId);
  const lease=await claimSettlementPreparation(tx(dbInstance),DOMAIN,60);
  assert.equal(lease?.fillId,source.fillId);
  assert.equal(await finishSettlementPreparation(tx(dbInstance),DOMAIN,source.fillId,lease!.leaseToken!),true);
}
function policy(source:SettlementSourceFill,changes:Partial<SettlementPolicyInput>={}):SettlementPolicyInput{
  return {policyId:'test-operator-signed',revision:2,status:'APPROVED',chainId:DOMAIN.chainId,
    verifyingContract:DOMAIN.verifyingContract,market:source.market,
    vault:'0x2222222222222222222222222222222222222222',
    token:'0x3333333333333333333333333333333333333333',tokenDecimals:6,
    transferDirection:'BUYER_TO_SELLER',settlementModel:'EXPLICIT_APPROVED_TRANSFER',
    marginModel:'EXTERNAL_RISK_ENGINE',feeModel:'EXTERNALLY_ACCOUNTED',feeBps:0,
    maxAmountBaseUnits:'999999999999999999999999999999999',approver:approver.address,
    validFrom:now-100,validUntil:now+1500,...changes};
}
async function approval(source:SettlementSourceFill,p=policy(source),amount='1000000',signer=approver){
  const deadline=now+600;
  return {amountBaseUnits:amount,deadline,
    signature:await signer.signTypedData(buildSettlementApprovalTypedData(source,p,amount,deadline,DOMAIN,now))};
}
async function make(source:SettlementSourceFill,dbInstance=db){
  await ready(source,dbInstance);
  const p=policy(source),signed=await approval(source,p);
  const record=await recordApprovedSettlementIntent(tx(dbInstance),DOMAIN,source.fillId,p,signed,now);
  return {p,signed,record};
}

const provider=new InMemoryMockReceiptProvider();
const baseHash='0x'+'a'.repeat(64);
const baseBlock='0x'+'b'.repeat(64);
const ALT_BLOCK='0x'+'c'.repeat(64);
function receipt(source:SettlementSourceFill,changes:Partial<MockReceipt>={}):MockReceipt {
  return {chainId:DOMAIN.chainId,vault:'0x2222222222222222222222222222222222222222',
    tradeId:source.tradeId,transactionHash:baseHash,blockHash:baseBlock,
    blockNumber:'424242',confirmations:12,outcome:'SUCCESS',settledTrades:true,
    event:{tradeId:source.tradeId,token:'0x3333333333333333333333333333333333333333',
      from:buyer.address.toLowerCase(),to:seller.address.toLowerCase(),amount:'1000000'},...changes};
}
async function simulated(source:SettlementSourceFill,database=db) {
  await make(source,database);
  await executeSettlementDryRun(tx(database),DOMAIN,source.fillId);
}
function setReceipt(source:SettlementSourceFill,changes:Partial<MockReceipt>={}){
  provider.set(source.tradeId,{kind:'RECEIPT',receipt:receipt(source,changes)});
}
async function reconciliation(source:SettlementSourceFill,dbInstance=db,fixture=provider){
  return reconcileMockSettlement(tx(dbInstance),DOMAIN,source.fillId,fixture);
}
before(async()=>{db=await initialized();});
after(async()=>{if(db)await db.close();});

test('missing mock receipt remains UNCONFIRMED and cannot imply transfer',async()=>{
  const source=await fill('RECON1-USDC');await simulated(source);
  const row=await reconciliation(source);
  assert.equal(row.status,'UNCONFIRMED');
  assert.equal(row.source,'MOCK_READONLY');
  assert.equal(row.txHash,null);assert.equal(row.evidenceHash,null);
  assert.equal(row.observationCount,1);
  assert.equal((await getSettlementIntent(db,DOMAIN,source.fillId))?.status,'SIMULATED');
  assert.deepEqual(await getSettlementReconciliation(db,DOMAIN,source.fillId),row);
});

test('pending, unavailable, and missing mock receipts trigger RECHECK_REQUIRED without resend',async()=>{
  const source=await fill('RECON2-USDC');await simulated(source);
  provider.set(source.tradeId,{kind:'PENDING'});
  assert.equal((await reconciliation(source)).status,'RECHECK_REQUIRED');
  provider.set(source.tradeId,{kind:'UNAVAILABLE'});
  assert.equal((await reconciliation(source)).status,'RECHECK_REQUIRED');
  provider.set(source.tradeId,{kind:'MISSING'});
  const current=await reconciliation(source);
  assert.equal(current.status,'RECHECK_REQUIRED');assert.equal(current.observationCount,3);
  assert.equal(current.txHash,null);
  assert.equal((await getSettlementIntent(db,DOMAIN,source.fillId))?.status,'SIMULATED');
});

test('mock success requires canonical Settled event, settledTrades=true and sufficient confirmations',async()=>{
  const source=await fill('RECON3-USDC');await simulated(source);
  setReceipt(source,{confirmations:1});
  const pending=await reconciliation(source);
  assert.equal(pending.status,'RECHECK_REQUIRED');assert.ok(pending.txHash);
  setReceipt(source,{confirmations:12});
  const verified=await reconciliation(source);
  assert.equal(verified.status,'MOCK_VERIFIED');
  assert.ok(verified.evidenceHash);assert.equal(verified.observationCount,2);
  assert.equal(verified.blockNumber,'424242');
  assert.equal((await reconciliation(source)).observationCount,2); // duplicate is read-only
  assert.equal((await getSettlementIntent(db,DOMAIN,source.fillId))?.status,'SIMULATED');
});

test('finalized mock REVERTED receipt produces MOCK_FAILED, never onchain failure assertion',async()=>{
  const source=await fill('RECON4-USDC');await simulated(source);
  setReceipt(source,{outcome:'REVERTED',event:null,settledTrades:false});
  const result=await reconciliation(source);
  assert.equal(result.status,'MOCK_FAILED');
  assert.equal(result.source,'MOCK_READONLY');
  assert.equal(result.evidenceHash,keccak256(toHex(JSON.stringify([
    DOMAIN.chainId,'0x2222222222222222222222222222222222222222',source.tradeId,baseHash,baseBlock,'424242','REVERTED',null,false,
  ]))));
  assert.equal((await reconciliation(source)).status,'MOCK_FAILED');
});

test('conflicting block hash before finality is quarantined UNKNOWN and cannot auto resolve',async()=>{
  const source=await fill('RECON5-USDC');await simulated(source);
  setReceipt(source,{confirmations:1});
  assert.equal((await reconciliation(source)).status,'RECHECK_REQUIRED');
  setReceipt(source,{confirmations:2,blockHash:ALT_BLOCK});
  const quarantined=await reconciliation(source);
  assert.equal(quarantined.status,'UNKNOWN');assert.match(quarantined.lastError!,/contradictory/);
  setReceipt(source,{confirmations:20});
  assert.equal((await reconciliation(source)).status,'UNKNOWN');
  assert.equal((await getSettlementIntent(db,DOMAIN,source.fillId))?.status,'SIMULATED');
});

test('missing after previously seen provisional receipt preserves evidence and needs recheck',async()=>{
  const source=await fill('RECON6-USDC');await simulated(source);
  setReceipt(source,{confirmations:1});
  const first=await reconciliation(source);
  provider.set(source.tradeId,{kind:'MISSING'});
  const second=await reconciliation(source);
  assert.equal(second.status,'RECHECK_REQUIRED');
  assert.equal(second.txHash,first.txHash);assert.equal(second.evidenceHash,first.evidenceHash);
  assert.equal(second.observationCount,2);
});

test('terminal result never regresses to missing, pending, different block or opposite outcome',async()=>{
  const source=await fill('RECON7-USDC');await simulated(source);
  setReceipt(source);const verified=await reconciliation(source);
  for(const candidate of [
    {kind:'MISSING'} as MockObservation,
    {kind:'PENDING'} as MockObservation,
    {kind:'RECEIPT',receipt:receipt(source,{blockHash:ALT_BLOCK})} as MockObservation,
    {kind:'RECEIPT',receipt:receipt(source,{outcome:'REVERTED',event:null,settledTrades:false})} as MockObservation,
    {kind:'RECEIPT',receipt:receipt(source,{confirmations:0})} as MockObservation,
  ]) {
    provider.set(source.tradeId,candidate);
    await assert.rejects(reconciliation(source),SettlementReconciliationError);
    assert.deepEqual(await getSettlementReconciliation(db,DOMAIN,source.fillId),verified);
  }
});

test('wrong chain, vault, tradeId, event or settled state are rejected without persistence',async()=>{
  const source=await fill('RECON8-USDC');await simulated(source);
  const variants:Partial<MockReceipt>[]=[
    {chainId:1},{vault:'0x9999999999999999999999999999999999999999'},
    {tradeId:'0x'+'f'.repeat(64)},{transactionHash:'0x123'},{blockHash:'0x123'},
    {blockNumber:'0'},{confirmations:-1},{confirmations:1.5},
    {settledTrades:false},
    {event:{...receipt(source).event!,amount:'1000001'}},
    {event:{...receipt(source).event!,token:'0x4444444444444444444444444444444444444444'}},
    {event:null},{outcome:'REVERTED',event:receipt(source).event,settledTrades:true},
  ];
  for(const variation of variants){
    setReceipt(source,variation);
    await assert.rejects(reconciliation(source),SettlementReconciliationError);
    assert.equal(await getSettlementReconciliation(db,DOMAIN,source.fillId),null);
  }
});

test('no reconciliation of PREPARED, wrong domain, nonexistent or invalid fillId',async()=>{
  const source=await fill('RECON9-USDC');await make(source);
  setReceipt(source);
  await assert.rejects(reconciliation(source),SettlementReconciliationError);
  await assert.rejects(reconcileMockSettlement(tx(db),{...DOMAIN,chainId:1},source.fillId,provider),SettlementReconciliationError);
  await assert.rejects(reconcileMockSettlement(tx(db),DOMAIN,'0',provider),SettlementReconciliationError);
  await assert.rejects(reconcileMockSettlement(tx(db),DOMAIN,'9999999',provider),SettlementReconciliationError);
  await assert.rejects(reconcileMockSettlement(tx(db),DOMAIN,source.fillId,provider,0),SettlementReconciliationError);
  await assert.rejects(reconcileMockSettlement(tx(db),DOMAIN,source.fillId,{} as InMemoryMockReceiptProvider),SettlementReconciliationError);
  assert.equal(await getSettlementReconciliation(db,DOMAIN,source.fillId),null);
});

test('concurrent confirmations persist exactly one terminal row and no duplicate trade record',async()=>{
  const source=await fill('RECON10-USDC');await simulated(source);setReceipt(source);
  const all=await Promise.all(Array.from({length:8},()=>reconciliation(source)));
  assert.ok(all.every(x=>x.status==='MOCK_VERIFIED'));
  const count=await db.query('SELECT COUNT(*)::INTEGER AS n FROM settlement_reconciliations WHERE trade_id=$1',[source.tradeId]);
  assert.equal((count.rows[0] as {n:number}).n,1);
  assert.equal((await getSettlementReconciliation(db,DOMAIN,source.fillId))?.status,'MOCK_VERIFIED');
});

test('SQL constraint failure rolls back observation; correct retry is safe',async()=>{
  const source=await fill('RECON11-USDC');await simulated(source);setReceipt(source);
  await db.exec(`ALTER TABLE settlement_reconciliations ADD CONSTRAINT reject_mock_receipt CHECK(fill_id <> ${source.fillId})`);
  try {
    await assert.rejects(reconciliation(source),/reject_mock_receipt/);
    assert.equal(await getSettlementReconciliation(db,DOMAIN,source.fillId),null);
  }finally{await db.exec('ALTER TABLE settlement_reconciliations DROP CONSTRAINT reject_mock_receipt');}
  assert.equal((await reconciliation(source)).status,'MOCK_VERIFIED');
});

test('disk restart retains mock terminal evidence and does not accept contradictory snapshots', {timeout:30000},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'perpdex-reconcile-'));
  let disk:PGlite|undefined;
  try {
    disk=await initialized(directory);
    const source=await fill('RECON12-USDC',disk);await simulated(source,disk);
    setReceipt(source);
    const final=await reconciliation(source,disk);
    assert.equal(final.status,'MOCK_VERIFIED');
    await disk.close();disk=undefined;
    disk=await initialized(directory);
    assert.deepEqual(await getSettlementReconciliation(disk,DOMAIN,source.fillId),final);
    setReceipt(source,{blockHash:ALT_BLOCK});
    await assert.rejects(reconciliation(source,disk),SettlementReconciliationError);
    assert.deepEqual(await getSettlementReconciliation(disk,DOMAIN,source.fillId),final);
  }finally{if(disk)await disk.close();await rm(directory,{recursive:true,force:true});}
});

test('quarantined UNKNOWN intent can be checked in mock without permitting automatic resubmit',async()=>{
  const source=await fill('RECON13-USDC');await simulated(source);
  await db.query("UPDATE settlement_intents SET status='UNKNOWN' WHERE fill_id=$1",[source.fillId]);
  setReceipt(source);
  assert.equal((await reconciliation(source)).status,'MOCK_VERIFIED');
  await assert.rejects(executeSettlementDryRun(tx(db),DOMAIN,source.fillId),SettlementIntentError);
});
