/**
 * Opt-in real PostgreSQL 15 shadow-order concurrency and crash-recovery QA.
 * Only accepts private test-socket path, fixed test user/database and new QA schema.
 * Run with PERPDEX_TEST_PG_SCHEMA=perpdex_qa_... and phase=seed|verify.
 * No external network, production DB, real private keys or transfers.
 */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {Pool} from 'pg';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {hashTypedData,keccak256,toHex} from 'viem';
import {postgresTransactionManager} from '../src/orders/order-transactions.ts';
import {getIsolatedMarginBalances,transferIsolatedMargin} from '../src/perp/margin-ledger.ts';
import {
  admitSimPerpOrder,buildSimPerpOrderTypedData,buildSimPerpCancelTypedData,
  cancelSimPerpOrder,hashPerpMarketConfig,
  type SimCancelInput,type SimPerpOrderInput,
} from '../src/perp/sim-order.ts';
import type {PerpMarketConfig} from '../src/perp/market-config.ts';
import type {PerpPriceSnapshot} from '../src/perp/price-snapshot.ts';

const socket=process.env.PERPDEX_TEST_PG_SOCKET;
const schema=process.env.PERPDEX_TEST_PG_SCHEMA;
const phase=process.env.PERPDEX_TEST_PG_PHASE;
if (!socket || !/^\/tmp\/perpdex-pg-[a-z0-9-]+\/socket$/.test(socket) ||
    !statSync(join(socket,'.s.PGSQL.5432')).isSocket() ||
    !schema || !/^perpdex_qa_[a-f0-9]{12}$/.test(schema) ||
    (phase !== 'seed' && phase !== 'verify')) {
  throw new Error('Requires private test socket, a new perpdex_qa_<12-hex> schema, and seed|verify phase');
}
const DOMAIN={chainId:11155111,verifyingContract:'0x1111111111111111111111111111111111111111'};
const TOKEN='0x3333333333333333333333333333333333333333';
const SOURCE='pg-test-registry';
const MARKET='BTC-USD-PERP';
const QUANTITY='100000000';
const RESERVE=6510000000n;
const NOW=Math.floor(Date.now()/1000);
const alice=privateKeyToAccount(generatePrivateKey());
const bob=privateKeyToAccount(generatePrivateKey());
const charlie=privateKeyToAccount(generatePrivateKey());
const pool=new Pool({host:socket,port:5432,user:'nobody',database:'perpdex_autopilot_test',
  max:16,connectionTimeoutMillis:5000,statement_timeout:15000,
  options:`-c search_path=${schema}`});
const manager=postgresTransactionManager(pool);
let nonce=90000;
function policy():PerpMarketConfig {
  return {market:MARKET,baseAsset:'BTC',quoteAsset:'USD',collateralToken:TOKEN,
    chainId:DOMAIN.chainId,verifyingContract:DOMAIN.verifyingContract,
    sourceId:SOURCE,oracleSourceId:'local-pg-oracle',revision:5,status:'APPROVED',
    validFrom:NOW-30,validUntil:NOW+1500,baseDecimals:8,priceDecimals:2,collateralDecimals:6,
    tickSize:'5',lotSize:'100',minQuantity:'100',maxQuantity:'100000000000000',
    maxOpenInterest:'200000000000000',initialMarginBps:1000,maintenanceMarginBps:500,
    maxLeverage:10,maxPriceDeviationBps:300,maxConfidenceBps:100,maxOracleAgeSeconds:30};
}
function snapshot():PerpPriceSnapshot {
  return {chainId:DOMAIN.chainId,verifyingContract:DOMAIN.verifyingContract,
    market:MARKET,configRevision:5,sourceId:'local-pg-oracle',indexPrice:'6500000',
    markPrice:'6510000',publishedAt:NOW-1,sourceSequence:'100',confidenceBps:10};
}
function order(account=alice.address,changes:Partial<SimPerpOrderInput>={}):SimPerpOrderInput{
  return {account,market:MARKET,side:'BUY',price:'6510000',quantity:QUANTITY,
    nonce:String(nonce++),expiresAt:NOW+1200,executionMode:'SIMULATION_ONLY',
    collateralToken:TOKEN,marginMode:'ISOLATED',reduceOnly:false,configRevision:5,
    marketConfigHash:hashPerpMarketConfig(policy()),...changes};
}
async function signed(input:SimPerpOrderInput, signer=alice){
  return signer.signTypedData(buildSimPerpOrderTypedData(input,DOMAIN,NOW));
}
async function accept(input:SimPerpOrderInput, signature:string){
  return admitSimPerpOrder(input,signature,DOMAIN,manager,policy(),SOURCE,snapshot(),NOW);
}
function cancel(input:SimPerpOrderInput):SimCancelInput {
  return {account:input.account,nonce:input.nonce,
    orderId:hashTypedData(buildSimPerpOrderTypedData(input,DOMAIN,NOW)).toLowerCase(),
    deadline:NOW+1000,executionMode:'SIMULATION_ONLY'};
}
async function cancelSigned(input:SimCancelInput, signer=alice){
  return signer.signTypedData(buildSimPerpCancelTypedData(input,DOMAIN,NOW));
}
function scope(input:SimPerpOrderInput){
  return {account:input.account,market:MARKET,collateralToken:TOKEN};
}
async function balances(input:SimPerpOrderInput){return getIsolatedMarginBalances(pool,DOMAIN,scope(input));}
async function counts(input:SimPerpOrderInput){
  const q=await pool.query(`SELECT
    (SELECT COUNT(*)::int FROM order_nonces WHERE chain_id=$1 AND verifying_contract=$2
       AND account=$3 AND nonce=$4) AS nonce_count,
    (SELECT COUNT(*)::int FROM perp_sim_orders WHERE chain_id=$1 AND verifying_contract=$2
       AND account=$3 AND nonce=$4) AS order_count`,
    [DOMAIN.chainId,DOMAIN.verifyingContract,input.account.toLowerCase(),input.nonce]);
  return q.rows[0] as {nonce_count:number;order_count:number};
}
async function fundingFixture(account:string,value:string){
  // TEST ONLY: opening collateral cannot be created through product functionality.
  await pool.query(`INSERT INTO perp_margin_balances
     (chain_id,verifying_contract,market,collateral_token,account,bucket,balance)
      VALUES($1,$2,$3,$4,$5,'AVAILABLE',$6)`,
    [DOMAIN.chainId,DOMAIN.verifyingContract,MARKET,TOKEN,account.toLowerCase(),value]);
}
let persisted:{orderId:string; account:string;nonce:string;amount:string}|undefined;

