import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import type {OrderTransactionManager} from '../src/orders/order-transactions.ts';
import {buildOrderTypedData} from '../src/orders/signature.ts';
import {acceptAndMatchSignedOrder} from '../src/matching/accept-and-match.ts';
import {listSettlementSourceFills,type SettlementSourceFill} from '../src/settlement/fill-source.ts';
import {enqueueSettlementFill,claimSettlementPreparation,finishSettlementPreparation,
  getSettlementOutboxEntry,type SettlementOutboxEntry} from '../src/settlement/outbox.ts';
import {buildSettlementApprovalTypedData,prepareSettlementInstructionFromLedger,
  settlementPolicyHash,verifyAndBuildSettlementInstruction,SettlementPolicyError,
  type SettlementPolicyInput} from '../src/settlement/policy.ts';

const DOMAIN={chainId:11155111,verifyingContract:'0x1111111111111111111111111111111111111111'};
const VAULT='0x2222222222222222222222222222222222222222';
const ASSET='0x3333333333333333333333333333333333333333';
const buyer=privateKeyToAccount(generatePrivateKey());
const seller=privateKeyToAccount(generatePrivateKey());
const trustedApprover=privateKeyToAccount(generatePrivateKey());
const attacker=privateKeyToAccount(generatePrivateKey());
let db:PGlite;let nonce=150000;
const now=Math.floor(Date.now()/1000);
let realFill:SettlementSourceFill;
let originalOutbox:SettlementOutboxEntry;

function manager(database:PGlite):OrderTransactionManager {
  return {withTransaction:fn=>database.transaction(async tx=>fn({
    async query(sql,values=[]){const r=await tx.query(sql,[...values]);return {rows:r.rows,rowCount:r.affectedRows??null};},
  }))};
}
async function put(wallet:typeof buyer,market:string,side:'BUY'|'SELL',price:string,quantity:string) {
  const order={account:wallet.address,market,side,price,quantity,nonce:String(nonce++),expiresAt:now+3600};
  const sig=await wallet.signTypedData(buildOrderTypedData(order,DOMAIN,now));
  return acceptAndMatchSignedOrder(order,sig,DOMAIN,manager(db),now);
}
async function newFill(market:string) {
  await put(seller,market,'SELL','20','50');
  const matched=await put(buyer,market,'BUY','30','40');
  assert.equal(matched.matching.totalFilled,'40');
  return (await listSettlementSourceFills(db,DOMAIN)).find(x=>x.takerOrderId===matched.orderId)!;
}
async function completedLocalOutbox(fill:SettlementSourceFill) {
  await enqueueSettlementFill(manager(db),DOMAIN,fill.fillId);
  // Prior tests always finish their leases, so claim selects the only ready record.
  const claimed=await claimSettlementPreparation(manager(db),DOMAIN,60);
  assert.equal(claimed?.fillId,fill.fillId);
  assert.equal(await finishSettlementPreparation(manager(db),DOMAIN,fill.fillId,claimed!.leaseToken!),true);
  return (await getSettlementOutboxEntry(db,DOMAIN,fill.fillId))!;
}
function policy(fill=realFill,changes:Partial<SettlementPolicyInput>={}):SettlementPolicyInput {
  return {policyId:'operator-reviewed-market',revision:4,status:'APPROVED',
    chainId:DOMAIN.chainId,verifyingContract:DOMAIN.verifyingContract,market:fill.market,
    vault:VAULT,token:ASSET,tokenDecimals:6,transferDirection:'BUYER_TO_SELLER',
    settlementModel:'EXPLICIT_APPROVED_TRANSFER',marginModel:'EXTERNAL_RISK_ENGINE',
    feeModel:'EXTERNALLY_ACCOUNTED',feeBps:12,maxAmountBaseUnits:(1n<<240n).toString(),
    approver:trustedApprover.address,validFrom:now-60,validUntil:now+1800,...changes};
}
async function approval(fill=realFill,config=policy(fill),amountBaseUnits='5000000',deadline=now+600,signer=trustedApprover) {
  const data=buildSettlementApprovalTypedData(fill,config,amountBaseUnits,deadline,DOMAIN,now);
  return {amountBaseUnits,deadline,signature:await signer.signTypedData(data)};
}

before(async()=>{
  db=new PGlite();await db.waitReady;
  for(const filename of ['001_order_nonces','002_orders','003_order_cancel_receipts','004_order_book','005_settlement_outbox']) {
    await db.exec(await readFile(fileURLToPath(new URL(`../sql/${filename}.sql`,import.meta.url)),'utf8'));
  }
  realFill=await newFill('POLICY-USDC');
  originalOutbox=await completedLocalOutbox(realFill);
});
after(async()=>{if(db)await db.close();});

