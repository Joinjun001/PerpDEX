import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { buildOrderTypedData } from '../src/orders/signature.ts';
import { acceptAndMatchSignedOrder } from '../src/matching/accept-and-match.ts';
import { listSettlementSourceFills } from '../src/settlement/fill-source.ts';
import { claimSettlementPreparation, enqueueSettlementFill, enqueueSettlementPage,
  finishSettlementPreparation, getSettlementOutboxEntry, retrySettlementPreparation,
  SettlementOutboxError } from '../src/settlement/outbox.ts';
import type { OrderTransactionManager } from '../src/orders/order-transactions.ts';

const MAIN = {chainId:11155111,verifyingContract:'0x1111111111111111111111111111111111111111'};
const FOREIGN = {chainId:1,verifyingContract:MAIN.verifyingContract};
const maker = privateKeyToAccount(generatePrivateKey());
const taker = privateKeyToAccount(generatePrivateKey());
let count = 100100;
let db:PGlite;
function manager(instance:PGlite):OrderTransactionManager {
  return {withTransaction:fn=>instance.transaction(async tx=>fn({async query(sql,params=[]){
    const result = await tx.query(sql,[...params]);
    return {rows:result.rows,rowCount:result.affectedRows??null};
  }}))};
}
async function database(dir?:string):Promise<PGlite> {
  const instance = new PGlite(dir);await instance.waitReady;
  for(const file of ['001_order_nonces','002_orders','003_order_cancel_receipts','004_order_book','005_settlement_outbox']) {
    await instance.exec(await readFile(fileURLToPath(new URL('../sql/'+file+'.sql',import.meta.url)),'utf8'));
  }
  return instance;
}
async function signed(wallet:typeof maker,market:string,side:'BUY'|'SELL',price:string,quantity:string,domain=MAIN) {
  const order={account:wallet.address,market,side,price,quantity,nonce:String(count++),expiresAt:Math.floor(Date.now()/1000)+3600};
  const signature=await wallet.signTypedData(buildOrderTypedData(order,domain));
  return acceptAndMatchSignedOrder(order,signature,domain,manager(db));
}
async function createFill(market:string,domain=MAIN) {
  await signed(maker,market,'SELL','100','10',domain);
  const created=await signed(taker,market,'BUY','101','7',domain);
  assert.equal(created.matching.totalFilled,'7');
  const rows=await listSettlementSourceFills(db,domain);
  return rows.find(fill=>fill.takerOrderId===created.orderId)!;
}
before(async()=>{db=await database();});
after(async()=>{if(db)await db.close();});

test('signed ledger fill is registered once and cannot bypass policy gate',async()=>{
  const source=await createFill('OBA-USDC');
  const first=await enqueueSettlementFill(manager(db),MAIN,source.fillId);
  const second=await enqueueSettlementFill(manager(db),MAIN,source.fillId);
  assert.deepEqual(first,second);
  assert.equal(first.tradeId,source.tradeId);
  assert.equal(first.status,'PENDING_POLICY');
  assert.equal(first.attemptCount,0);
  const count=await db.query('SELECT COUNT(*)::INTEGER AS n FROM settlement_outbox WHERE fill_id=$1',[source.fillId]);
  assert.equal((count.rows[0] as {n:number}).n,1);
  const raw=await db.query('SELECT * FROM settlement_outbox WHERE fill_id=$1',[source.fillId]);
  assert.equal((raw.rows[0] as {lease_token:null}).lease_token,null);
  assert.equal('token' in first,false);
});

test('parallel registration is idempotent; scoped reads prevent cross-domain claims',async()=>{
  const original=await createFill('OBB-USDC');
  const entries=await Promise.all(Array.from({length:8},()=>enqueueSettlementFill(manager(db),MAIN,original.fillId)));
  assert.ok(entries.every(x=>x.tradeId===entries[0].tradeId));
  assert.equal(await getSettlementOutboxEntry(db,FOREIGN,original.fillId),null);
  await assert.rejects(enqueueSettlementFill(manager(db),FOREIGN,original.fillId),SettlementOutboxError);
  assert.ok((await getSettlementOutboxEntry(db,MAIN,original.fillId)));
});