before(async()=>{
  const probe=await pool.query("SELECT current_database() db, current_user usr, inet_server_addr() addr,current_setting('listen_addresses') listen");
  assert.equal(probe.rows[0].db,'perpdex_autopilot_test');
  assert.equal(probe.rows[0].usr,'nobody');
  assert.equal(probe.rows[0].addr,null);
  assert.equal(probe.rows[0].listen,'');
  if(phase==='seed'){
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query(`CREATE SCHEMA "${schema}"`);
      for (const name of ['001_order_nonces','008_perp_margin_ledger','009_perp_sim_orders']){
        await db.query(readFileSync(fileURLToPath(new URL(`../sql/${name}.sql`,import.meta.url)),'utf8'));
      }
      await db.query('COMMIT');
    }catch(e){await db.query('ROLLBACK');throw e;}
    finally{db.release();}
  }else{
    const exists=await pool.query('SELECT to_regclass($1) AS name',[`${schema}.perp_sim_orders`]);
    assert.ok(exists.rows[0].name,'recovery schema must exist');
  }
});
after(async()=>{await pool.end();});

if(phase==='seed'){
  test('PostgreSQL schema 001/008/009 migrates in one transaction, no TCP listener',async()=>{
    const got=await pool.query(`SELECT COUNT(*)::int n FROM information_schema.tables
       WHERE table_schema=$1 AND table_name IN ('order_nonces','perp_sim_orders',
       'perp_margin_balances','perp_margin_entries','perp_margin_operations')`,[schema]);
    assert.equal(got.rows[0].n,5);
    const perms=await pool.query(`SELECT COUNT(*)::int n FROM pg_indexes WHERE schemaname=$1 AND tablename='perp_sim_orders'`,[schema]);
    assert.ok(perms.rows[0].n>=2);
    await fundingFixture(alice.address,(RESERVE*8n).toString());
    await fundingFixture(bob.address,(RESERVE*3n).toString());
    await fundingFixture(charlie.address,(RESERVE*2n).toString());
  });

  test('10 real concurrent pool connections accept one signed nonce once with 2 journal legs',async()=>{
    const input=order(alice.address);
    const signature=await signed(input);
    const results=await Promise.allSettled(Array.from({length:10},()=>accept(input,signature)));
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(results.filter(x=>x.status==='rejected').length,9);
    assert.deepEqual(await counts(input),{nonce_count:1,order_count:1});
    const receipt=results.find(x=>x.status==='fulfilled');
    assert.ok(receipt&&receipt.status==='fulfilled');
    const q=await pool.query('SELECT signed_delta FROM perp_margin_entries WHERE operation_id=$1 ORDER BY leg',
      [receipt.value.orderId.slice(2)]);
    assert.deepEqual(q.rows.map(x=>x.signed_delta),[`-${RESERVE}`,RESERVE.toString()]);
    assert.equal((await balances(input)).reserved,RESERVE.toString());
  });

  test('independent competing orders cannot overreserve account margin, failed nonces remain reusable',async()=>{
    const list=Array.from({length:10},()=>order(bob.address));
    const sigs=await Promise.all(list.map(input=>signed(input,bob)));
    const outcomes=await Promise.allSettled(list.map((input,i)=>accept(input,sigs[i])));
    assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,3);
    assert.equal(outcomes.filter(x=>x.status==='rejected').length,7);
    const b=await balances(list[0]);
    assert.equal(b.available,'0');
    assert.equal(b.reserved,(RESERVE*3n).toString());
    assert.equal(b.total,(RESERVE*3n).toString());
    for(let i=0;i<list.length;i++){
      const status=outcomes[i].status;
      const record=await counts(list[i]);
      assert.equal(record.nonce_count,status==='fulfilled'?1:0);
      assert.equal(record.order_count,status==='fulfilled'?1:0);
    }
  });

  test('race: admission and signed cancel preserve state and allow explicit safe retry',async()=>{
    const input=order(charlie.address),signature=await signed(input,charlie);
    const req=cancel(input),cancelSignature=await cancelSigned(req,charlie);
    const [a,c]=await Promise.allSettled([
      accept(input,signature),
      cancelSimPerpOrder(req,cancelSignature,DOMAIN,manager,NOW),
    ]);
    assert.equal(a.status,'fulfilled');
    if(c.status==='rejected'){
      // A cancellation before the order commits is permitted to fail closed.
      await cancelSimPerpOrder(req,cancelSignature,DOMAIN,manager,NOW);
    }else{
      assert.equal(c.value.status,'CANCELED');
    }
    const row=await pool.query(`SELECT status FROM perp_sim_orders WHERE account=$1 AND nonce=$2`,
      [charlie.address.toLowerCase(),input.nonce]);
    assert.equal(row.rows[0].status,'CANCELED');
    const state=await balances(input);
    assert.deepEqual(state,{available:(RESERVE*2n).toString(),reserved:'0',positionMargin:'0',
      total:(RESERVE*2n).toString()});
    const all=await pool.query(`SELECT operation_id,COUNT(*)::int n,SUM(signed_delta::numeric) sum
       FROM perp_margin_entries WHERE account=$1 GROUP BY operation_id`,[charlie.address.toLowerCase()]);
    assert.equal(all.rows.length,2);
    assert.ok(all.rows.every(x=>x.n===2 && x.sum==='0'));
    await assert.rejects(cancelSimPerpOrder(req,cancelSignature,DOMAIN,manager,NOW));
  });

  test('concurrent duplicate signed cancellation returns a single release, no nonce resurrection',async()=>{
    const input=order(alice.address),sig=await signed(input);
    const accepted=await accept(input,sig),req=cancel(input);
    assert.equal(accepted.orderId,req.orderId);
    const cancelSig=await cancelSigned(req);
    const outcomes=await Promise.allSettled(Array.from({length:8},()=>
      cancelSimPerpOrder(req,cancelSig,DOMAIN,manager,NOW)));
    assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(outcomes.filter(x=>x.status==='rejected').length,7);
    const row=await pool.query('SELECT status FROM order_nonces WHERE account=$1 AND nonce=$2',
      [alice.address.toLowerCase(),input.nonce]);
    assert.equal(row.rows[0].status,'CANCELED');
    const releaseId=keccak256(toHex(`perp-sim-cancel:${accepted.orderId}`)).slice(2);
    const journal=await pool.query('SELECT COUNT(*)::int n,SUM(signed_delta::numeric) AS sum FROM perp_margin_entries WHERE operation_id=$1',[releaseId]);
    assert.equal(journal.rows[0].n,2);
    assert.equal(journal.rows[0].sum,'0');
    assert.deepEqual(await counts(input),{nonce_count:1,order_count:1});
  });

  test('constraint failure during reservation rolls back nonce, shadow order, and margin; then retry succeeds',async()=>{
    const input=order(alice.address),sig=await signed(input),typed=buildSimPerpOrderTypedData(input,DOMAIN,NOW);
    const id=hashTypedData(typed).slice(2);
    await pool.query(`ALTER TABLE perp_margin_entries ADD CONSTRAINT qa_fail_reserve
      CHECK (operation_id <> '${id}')`);
    try{
      await assert.rejects(accept(input,sig));
      assert.deepEqual(await counts(input),{nonce_count:0,order_count:0});
      assert.equal((await pool.query('SELECT COUNT(*)::int n FROM perp_margin_entries WHERE operation_id=$1',[id])).rows[0].n,0);
    }finally{await pool.query('ALTER TABLE perp_margin_entries DROP CONSTRAINT qa_fail_reserve');}
    const ok=await accept(input,sig);
    assert.equal(ok.orderId,`0x${id}`);
  });

  test('constraint failure during release rolls back signed cancellation, nonce, and ledger state',async()=>{
    const input=order(alice.address),sig=await signed(input),accepted=await accept(input,sig);
    const req=cancel(input),cancelSig=await cancelSigned(req);
    const prior=await balances(input);
    const release=keccak256(toHex(`perp-sim-cancel:${accepted.orderId}`)).slice(2);
    await pool.query(`ALTER TABLE perp_margin_entries ADD CONSTRAINT qa_fail_release
      CHECK (operation_id <> '${release}')`);
    try{
      await assert.rejects(cancelSimPerpOrder(req,cancelSig,DOMAIN,manager,NOW));
      assert.deepEqual(await balances(input),prior);
      const stored=await pool.query('SELECT status FROM perp_sim_orders WHERE nonce=$1',[input.nonce]);
      const nonceRecord=await pool.query('SELECT status FROM order_nonces WHERE nonce=$1',[input.nonce]);
      assert.equal(stored.rows[0].status,'OPEN');
      assert.equal(nonceRecord.rows[0].status,'USED');
      assert.equal((await pool.query('SELECT COUNT(*)::int n FROM perp_margin_entries WHERE operation_id=$1',[release])).rows[0].n,0);
    }finally{await pool.query('ALTER TABLE perp_margin_entries DROP CONSTRAINT qa_fail_release');}
    assert.equal((await cancelSimPerpOrder(req,cancelSig,DOMAIN,manager,NOW)).status,'CANCELED');
  });

  test('persist an OPEN signed shadow order for cross-postgres-process restart recovery verification',async()=>{
    const input=order(alice.address),sig=await signed(input);
    const accepted=await accept(input,sig);
    persisted={orderId:accepted.orderId,account:alice.address,nonce:input.nonce,amount:accepted.initialMargin};
    const record=await pool.query('SELECT status,initial_margin,market_config_hash FROM perp_sim_orders WHERE order_id=$1',[accepted.orderId]);
    assert.equal(record.rows[0].status,'OPEN');
    assert.equal(record.rows[0].initial_margin,persisted.amount);
    assert.equal(record.rows[0].market_config_hash,input.marketConfigHash);
    // Reopen mode reads the most recent OPEN simulation, its nonce and ledger entries.
  });
} else {
  test('PostgreSQL restart retains open order, nonce tombstones, margin conservation and correct replay',async()=>{
    const orderRow=await pool.query(`SELECT account,nonce,order_id,market,collateral_token,initial_margin
      FROM perp_sim_orders WHERE status='OPEN' ORDER BY created_at DESC,nonce DESC LIMIT 1`);
    assert.equal(orderRow.rowCount,1);
    const item=orderRow.rows[0] as {account:string;nonce:string;order_id:string;market:string;collateral_token:string;initial_margin:string};
    const nonceRecord=await pool.query(`SELECT status,order_id FROM order_nonces WHERE chain_id=$1
      AND verifying_contract=$2 AND account=$3 AND nonce=$4`,
      [DOMAIN.chainId,DOMAIN.verifyingContract,item.account,item.nonce]);
    assert.equal(nonceRecord.rows[0].status,'USED');
    assert.equal(nonceRecord.rows[0].order_id,item.order_id);
    const amount=BigInt(item.initial_margin);
    const b=await getIsolatedMarginBalances(pool,DOMAIN,
      {market:item.market,collateralToken:item.collateral_token,account:item.account});
    assert.ok(BigInt(b.reserved)>=amount);
    const firstPosting=await pool.query(`SELECT leg,bucket,signed_delta FROM perp_margin_entries
      WHERE operation_id=$1 ORDER BY leg`,[item.order_id.slice(2)]);
    assert.deepEqual(firstPosting.rows.map(x=>x.signed_delta),[`-${amount}`,amount.toString()]);
    const journal=await transferIsolatedMargin(manager,DOMAIN,{
      market:item.market,collateralToken:item.collateral_token,account:item.account,
      action:'RESERVE',amount:amount.toString(),operationId:item.order_id.slice(2)});
    assert.equal(journal.replayed,true);
    assert.deepEqual(await getIsolatedMarginBalances(pool,DOMAIN,
      {market:item.market,collateralToken:item.collateral_token,account:item.account}),b);
    const canceled=await pool.query(`SELECT COUNT(*)::int n FROM perp_sim_orders WHERE status='CANCELED'`);
    assert.ok(canceled.rows[0].n>=2);
    const check=await pool.query(`SELECT operation_id,COUNT(*)::int n,SUM(signed_delta::numeric) net
      FROM perp_margin_entries GROUP BY operation_id HAVING COUNT(*) <> 2 OR SUM(signed_delta::numeric) <> 0`);
    assert.equal(check.rows.length,0);
  });
}
