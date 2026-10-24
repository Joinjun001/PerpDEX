import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer, type Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PGlite} from '@electric-sql/pglite';
import {generatePrivateKey, privateKeyToAccount} from 'viem/accounts';
import type {OrderTransactionManager} from '../src/orders/order-transactions.ts';
import {buildOrderTypedData} from '../src/orders/signature.ts';
import {createOrderHttpHandler} from '../src/http/create-order-http.ts';
import {listSettlementSourceFills, type SettlementSourceFill} from '../src/settlement/fill-source.ts';
import {enqueueSettlementPage,enqueueSettlementFill,claimSettlementPreparation,
  finishSettlementPreparation,getSettlementOutboxEntry} from '../src/settlement/outbox.ts';
import {buildSettlementApprovalTypedData,type SettlementPolicyInput} from '../src/settlement/policy.ts';
import {recordApprovedSettlementIntent,getSettlementIntent,executeSettlementDryRun} from '../src/settlement/dry-run.ts';
import {InMemoryMockReceiptProvider,reconcileMockSettlement,
  getSettlementReconciliation,type MockReceipt} from '../src/settlement/reconcile.ts';

const DOMAIN={chainId:11155111, verifyingContract:'0x1111111111111111111111111111111111111111'};
const OTHER={chainId:1,verifyingContract:DOMAIN.verifyingContract};
const VAULT='0x2222222222222222222222222222222222222222';
const TOKEN='0x3333333333333333333333333333333333333333';
const sellerOne=privateKeyToAccount(generatePrivateKey());
const sellerTwo=privateKeyToAccount(generatePrivateKey());
const buyer=privateKeyToAccount(generatePrivateKey());
const approver=privateKeyToAccount(generatePrivateKey());
const now=Math.floor(Date.now()/1000);
let nextNonce=870000;
const MIGRATIONS=['001_order_nonces','002_orders','003_order_cancel_receipts','004_order_book',
  '005_settlement_outbox','006_settlement_intents','007_settlement_reconciliations'];