test('approved policy + exact signed fill returns data-only vault instruction, never executes it',async()=>{
  const config=policy();const signed=await approval();
  const instruction=await prepareSettlementInstructionFromLedger(manager(db),DOMAIN,realFill.fillId,config,signed,now);
  assert.deepEqual(instruction,{
    tradeId:realFill.tradeId,fillId:realFill.fillId,market:realFill.market,
    chainId:DOMAIN.chainId,vault:VAULT,token:ASSET,
    from:buyer.address.toLowerCase(),to:seller.address.toLowerCase(),
    amount:'5000000',tokenDecimals:6,policyHash:settlementPolicyHash(config,DOMAIN,now),
    approvalDeadline:now+600,
  });
  assert.deepEqual(await prepareSettlementInstructionFromLedger(manager(db),DOMAIN,realFill.fillId,config,signed,now),instruction);
  assert.equal((await getSettlementOutboxEntry(db,DOMAIN,realFill.fillId))?.status,'WAITING_POLICY');
  assert.ok(!('transactionHash' in instruction));
});

test('reversed explicit direction changes sender and recipient and requires fresh matching signature',async()=>{
  const prior=await approval();
  const reversed=policy(realFill,{transferDirection:'SELLER_TO_BUYER'});
  await assert.rejects(prepareSettlementInstructionFromLedger(manager(db),DOMAIN,realFill.fillId,reversed,prior,now),SettlementPolicyError);
  const valid=await approval(realFill,reversed);
  const r=await prepareSettlementInstructionFromLedger(manager(db),DOMAIN,realFill.fillId,reversed,valid,now);
  assert.equal(r.from,seller.address.toLowerCase());assert.equal(r.to,buyer.address.toLowerCase());
});

test('missing, draft, revoked, stale and domain/market mismatched policies fail closed',async()=>{
  const good=await approval();
  const variants: Array<unknown> = [undefined,{},policy(realFill,{status:'DRAFT'}),
    policy(realFill,{status:'REVOKED'}),policy(realFill,{chainId:1}),
    policy(realFill,{verifyingContract:'0x4444444444444444444444444444444444444444'}),
    policy(realFill,{market:'OTHER-USDC'}),policy(realFill,{validUntil:now-1}),
    policy(realFill,{validFrom:now+1}),policy(realFill,{revision:0}),
  ];
  for(const variant of variants) {
    await assert.rejects(prepareSettlementInstructionFromLedger(manager(db),DOMAIN,realFill.fillId,variant as SettlementPolicyInput,good,now),SettlementPolicyError);
  }
});

test('token, vault, decimals, fee, risk model and transfer caps are mandatory and exact',async()=>{
  const good=await approval();
  const variants: Partial<SettlementPolicyInput>[] = [
    {token:ZERO_ADDRESS},{token:'not an address'},{vault:ASSET},{vault:'not an address'},
    {tokenDecimals:-1},{tokenDecimals:37},{tokenDecimals:1.5},
    {feeBps:-1},{feeBps:10001},{marginModel:'UNKNOWN' as SettlementPolicyInput['marginModel']},
    {feeModel:'UNKNOWN' as SettlementPolicyInput['feeModel']},
    {settlementModel:'OTHER' as SettlementPolicyInput['settlementModel']},
    {maxAmountBaseUnits:'0'},{maxAmountBaseUnits:'01'},
    {maxAmountBaseUnits:(1n<<256n).toString()},
    {transferDirection:'UNKNOWN' as SettlementPolicyInput['transferDirection']},
    {approver:'0x0000000000000000000000000000000000000000'},
  ];
  for(const changes of variants) {
    await assert.rejects(prepareSettlementInstructionFromLedger(manager(db),DOMAIN,realFill.fillId,policy(realFill,changes),good,now),SettlementPolicyError);
  }
});
const ZERO_ADDRESS='0x0000000000000000000000000000000000000000';

test('unapproved and incomplete per-fill approvals cannot create a settlement intent',async()=>{
  const config=policy();
  const good=await approval();
  const incomplete=[undefined,{}, {...good,signature:''}, {...good,signature:'0xabc'},
    {...good,amountBaseUnits:'0'}, {...good,amountBaseUnits:'01'},
    {...good,amountBaseUnits:(1n<<256n).toString()},
    {...good,amountBaseUnits:(BigInt(config.maxAmountBaseUnits)+1n).toString()},
    {...good,deadline:now-1}, {...good,deadline:now+3600}];
  for(const candidate of incomplete) {
    await assert.rejects(prepareSettlementInstructionFromLedger(manager(db),DOMAIN,realFill.fillId,config,candidate as typeof good,now),SettlementPolicyError);
  }
});

