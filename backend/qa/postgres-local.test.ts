import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {Pool} from 'pg';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {buildOrderTypedData} from '../src/orders/signature.ts';
import {postgresTransactionManager} from '../src/orders/order-transactions.ts';
import {acceptAndMatchSignedOrder} from '../src/matching/accept-and-match.ts';
import {listSettlementSourceFills} from '../src/settlement/fill-source.ts';
import {enqueueSettlementPage,claimSettlementPreparation,
  finishSettlementPreparation,getSettlementOutboxEntry} from '../src/settlement/outbox.ts';

// An opt-in integration test against an ephemeral UNIX-SOCKET-ONLY PostgreSQL.
// No passwords, network DB URLs, production databases, migrations or deployments.
const socket=process.env.PERPDEX_TEST_PG_SOCKET;
if(!socket || !/^\/tmp\/perpdex-pg-[a-z0-9-]+\/socket$/.test(socket) ||
   !statSync(join(socket,'.s.PGSQL.5432')).isSocket()){
  throw new Error('PERPDEX_TEST_PG_SOCKET must name an existing private /tmp/perpdex-pg-*/socket directory');
}
const schema='perpdex_qa_'+randomBytes(5).toString('hex');
const DOMAIN={chainId:11155111,verifyingContract:'0x1111111111111111111111111111111111111111'};
const pool=new Pool({host:socket,port:5432,user:'nobody',database:'perpdex_autopilot_test',
  max:12,connectionTimeoutMillis:3000,statement_timeout:10000,
  options:`-c search_path=${schema}`});
const transactions=postgresTransactionManager(pool);
const maker=privateKeyToAccount(generatePrivateKey());
const buyerA=privateKeyToAccount(generatePrivateKey());
const buyerB=privateKeyToAccount(generatePrivateKey());
const buyerC=privateKeyToAccount(generatePrivateKey());
let nonce=600001;
function order(owner:typeof maker,side:'BUY'|'SELL',market:string,quantity:string,price:string){
  return {account:owner.address,nonce:String(nonce++),market,side,price,quantity,
    expiresAt:Math.floor(Date.now()/1000)+3600};
}
async function place(owner:typeof maker,side:'BUY'|'SELL',market:string,quantity:string,price:string){
  const input=order(owner,side,market,quantity,price);
  const signature=await owner.signTypedData(buildOrderTypedData(input,DOMAIN));
  return acceptAndMatchSignedOrder(input,signature,DOMAIN,transactions);
}