function transactions(db:PGlite):OrderTransactionManager{
  return {withTransaction:fn=>db.transaction(async client=>fn({async query(sql,values=[]){
    const r=await client.query(sql,[...values]);return {rows:r.rows,rowCount:r.affectedRows??null};
  }}))};
}
async function applyMigrations(db:PGlite){
  for(const filename of MIGRATIONS){
    await db.exec(await readFile(fileURLToPath(new URL(`../sql/${filename}.sql`,import.meta.url)),'utf8'));
  }
}
async function localDb(path?:string){const db=new PGlite(path);await db.waitReady;await applyMigrations(db);return db;}
async function serve(db:PGlite){
  const server=createServer(createOrderHttpHandler({trustedDomain:DOMAIN,transactions:transactions(db),readDatabase:db}));
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {server,origin:`http://127.0.0.1:${(server.address() as AddressInfo).port}`};
}
async function close(server:Server){await new Promise<void>(resolve=>server.close(()=>resolve()));}
function order(account=buyer,changes:Record<string,unknown>={}){
  return {account:account.address,nonce:String(nextNonce++),market:'E2E-USDC',side:'BUY',
    price:'100',quantity:'8',expiresAt:now+3600,...changes};
}
async function post(origin:string,owner:typeof buyer,input:ReturnType<typeof order>){
  const signature=await owner.signTypedData(buildOrderTypedData(input,DOMAIN,now));
  const r=await fetch(origin+'/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({order:input,signature})});
  return {status:r.status,body:await r.json() as Record<string,any>};
}
function policy(fill:SettlementSourceFill):SettlementPolicyInput{
  return {policyId:'test-fixture-only',revision:1,status:'APPROVED',chainId:DOMAIN.chainId,
    verifyingContract:DOMAIN.verifyingContract,market:fill.market,vault:VAULT,token:TOKEN,
    tokenDecimals:6,transferDirection:'BUYER_TO_SELLER',settlementModel:'EXPLICIT_APPROVED_TRANSFER',
    marginModel:'EXTERNAL_RISK_ENGINE',feeModel:'EXTERNALLY_ACCOUNTED',feeBps:0,
    maxAmountBaseUnits:(1n<<242n).toString(),approver:approver.address,validFrom:now-1,
    validUntil:now+1800};
}
async function signedApproval(fill:SettlementSourceFill,amount:string){
  const p=policy(fill),deadline=now+1000;
  const signature=await approver.signTypedData(buildSettlementApprovalTypedData(fill,p,amount,deadline,DOMAIN,now));
  return {policy:p,approval:{amountBaseUnits:amount,deadline,signature}};
}
function receipt(fill:SettlementSourceFill,amount:string,confirmationCount:number,blockHash:string):MockReceipt{
  return {chainId:DOMAIN.chainId,vault:VAULT,tradeId:fill.tradeId,
    transactionHash:('0x'+fill.fillId.padStart(64,'a')),
    blockHash,blockNumber:'1234',confirmations:confirmationCount,outcome:'SUCCESS',settledTrades:true,
    event:{tradeId:fill.tradeId,token:TOKEN,from:buyer.address.toLowerCase(),
      to:fill.seller,amount}};
}

// Full public API to two distinct settlement records, no RPC/keys/deploys.
test('signed HTTP FIFO orders -> two real fills -> policy-gated outbox -> unique dry-run -> mock reconciliation -> restart',
  {timeout:40000},async()=>{
    const path=await mkdtemp(join(tmpdir(),'perpdex-e2e-'));
    let db:PGlite|undefined,server:Server|undefined;
    try{
      db=await localDb(path);
      const web=await serve(db);server=web.server;
      const enormous=(1n<<120n);
      const maker1=order(sellerOne,{market:'E2EFIFO-USDC',side:'SELL',price:'90',quantity:enormous.toString()});
      const maker2=order(sellerTwo,{market:'E2EFIFO-USDC',side:'SELL',price:'90',quantity:enormous.toString()});
      const sell1=await post(web.origin,sellerOne,maker1);
      const sell2=await post(web.origin,sellerTwo,maker2);
      assert.equal(sell1.status,201);assert.equal(sell2.status,201);
      const incoming=order(buyer,{market:'E2EFIFO-USDC',side:'BUY',price:'100',quantity:(enormous+7n).toString()});
      const buy=await post(web.origin,buyer,incoming);
      assert.equal(buy.status,201);
      assert.equal(buy.body.status,'FILLED');
      assert.equal(buy.body.filledQuantity,(enormous+7n).toString());
      assert.deepEqual(buy.body.fills.map((r:{makerOrderId:string;quantity:string})=>[r.makerOrderId,r.quantity]),
        [[sell1.body.orderId,enormous.toString()],[sell2.body.orderId,'7']]);
      const replay=await post(web.origin,buyer,incoming);
      assert.equal(replay.status,200);assert.equal(replay.body.replayed,true);
      const fills=await listSettlementSourceFills(db,DOMAIN);
      assert.deepEqual(fills.map(f=>f.quantity),[enormous.toString(),'7']);
      assert.equal(fills.reduce((total,f)=>total+BigInt(f.quantity),0n),enormous+7n);
      assert.equal((await listSettlementSourceFills(db,OTHER)).length,0);

      const manager=transactions(db);
      const out=await enqueueSettlementPage(manager,DOMAIN);
      assert.deepEqual(out.map(x=>x.tradeId),fills.map(x=>x.tradeId));
      assert.deepEqual((await enqueueSettlementPage(manager,DOMAIN)).map(x=>x.tradeId),out.map(x=>x.tradeId));
      for(const fill of fills){
        const claim=await claimSettlementPreparation(manager,DOMAIN,60);
        assert.equal(claim?.fillId,fill.fillId);
        assert.equal(await finishSettlementPreparation(manager,DOMAIN,fill.fillId,claim!.leaseToken!),true);
      }
      const amounts=[(1n<<200n).toString(),(1n<<199n).toString()];
      const approvals=[];
      const provider=new InMemoryMockReceiptProvider();
      for(let i=0;i<fills.length;i++){
        const f=fills[i];const args=await signedApproval(f,amounts[i]);approvals.push(args);
        const result=await recordApprovedSettlementIntent(manager,DOMAIN,f.fillId,args.policy,args.approval,now);
        assert.equal(result.instruction.amount,amounts[i]);
        assert.equal((await getSettlementOutboxEntry(db,DOMAIN,f.fillId))?.status,'WAITING_POLICY');
        const dry=await executeSettlementDryRun(manager,DOMAIN,f.fillId);
        assert.equal(dry.status,'SIMULATED');
        assert.equal((await getSettlementIntent(db,DOMAIN,f.fillId))?.status,'SIMULATED');
        assert.equal((await getSettlementReconciliation(db,DOMAIN,f.fillId)),null);
      }
      assert.equal((await reconcileMockSettlement(manager,DOMAIN,fills[0].fillId,provider)).status,'UNCONFIRMED');
      provider.set(fills[0].tradeId,{kind:'RECEIPT',receipt:receipt(fills[0],amounts[0],1,'0x'+'b'.repeat(64))});
      assert.equal((await reconcileMockSettlement(manager,DOMAIN,fills[0].fillId,provider)).status,'RECHECK_REQUIRED');
      provider.set(fills[0].tradeId,{kind:'RECEIPT',receipt:receipt(fills[0],amounts[0],10,'0x'+'b'.repeat(64))});
      assert.equal((await reconcileMockSettlement(manager,DOMAIN,fills[0].fillId,provider)).status,'MOCK_VERIFIED');
      provider.set(fills[1].tradeId,{kind:'RECEIPT',receipt:receipt(fills[1],amounts[1],1,'0x'+'c'.repeat(64))});
      assert.equal((await reconcileMockSettlement(manager,DOMAIN,fills[1].fillId,provider)).status,'RECHECK_REQUIRED');
      provider.set(fills[1].tradeId,{kind:'RECEIPT',receipt:receipt(fills[1],amounts[1],2,'0x'+'d'.repeat(64))});
      assert.equal((await reconcileMockSettlement(manager,DOMAIN,fills[1].fillId,provider)).status,'UNKNOWN');

      await close(server);server=undefined;await db.close();db=undefined;
      db=await localDb(path); // all migrations reapplied idempotently on a populated DB
      for(let i=0;i<fills.length;i++){
        const f=fills[i];
        const persisted=await getSettlementIntent(db,DOMAIN,f.fillId);
        assert.equal(persisted?.instruction.amount,amounts[i]);
        assert.equal(persisted?.status,'SIMULATED');
        const status=await getSettlementReconciliation(db,DOMAIN,f.fillId);
        assert.equal(status?.status,i===0?'MOCK_VERIFIED':'UNKNOWN');
        assert.equal(status?.source,'MOCK_READONLY');
        const again=await recordApprovedSettlementIntent(transactions(db),DOMAIN,f.fillId,
          approvals[i].policy,approvals[i].approval,now);
        assert.equal(again.instructionHash,persisted?.instructionHash);
        await assert.rejects(executeSettlementDryRun(transactions(db),DOMAIN,f.fillId));
      }
      assert.equal(((await db.query('SELECT COUNT(*)::INTEGER AS n FROM order_fills')).rows[0] as {n:number}|undefined)?.n,2);
      assert.equal(((await db.query('SELECT COUNT(*)::INTEGER AS n FROM settlement_intents')).rows[0] as {n:number}|undefined)?.n,2);
      assert.equal(((await db.query('SELECT COUNT(*)::INTEGER AS n FROM settlement_reconciliations')).rows[0] as {n:number}|undefined)?.n,2);
    }finally{if(server)await close(server);if(db)await db.close();await rm(path,{recursive:true,force:true});}
  });

test('policy failure after public HTTP match does not create intent, nonce or another trade',
  {timeout:20000},async()=>{
    const db=await localDb();let server:Server|undefined;
    try{
      const web=await serve(db);server=web.server;
      const sellerOrder=order(sellerOne,{market:'E2EFAIL-USDC',side:'SELL',quantity:'6',price:'40'});
      const buyerOrder=order(buyer,{market:'E2EFAIL-USDC',side:'BUY',quantity:'6',price:'50'});
      assert.equal((await post(web.origin,sellerOne,sellerOrder)).status,201);
      const buy=await post(web.origin,buyer,buyerOrder);
      assert.equal(buy.status,201);assert.equal(buy.body.filledQuantity,'6');
      const f=(await listSettlementSourceFills(db,DOMAIN))[0];
      const manager=transactions(db);
      const work=await enqueueSettlementFill(manager,DOMAIN,f.fillId);
      assert.equal(work.status,'PENDING_POLICY');
      const p=await signedApproval(f,'90000');
      await assert.rejects(recordApprovedSettlementIntent(manager,DOMAIN,f.fillId,p.policy,p.approval,now));
      assert.equal(await getSettlementIntent(db,DOMAIN,f.fillId),null);
      const claim=await claimSettlementPreparation(manager,DOMAIN,60);
      assert.equal(await finishSettlementPreparation(manager,DOMAIN,f.fillId,claim!.leaseToken!),true);
      const wrong={...p.approval,amountBaseUnits:'90001'};
      await assert.rejects(recordApprovedSettlementIntent(manager,DOMAIN,f.fillId,p.policy,wrong,now));
      assert.equal(await getSettlementIntent(db,DOMAIN,f.fillId),null);
      assert.equal((await post(web.origin,buyer,buyerOrder)).status,200);
      assert.equal(((await db.query('SELECT COUNT(*)::INTEGER AS n FROM order_fills')).rows[0] as {n:number}|undefined)?.n,1);
      assert.equal((await getSettlementOutboxEntry(db,DOMAIN,f.fillId))?.status,'WAITING_POLICY');
    }finally{if(server)await close(server);await db.close();}
  });

test('001–007 local migrations are repeatable, and out-of-order application fails without partial target schema',
  {timeout:20000},async()=>{
    const db=new PGlite();await db.waitReady;
    try{
      const schema=await readFile(fileURLToPath(new URL('../sql/007_settlement_reconciliations.sql',import.meta.url)),'utf8');
      await assert.rejects(db.exec(schema));
      const table=await db.query("SELECT to_regclass('public.settlement_reconciliations') AS name");
      assert.equal((table.rows[0] as {name:string|null}|undefined)?.name,null);
      await applyMigrations(db);
      await applyMigrations(db);
      const result=await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('order_nonces','orders','order_book_entries','order_fills','settlement_outbox','settlement_intents','settlement_reconciliations') ORDER BY table_name");
      assert.equal(result.rows.length,7);
      const constraint=await db.query("SELECT indexname FROM pg_indexes WHERE tablename='settlement_intents' AND indexname='settlement_intents_scope_unique_idx'");
      assert.equal(constraint.rows.length,1);
    }finally{await db.close();}
  });