test('unauthorized signer and tampering with transfer quantity or policy fields are rejected',async()=>{
  const config=policy();const good=await approval();
  const malicious=await approval(realFill,config,'5000000',now+600,attacker);
  await assert.rejects(prepareSettlementInstructionFromLedger(manager(db),DOMAIN,realFill.fillId,config,malicious,now),SettlementPolicyError);
  await assert.rejects(prepareSettlementInstructionFromLedger(manager(db),DOMAIN,realFill.fillId,config,{...good,amountBaseUnits:'5000001'},now),SettlementPolicyError);
  for(const tamper of [{feeBps:13},{token:'0x5555555555555555555555555555555555555555'},
    {tokenDecimals:18},{maxAmountBaseUnits:(1n<<230n).toString()},
    {revision:5},{approver:attacker.address},{policyId:'different-policy'}]) {
    await assert.rejects(prepareSettlementInstructionFromLedger(manager(db),DOMAIN,realFill.fillId,policy(realFill,tamper),good,now),SettlementPolicyError);
  }
});

test('BigInt amounts above Number.MAX_SAFE_INTEGER stay exact and are capped',async()=>{
  const amt=(1n<<210n).toString();
  const config=policy();const signed=await approval(realFill,config,amt);
  const actual=await verifyAndBuildSettlementInstruction(realFill,originalOutbox,config,signed,DOMAIN,now);
  assert.equal(actual.amount,amt);
  assert.equal(BigInt(actual.amount),1n<<210n);
});

test('missing, pending, preparing or retryable outbox rows do not authorize an instruction',async()=>{
  const valid=await approval();const config=policy();
  for(const state of [null,{...originalOutbox,status:'PENDING_POLICY' as const},
    {...originalOutbox,status:'PREPARING' as const}, {...originalOutbox,status:'RETRYABLE' as const},
    {...originalOutbox,tradeId:'0x'+'0'.repeat(64)},
    {...originalOutbox,fillId:'999'},{...originalOutbox,market:'NOTTHIS-USDC'}]) {
    await assert.rejects(verifyAndBuildSettlementInstruction(realFill,state,config,valid,DOMAIN,now),SettlementPolicyError);
  }
});

test('approved signature cannot be replayed for another fill or another market',async()=>{
  const nextFill=await newFill('POLICY-USDC');
  const nextOutbox=await completedLocalOutbox(nextFill);
  const config=policy();const valid=await approval();
  await assert.rejects(prepareSettlementInstructionFromLedger(manager(db),DOMAIN,nextFill.fillId,config,valid,now),SettlementPolicyError);
  const newValid=await approval(nextFill,config);
  const next=await verifyAndBuildSettlementInstruction(nextFill,nextOutbox,config,newValid,DOMAIN,now);
  assert.notEqual(next.tradeId,realFill.tradeId);
  const other=await newFill('OTHERPOLICY-USDC');
  const wrongPolicy=policy(realFill);
  await assert.rejects(verifyAndBuildSettlementInstruction(other,nextOutbox,wrongPolicy,valid,DOMAIN,now),SettlementPolicyError);
});

test('source ledger lookup and signing domain cannot be substituted or skipped',async()=>{
  const good=await approval();const config=policy();
  await assert.rejects(prepareSettlementInstructionFromLedger(manager(db),{...DOMAIN,chainId:1},realFill.fillId,config,good,now),SettlementPolicyError);
  await assert.rejects(prepareSettlementInstructionFromLedger(manager(db),DOMAIN,'0',config,good,now),SettlementPolicyError);
  await assert.rejects(prepareSettlementInstructionFromLedger(manager(db),DOMAIN,'999999',config,good,now),SettlementPolicyError);
  await assert.rejects(verifyAndBuildSettlementInstruction({...realFill,buyer:seller.address},originalOutbox,config,good,DOMAIN,now),SettlementPolicyError);
  await assert.rejects(verifyAndBuildSettlementInstruction({...realFill,tradeId:('0x'+'f'.repeat(64)) as `0x${string}`},originalOutbox,config,good,DOMAIN,now),SettlementPolicyError);
  await assert.rejects(verifyAndBuildSettlementInstruction(realFill,originalOutbox,config,good,DOMAIN,Number.NaN),SettlementPolicyError);
});