test('bounded page sync is repeatable, does not auto-authorize, and rejects absent fill without orphan',async()=>{
  const a=await createFill('OBC-USDC');
  const b=await createFill('OBD-USDC');
  const list=await listSettlementSourceFills(db,MAIN);
  const synced=await enqueueSettlementPage(manager(db),MAIN,{afterFillId:'0',limit:100});
  assert.deepEqual(synced.map(x=>x.fillId),list.map(x=>x.fillId));
  assert.ok(synced.every(x=>x.status==='PENDING_POLICY'));
  assert.deepEqual(await enqueueSettlementPage(manager(db),MAIN,{afterFillId:'0',limit:100}),synced);
  const later=await enqueueSettlementPage(manager(db),MAIN,{afterFillId:a.fillId,limit:1});
  assert.deepEqual(later.map(x=>x.fillId),[b.fillId]);
  const absent='9223372036854775807';
  await assert.rejects(enqueueSettlementFill(manager(db),MAIN,absent),SettlementOutboxError);
  assert.equal(await getSettlementOutboxEntry(db,MAIN,absent),null);
});

test('parallel workers cannot claim the same fill; completion stays WAITING_POLICY and cannot be replayed',async()=>{
  const fill=await createFill('OBCLAIM-USDC');
  await enqueueSettlementFill(manager(db),MAIN,fill.fillId);
  // Earlier unclaimed fills are allowed, but none can be claimed twice.
  const results=await Promise.all(Array.from({length:6},()=>claimSettlementPreparation(manager(db),MAIN,60)));
  const claimed=results.filter(x=>x!==null);
  assert.equal(new Set(claimed.map(x=>x!.fillId)).size,claimed.length);
  const expected=claimed.find(x=>x!.fillId===fill.fillId)!;
  assert.ok(expected);
  assert.equal(expected.status,'PREPARING');
  assert.equal(expected.attemptCount,1);
  assert.ok(expected.leaseToken);
  assert.equal(await finishSettlementPreparation(manager(db),MAIN,fill.fillId,expected.leaseToken!),true);
  assert.equal(await finishSettlementPreparation(manager(db),MAIN,fill.fillId,expected.leaseToken!),false);
  assert.equal((await getSettlementOutboxEntry(db,MAIN,fill.fillId))?.status,'WAITING_POLICY');
  assert.equal(await retrySettlementPreparation(manager(db),MAIN,fill.fillId,expected.leaseToken!,1,'too late'),false);
  for (const entry of claimed) {
    if (entry!.fillId !== fill.fillId) assert.equal(await finishSettlementPreparation(manager(db),MAIN,entry!.fillId,entry!.leaseToken!),true);
  }
});

test('failed local preparation waits until retryAfter, keeps attempt history and is never chain-confirmed',async()=>{
  const fill=await createFill('OBRETRY-USDC');
  await enqueueSettlementFill(manager(db),MAIN,fill.fillId);
  const claim=await claimSettlementPreparation(manager(db),MAIN,60);
  assert.equal(claim?.fillId,fill.fillId);
  assert.equal(await retrySettlementPreparation(manager(db),MAIN,fill.fillId,claim!.leaseToken!,30,'validation failure'),true);
  assert.equal((await getSettlementOutboxEntry(db,MAIN,fill.fillId))?.status,'RETRYABLE');
  assert.equal((await getSettlementOutboxEntry(db,MAIN,fill.fillId))?.lastError,'validation failure');
  assert.equal(await claimSettlementPreparation(manager(db),MAIN,60),null);
  await db.query("UPDATE settlement_outbox SET retry_after=NOW()-INTERVAL '1 second' WHERE fill_id=$1",[fill.fillId]);
  const next=await claimSettlementPreparation(manager(db),MAIN,60);
  assert.equal(next?.fillId,fill.fillId);
  assert.equal(next?.attemptCount,2);
  assert.notEqual(next?.leaseToken,claim?.leaseToken);
  assert.equal(await finishSettlementPreparation(manager(db),MAIN,fill.fillId,claim!.leaseToken!),false);
  assert.equal(await finishSettlementPreparation(manager(db),MAIN,fill.fillId,next!.leaseToken!),true);
});

