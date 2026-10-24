import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PGlite} from '@electric-sql/pglite';
import {decodeFunctionData,keccak256} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import type {OrderTransactionManager} from '../src/orders/order-transactions.ts';
import {buildOrderTypedData} from '../src/orders/signature.ts';
import {acceptAndMatchSignedOrder} from '../src/matching/accept-and-match.ts';
import {listSettlementSourceFills,type SettlementSourceFill} from '../src/settlement/fill-source.ts';
import {enqueueSettlementFill,claimSettlementPreparation,finishSettlementPreparation} from '../src/settlement/outbox.ts';
import {buildSettlementApprovalTypedData,type SettlementPolicyInput} from '../src/settlement/policy.ts';
import {recordApprovedSettlementIntent,getSettlementIntent,executeSettlementDryRun,
  quarantineInterruptedSimulation,SettlementIntentError} from '../src/settlement/dry-run.ts';

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
  for(const name of ['001_order_nonces','002_orders','003_order_cancel_receipts','004_order_book','005_settlement_outbox','006_settlement_intents']){
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
before(async()=>{db=await initialized();});
after(async()=>{if(db)await db.close();});

test('committed fill + trusted approval stores one immutable PREPARED intent',async()=>{
  const source=await fill('DRY1-USDC');const {record,p,signed}=await make(source);
  assert.equal(record.tradeId,source.tradeId);assert.equal(record.status,'PREPARED');
  assert.equal(record.instruction.amount,'1000000');
  assert.match(record.instructionHash,/^0x[0-9a-f]{64}$/);
  const repeat=await recordApprovedSettlementIntent(tx(db),DOMAIN,source.fillId,p,signed,now);
  assert.deepEqual(repeat,record);
  assert.deepEqual(await getSettlementIntent(db,DOMAIN,source.fillId),record);
  assert.equal(await getSettlementIntent(db,WRONG,source.fillId),null);
  const rows=await db.query('SELECT COUNT(*)::INTEGER AS n FROM settlement_intents WHERE fill_id=$1',[source.fillId]);
  assert.equal((rows.rows[0] as {n:number}).n,1);
});

test('mock dry-run only encodes CollateralVault calldata with exact uint256',async()=>{
  const source=await fill('DRY2-USDC');await make(source);
  const result=await executeSettlementDryRun(tx(db),DOMAIN,source.fillId);
  assert.equal(result.status,'SIMULATED');assert.equal(result.tradeId,source.tradeId);
  assert.equal(result.simulatedCallHash,keccak256(result.calldata));
  const decoded=decodeFunctionData({abi:[{name:'settle',type:'function',stateMutability:'nonpayable',inputs:[
    {name:'token',type:'address'},{name:'from',type:'address'},{name:'to',type:'address'},
    {name:'amount',type:'uint256'},{name:'tradeId',type:'bytes32'}],outputs:[]}],data:result.calldata});
  assert.equal(decoded.functionName,'settle');
  assert.equal(decoded.args[0].toLowerCase(),'0x3333333333333333333333333333333333333333');
  assert.equal(decoded.args[1].toLowerCase(),buyer.address.toLowerCase());
  assert.equal(decoded.args[2].toLowerCase(),seller.address.toLowerCase());
  assert.equal(decoded.args[3],1000000n);
  assert.equal(decoded.args[4],source.tradeId);
  assert.equal((await getSettlementIntent(db,DOMAIN,source.fillId))?.status,'SIMULATED');
  await assert.rejects(executeSettlementDryRun(tx(db),DOMAIN,source.fillId),SettlementIntentError);
});

test('parallel attempts or registrations of the same fill remain single-writer',async()=>{
  const source=await fill('DRY3-USDC');const {p,signed}=await make(source);
  const registrations=await Promise.all(Array.from({length:7},()=>recordApprovedSettlementIntent(tx(db),DOMAIN,source.fillId,p,signed,now)));
  assert.ok(registrations.every(x=>x.instructionHash===registrations[0].instructionHash));
  const results=await Promise.allSettled(Array.from({length:6},()=>executeSettlementDryRun(tx(db),DOMAIN,source.fillId)));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(results.filter(x=>x.status==='rejected').length,5);
  assert.equal((await getSettlementIntent(db,DOMAIN,source.fillId))?.status,'SIMULATED');
});

test('altered signed amount/policy or unknown signer never creates an intent',async()=>{
  const source=await fill('DRY4-USDC');await ready(source);
  const p=policy(source),good=await approval(source,p);
  await assert.rejects(recordApprovedSettlementIntent(tx(db),DOMAIN,source.fillId,p,
    {...good,amountBaseUnits:'1000001'},now));
  await assert.rejects(recordApprovedSettlementIntent(tx(db),DOMAIN,source.fillId,p,
    await approval(source,p,'1000000',attacker),now));
  await assert.rejects(recordApprovedSettlementIntent(tx(db),DOMAIN,source.fillId,
    policy(source,{status:'DRAFT'}),good,now));
  await assert.rejects(recordApprovedSettlementIntent(tx(db),DOMAIN,source.fillId,p,
    {...good,signature:'0x11'},now));
  assert.equal(await getSettlementIntent(db,DOMAIN,source.fillId),null);
});

test('attempt to change token/amount/policy after intent registration is rejected, not overwritten',async()=>{
  const source=await fill('DRY5-USDC');const {p,signed,record}=await make(source);
  const modifiedPolicy=policy(source,{token:'0x4444444444444444444444444444444444444444'});
  const modifiedApproval=await approval(source,modifiedPolicy);
  await assert.rejects(recordApprovedSettlementIntent(tx(db),DOMAIN,source.fillId,modifiedPolicy,modifiedApproval,now),SettlementIntentError);
  await assert.rejects(recordApprovedSettlementIntent(tx(db),DOMAIN,source.fillId,p,await approval(source,p,'2'),now),SettlementIntentError);
  assert.deepEqual(await getSettlementIntent(db,DOMAIN,source.fillId),record);
  assert.deepEqual(await recordApprovedSettlementIntent(tx(db),DOMAIN,source.fillId,p,signed,now),record);
});

test('wrong domain or unprepared Outbox cannot create a settlement intent',async()=>{
  const source=await fill('DRY6-USDC'),p=policy(source),signed=await approval(source,p);
  await assert.rejects(recordApprovedSettlementIntent(tx(db),DOMAIN,source.fillId,p,signed,now));
  await assert.rejects(recordApprovedSettlementIntent(tx(db),WRONG,source.fillId,p,signed,now));
  assert.equal(await getSettlementIntent(db,DOMAIN,source.fillId),null);
});

test('SQL failure on insert rolls back without phantom stored intent; retry safe',async()=>{
  const source=await fill('DRY7-USDC');await ready(source);
  const p=policy(source),signed=await approval(source,p);
  await db.exec(`ALTER TABLE settlement_intents ADD CONSTRAINT fail_intent_test CHECK(fill_id <> ${source.fillId})`);
  try{
    await assert.rejects(recordApprovedSettlementIntent(tx(db),DOMAIN,source.fillId,p,signed,now),/fail_intent_test/);
    assert.equal(await getSettlementIntent(db,DOMAIN,source.fillId),null);
  }finally{await db.exec('ALTER TABLE settlement_intents DROP CONSTRAINT fail_intent_test');}
  assert.equal((await recordApprovedSettlementIntent(tx(db),DOMAIN,source.fillId,p,signed,now)).status,'PREPARED');
});

test('failed final simulation commit remains SIMULATING and quarantined UNKNOWN, never retried',async()=>{
  const source=await fill('DRY8-USDC');await make(source);
  await db.exec(`ALTER TABLE settlement_intents ADD CONSTRAINT fail_finish_test CHECK (fill_id <> ${source.fillId} OR status <> 'SIMULATED')`);
  try{
    await assert.rejects(executeSettlementDryRun(tx(db),DOMAIN,source.fillId),/fail_finish_test/);
    assert.equal((await getSettlementIntent(db,DOMAIN,source.fillId))?.status,'SIMULATING');
    await assert.rejects(executeSettlementDryRun(tx(db),DOMAIN,source.fillId),SettlementIntentError);
    assert.equal(await quarantineInterruptedSimulation(tx(db),DOMAIN,source.fillId,3600),false);
    await db.query("UPDATE settlement_intents SET simulation_started_at=NOW()-INTERVAL '2 hours' WHERE fill_id=$1",[source.fillId]);
    assert.equal(await quarantineInterruptedSimulation(tx(db),DOMAIN,source.fillId,60),true);
    assert.equal((await getSettlementIntent(db,DOMAIN,source.fillId))?.status,'UNKNOWN');
    await assert.rejects(executeSettlementDryRun(tx(db),DOMAIN,source.fillId),SettlementIntentError);
  }finally{await db.exec('ALTER TABLE settlement_intents DROP CONSTRAINT fail_finish_test');}
});

test('restart preserves simulation result and prevents repeat dry-run', {timeout:30000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'perpdex-dryrun-'));
  let disk:PGlite|undefined;
  try{
    disk=await initialized(dir);
    const source=await fill('DRY9-USDC',disk);
    const {p,signed}=await make(source,disk);
    const result=await executeSettlementDryRun(tx(disk),DOMAIN,source.fillId);
    await disk.close();disk=undefined;
    disk=await initialized(dir);
    const persisted=await getSettlementIntent(disk,DOMAIN,source.fillId);
    assert.equal(persisted?.resultHash,result.simulatedCallHash);
    assert.equal(persisted?.status,'SIMULATED');
    assert.equal((await recordApprovedSettlementIntent(tx(disk),DOMAIN,source.fillId,p,signed,now)).status,'SIMULATED');
    await assert.rejects(executeSettlementDryRun(tx(disk),DOMAIN,source.fillId),SettlementIntentError);
  }finally{if(disk)await disk.close();await rm(dir,{recursive:true,force:true});}
});

test('stored payload modification is detected before reading or reusing',async()=>{
  const source=await fill('DRY10-USDC');await make(source);
  await db.query("UPDATE settlement_intents SET instruction_json=jsonb_set(instruction_json,'{amount}', '\"9999\"'::jsonb) WHERE fill_id=$1",[source.fillId]);
  await assert.rejects(getSettlementIntent(db,DOMAIN,source.fillId),SettlementIntentError);
  await assert.rejects(executeSettlementDryRun(tx(db),DOMAIN,source.fillId),SettlementIntentError);
});

test('recovery rejects missing IDs, bad age, and non-interrupted states',async()=>{
  await assert.rejects(getSettlementIntent(db,DOMAIN,'01'),SettlementIntentError);
  await assert.rejects(quarantineInterruptedSimulation(tx(db),DOMAIN,'1',0),SettlementIntentError);
  await assert.rejects(quarantineInterruptedSimulation(tx(db),DOMAIN,'1',86401),SettlementIntentError);
  assert.equal(await quarantineInterruptedSimulation(tx(db),DOMAIN,'9223372036854775807'),false);
});