before(async()=>{
  const client=await pool.connect();
  try{
    const server=await client.query("SELECT current_database() db, current_user usr, inet_server_addr() addr");
    assert.equal(server.rows[0].db,'perpdex_autopilot_test');
    assert.equal(server.rows[0].usr,'nobody');
    assert.equal(server.rows[0].addr,null);
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA "${schema}"`);
    for(const migration of ['001_order_nonces','002_orders','003_order_cancel_receipts',
      '004_order_book','005_settlement_outbox','006_settlement_intents','007_settlement_reconciliations']){
      const sql=readFileSync(fileURLToPath(new URL(`../sql/${migration}.sql`,import.meta.url)),'utf8');
      await client.query(sql);
    }
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
});
after(async()=>{await pool.end();});

test('real PostgreSQL 15 can apply all 001-007 schemas with strict FK and dedicated socket',async()=>{
  const tables=await pool.query("SELECT COUNT(*)::INTEGER AS n FROM information_schema.tables WHERE table_schema=$1 AND table_name IN ('order_nonces','orders','order_book_entries','order_fills','settlement_outbox','settlement_intents','settlement_reconciliations')",[schema]);
  assert.equal(tables.rows[0].n,7);
  const indexes=await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname=$1 AND tablename='settlement_intents' AND indexname='settlement_intents_scope_unique_idx'",[schema]);
  assert.equal(indexes.rowCount,1);
});

test('multiple pg pool connections serialize live signed order admission, matching, and nonce replay',async()=>{
  const market='REALPGMATCH-USDC';
  const makerOrder=await place(maker,'SELL',market,'10','80');
  assert.equal(makerOrder.matching.totalFilled,'0');
  const [buy1,buy2]=await Promise.all([
    place(buyerA,'BUY',market,'7','100'),place(buyerB,'BUY',market,'7','100'),
  ]);
  const sum=BigInt(buy1.matching.totalFilled)+BigInt(buy2.matching.totalFilled);
  assert.equal(sum,10n);
  const rows=await listSettlementSourceFills(pool,DOMAIN);
  assert.equal(rows.length,2);
  assert.equal(rows.reduce((n,row)=>n+BigInt(row.quantity),0n),10n);
  assert.ok(rows.every(row=>row.makerOrderId===makerOrder.orderId));
  const req=order(buyerC,'BUY','REALPGNONCE-USDC','3','110');
  const sig=await buyerC.signTypedData(buildOrderTypedData(req,DOMAIN));
  const tries=await Promise.allSettled(Array.from({length:5},()=>acceptAndMatchSignedOrder(req,sig,DOMAIN,transactions)));
  assert.equal(tries.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(tries.filter(x=>x.status==='rejected').length,4);
  const count=await pool.query('SELECT COUNT(*)::INTEGER n FROM order_nonces WHERE chain_id=$1 AND account=$2 AND nonce=$3',
    [DOMAIN.chainId,buyerC.address.toLowerCase(),req.nonce]);
  assert.equal(count.rows[0].n,1);
});

test('real PostgreSQL SKIP LOCKED prevents duplicate claims across independent connections',async()=>{
  const fills=await listSettlementSourceFills(pool,DOMAIN);
  assert.equal(fills.length,2);
  const results=await Promise.all(Array.from({length:5},()=>enqueueSettlementPage(transactions,DOMAIN)));
  assert.ok(results.every(x=>x.length===2));
  const count=await pool.query('SELECT COUNT(*)::INTEGER n FROM settlement_outbox');
  assert.equal(count.rows[0].n,2);
  const lock=await pool.connect();
  await lock.query('BEGIN');
  try {
    const locked=await lock.query('SELECT fill_id FROM settlement_outbox ORDER BY fill_id ASC LIMIT 1 FOR UPDATE');
    const first=String(locked.rows[0].fill_id);
    const other=fills.find(x=>x.fillId!==first)!;
    const claimed=await claimSettlementPreparation(transactions,DOMAIN,60);
    assert.equal(claimed?.fillId,other.fillId);
    assert.equal(claimed?.attemptCount,1);
    assert.equal(await finishSettlementPreparation(transactions,DOMAIN,claimed!.fillId,claimed!.leaseToken!),true);
  }finally{await lock.query('ROLLBACK');lock.release();}
  const remaining=await claimSettlementPreparation(transactions,DOMAIN,60);
  assert.equal(remaining?.fillId,fills[0].fillId);
  assert.equal(await finishSettlementPreparation(transactions,DOMAIN,remaining!.fillId,remaining!.leaseToken!),true);
  assert.equal(await claimSettlementPreparation(transactions,DOMAIN,60),null);
  for(const fill of fills){
    assert.equal((await getSettlementOutboxEntry(pool,DOMAIN,fill.fillId))?.status,'WAITING_POLICY');
  }
});

test('real PostgreSQL transaction rollback prevents partial nonce/order admission, retry then succeeds',async()=>{
  const market='REALPGROLL-USDC';
  const makerOrder=await place(maker,'SELL',market,'5','25');
  assert.equal(makerOrder.matching.totalFilled,'0');
  const incoming=order(buyerA,'BUY',market,'5','30');
  const signature=await buyerA.signTypedData(buildOrderTypedData(incoming,DOMAIN));
  await pool.query("ALTER TABLE order_fills ADD CONSTRAINT realpg_fail CHECK (market <> 'REALPGROLL-USDC')");
  try{
    await assert.rejects(acceptAndMatchSignedOrder(incoming,signature,DOMAIN,transactions));
    const nonceCheck=await pool.query('SELECT COUNT(*)::INTEGER n FROM order_nonces WHERE account=$1 AND nonce=$2',
      [buyerA.address.toLowerCase(),incoming.nonce]);
    assert.equal(nonceCheck.rows[0].n,0);
    const orderCheck=await pool.query('SELECT COUNT(*)::INTEGER n FROM orders WHERE account=$1 AND nonce=$2',
      [buyerA.address.toLowerCase(),incoming.nonce]);
    assert.equal(orderCheck.rows[0].n,0);
    const book=await pool.query("SELECT COUNT(*)::INTEGER n FROM order_book_entries WHERE market='REALPGROLL-USDC'");
    assert.equal(book.rows[0].n,1);
  }finally{await pool.query('ALTER TABLE order_fills DROP CONSTRAINT realpg_fail');}
  const accepted=await acceptAndMatchSignedOrder(incoming,signature,DOMAIN,transactions);
  assert.equal(accepted.matching.totalFilled,'5');
  assert.equal((await listSettlementSourceFills(pool,DOMAIN)).filter(x=>x.market===market).length,1);
});