test('expired leases permit reassignment but stale workers cannot finalize new claims',async()=>{
  const fill=await createFill('OBLEASE-USDC');
  await enqueueSettlementFill(manager(db),MAIN,fill.fillId);
  const original=await claimSettlementPreparation(manager(db),MAIN,60);
  assert.equal(original?.fillId,fill.fillId);
  await db.query("UPDATE settlement_outbox SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE fill_id=$1",[fill.fillId]);
  assert.equal(await finishSettlementPreparation(manager(db),MAIN,fill.fillId,original!.leaseToken!),false);
  const restarted=await claimSettlementPreparation(manager(db),MAIN,60);
  assert.equal(restarted?.fillId,fill.fillId);
  assert.equal(restarted?.attemptCount,2);
  assert.equal(await retrySettlementPreparation(manager(db),MAIN,fill.fillId,original!.leaseToken!,1,'stale'),false);
  assert.equal(await finishSettlementPreparation(manager(db),MAIN,fill.fillId,restarted!.leaseToken!),true);
});

test('database error during enqueue rolls back entire new page, allowing safe replay',async()=>{
  const first=await createFill('OBFAIL1-USDC');
  const second=await createFill('OBFAIL2-USDC');
  const start=(BigInt(first.fillId)-1n).toString();
  await db.exec(`ALTER TABLE settlement_outbox ADD CONSTRAINT reject_second_fill CHECK(fill_id <> ${second.fillId})`);
  try {
    await assert.rejects(enqueueSettlementPage(manager(db),MAIN,{afterFillId:start,limit:2}),/reject_second_fill/);
    assert.equal(await getSettlementOutboxEntry(db,MAIN,first.fillId),null);
    assert.equal(await getSettlementOutboxEntry(db,MAIN,second.fillId),null);
  }finally{await db.exec('ALTER TABLE settlement_outbox DROP CONSTRAINT reject_second_fill');}
  const committed=await enqueueSettlementPage(manager(db),MAIN,{afterFillId:start,limit:2});
  assert.deepEqual(committed.map(x=>x.fillId),[first.fillId,second.fillId]);
});

test('durable outbox status and idempotency survive PGlite shutdown and restart', {timeout:30000},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'perpdex-m2t5-outbox-'));
  let instance:PGlite|undefined;
  try {
    instance=await database(directory);
    // Create a fill in the disk-backed database without changing the in-memory shared DB.
    const originalDb=db;
    db=instance;
    try {
      const fill=await createFill('OBRESTART-USDC');
      await enqueueSettlementFill(manager(db),MAIN,fill.fillId);
      const lease=await claimSettlementPreparation(manager(db),MAIN,60);
      assert.equal(lease?.fillId,fill.fillId);
      await db.query("UPDATE settlement_outbox SET lease_expires_at=NOW()-INTERVAL '1 second' WHERE fill_id=$1",[fill.fillId]);
      await instance.close();instance=undefined;
      instance=await database(directory);
      db=instance;
      const previous=await getSettlementOutboxEntry(db,MAIN,fill.fillId);
      assert.equal(previous?.status,'PREPARING');
      const newer=await claimSettlementPreparation(manager(db),MAIN,60);
      assert.equal(newer?.attemptCount,2);
      assert.equal(await finishSettlementPreparation(manager(db),MAIN,fill.fillId,lease!.leaseToken!),false);
      assert.equal(await finishSettlementPreparation(manager(db),MAIN,fill.fillId,newer!.leaseToken!),true);
      assert.equal((await enqueueSettlementFill(manager(db),MAIN,fill.fillId)).status,'WAITING_POLICY');
    }finally{db=originalDb;}
  }finally{if(instance)await instance.close();await rm(directory,{recursive:true,force:true});}
});

test('invalid arguments never mint claims or a valid lease acknowledgement',async()=>{
  await assert.rejects(enqueueSettlementFill(manager(db),MAIN,'01'),SettlementOutboxError);
  await assert.rejects(claimSettlementPreparation(manager(db),MAIN,0),SettlementOutboxError);
  await assert.rejects(claimSettlementPreparation(manager(db),MAIN,3601),SettlementOutboxError);
  await assert.rejects(enqueueSettlementPage(manager(db),MAIN,{limit:101}),/limit/);
  await assert.rejects(retrySettlementPreparation(manager(db),MAIN,'1','not-a-uuid',1,'fail'),SettlementOutboxError);
  await assert.rejects(retrySettlementPreparation(manager(db),MAIN,'1',crypto.randomUUID(),0,'fail'),SettlementOutboxError);
});
