/** Opt-in REAL PostgreSQL 15+ isolated signed-margin concurrency QA.
 * Requires a separately provided, already running PRIVATE Unix-socket PG.
 * Does not install DB, contact TCP, drop schemas or use production credentials.
 */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Pool} from 'pg';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {postgresTransactionManager} from '../src/orders/order-transactions.ts';
import {getIsolatedMarginBalances} from '../src/perp/margin-ledger.ts';
import {hashPerpMarketConfig,admitSimPerpOrder,cancelSimPerpOrder,
  buildSimPerpOrderTypedData,buildSimPerpCancelTypedData,
  type SimPerpOrderInput} from '../src/perp/sim-order.ts';
import {preparePersistedSignedSimPerpPair,type SignedSimPairCandidate} from '../src/perp/signed-sim-pair-gate.ts';
import {executePreparedSignedSimPair} from '../src/perp/signed-sim-pair-execution.ts';
import {validateLocalSignedPgQaEnvironment} from './postgres-signed-margin-guard.ts';
import {inspectSignedReadOnlyRole,assessSignedReadOnlyRole}
  from './postgres-signed-role-permissions.ts';
import {inspectSignedTriggerCatalog,attestSignedTriggerCatalog}
  from './postgres-signed-trigger-attestation.ts';
import type {PerpPositionContext} from '../src/perp/position-engine.ts';

const cfg=validateLocalSignedPgQaEnvironment(process.env);
const pool=new Pool({host:cfg.socket,port:5432,user:'nobody',database:'perpdex_autopilot_test',
  max:10,connectionTimeoutMillis:4000,statement_timeout:15000,
  options:'-c search_path='+cfg.schema});
const tx=postgresTransactionManager(pool);
const domain={chainId:11155111,verifyingContract:'0x1111111111111111111111111111111111111111'};
const collateralToken='0x3333333333333333333333333333333333333333';
const NOW=Math.floor(Date.now()/1000);
const users=Array.from({length:4},()=>privateKeyToAccount(generatePrivateKey()));
const [alice,bob,charlie,delta]=users;
const market='BTC-USD-PERP',source='private-pg-qa';
let nextNonce=1000;
function context():PerpPositionContext{
 const config={chainId:domain.chainId,verifyingContract:domain.verifyingContract,
   market,baseAsset:'BTC',quoteAsset:'USD',collateralToken,
   sourceId:source,oracleSourceId:'pg-private-oracle',revision:1,
   status:'APPROVED' as const,validFrom:NOW-30,validUntil:NOW+1800,
   baseDecimals:8,priceDecimals:2,collateralDecimals:6,tickSize:'5',lotSize:'100',
   minQuantity:'100',maxQuantity:'10000000000',maxOpenInterest:'20000000000',
   initialMarginBps:1000,maintenanceMarginBps:500,maxLeverage:10,
   maxPriceDeviationBps:300,maxConfidenceBps:100,maxOracleAgeSeconds:30};
 return {domain,config,trustedSourceId:source,nowSeconds:NOW,
   snapshot:{chainId:domain.chainId,verifyingContract:domain.verifyingContract,
     market,configRevision:1,sourceId:config.oracleSourceId,
     indexPrice:'6500000',markPrice:'6500000',publishedAt:NOW-1,
     sourceSequence:'101',confidenceBps:10}};
}
function order(user:typeof alice,side:'BUY'|'SELL'='BUY',nonce?:string):SimPerpOrderInput{
 return {account:user.address,market,side,nonce:nonce??String(nextNonce++),
   quantity:'100000000',price:'6500000',expiresAt:NOW+1200,
   executionMode:'SIMULATION_ONLY',collateralToken,
   reduceOnly:false,marginMode:'ISOLATED',configRevision:1,
   marketConfigHash:hashPerpMarketConfig(context().config)};
}
async function sign(input:SimPerpOrderInput,user:typeof alice){
 return user.signTypedData(buildSimPerpOrderTypedData(input,domain,NOW));
}
async function admit(input:SimPerpOrderInput,user:typeof alice){
 return admitSimPerpOrder(input,await sign(input,user),domain,tx,
   context().config,source,context().snapshot,NOW);
}
async function cancel(input:SimPerpOrderInput,orderId:string,user:typeof alice){
 const c={account:user.address,nonce:input.nonce,orderId,
   deadline:NOW+1000,executionMode:'SIMULATION_ONLY' as const};
 return cancelSimPerpOrder(c,await user.signTypedData(
   buildSimPerpCancelTypedData(c,domain,NOW)),domain,tx,NOW);
}
async function verifyMargin(user:typeof alice){
 const account=user.address.toLowerCase();
 const statuses=await pool.query('SELECT status,initial_margin FROM perp_sim_orders WHERE account=$1',[account]);
 const open=statuses.rows.filter(r=>r.status==='OPEN')
   .reduce((a,r)=>a+BigInt(r.initial_margin),0n);
 const filled=statuses.rows.filter(r=>r.status==='FILLED')
   .reduce((a,r)=>a+BigInt(r.initial_margin),0n);
 const balances=await getIsolatedMarginBalances(pool,domain,{market,collateralToken,account});
 const journal=await pool.query("SELECT bucket,COALESCE(SUM(signed_delta::numeric),0)::text value FROM perp_margin_entries WHERE account=$1 GROUP BY bucket",[account]);
 const sums=new Map<string,string>(journal.rows.map(r=>[r.bucket,r.value]));
 assert.equal(balances.reserved,sums.get('RESERVED')??'0');
 assert.equal(balances.positionMargin,sums.get('POSITION')??'0');
 assert.ok(BigInt(balances.reserved)>=open);
 assert.ok(BigInt(balances.positionMargin)>=filled);
 return balances;
}
async function confirmPrivateDb(){
 const q=await pool.query("SELECT current_database() db,current_user usr,inet_server_addr() addr,current_setting('listen_addresses') listen");
 assert.deepEqual([q.rows[0].db,q.rows[0].usr,q.rows[0].addr,q.rows[0].listen],
   ['perpdex_autopilot_test','nobody',null,'']);
 const one=await pool.connect(),two=await pool.connect();
 try{
  const a=await one.query('SELECT pg_backend_pid() pid');
  const b=await two.query('SELECT pg_backend_pid() pid');
  assert.notEqual(a.rows[0].pid,b.rows[0].pid);
 }finally{one.release();two.release();}
}
before(async()=>{
 await confirmPrivateDb();
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  assert.equal((await db.query('SELECT to_regnamespace($1) ns',[cfg.schema])).rows[0].ns,null);
  await db.query('CREATE SCHEMA "'+cfg.schema+'"');
  for(const f of ['001_order_nonces','008_perp_margin_ledger','009_perp_sim_orders',
     '010_perp_position_ledger','011_perp_pair_clearing',
     '012_perp_reduce_reservations','013_perp_guarded_position_commit',
     '014_perp_reduce_ledger_integrity','015_perp_signed_opening_fence',
     '016_perp_signed_pair_preparations','017_perp_signed_pair_executions',
     '018_perp_signed_cancel_integrity','019_perp_signed_order_fill_progress',
     '020_perp_signed_account_margin_conservation']){
    await db.query(readFileSync(fileURLToPath(new URL('../sql/'+f+'.sql',import.meta.url)),'utf8'));
  }
  await db.query("INSERT INTO perp_market_open_interest(chain_id,verifying_contract,market,collateral_token,config_revision,mode,open_interest_atomic) VALUES($1,$2,$3,$4,1,'PAIRED','0')",
   [domain.chainId,domain.verifyingContract,market,collateralToken]);
  for(const user of users)for(const bucket of ['AVAILABLE','POSITION','RESERVED']){
   await db.query('INSERT INTO perp_margin_balances(chain_id,verifying_contract,market,collateral_token,account,bucket,balance) VALUES($1,$2,$3,$4,$5,$6,$7)',
     [domain.chainId,domain.verifyingContract,market,collateralToken,
      user.address.toLowerCase(),bucket,bucket==='AVAILABLE'?'100000000000':'0']);
  }
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}
 finally{db.release();}
});
after(async()=>{await pool.end()});

test('independent real PostgreSQL backend sessions on private socket',confirmPrivateDb);
test('all SQL 015-020 signed enforcement triggers are enabled and structurally intact',async()=>{
 const catalog=await inspectSignedTriggerCatalog(pool,cfg.schema);
 const attestation=attestSignedTriggerCatalog(catalog,cfg.schema);
 assert.equal(attestation.eligible,true,attestation.reasonCodes.join('; '));
 assert.equal(attestation.requiredTriggerCount,31);
});

test('owner of QA migration tables must NOT be mistaken for least-privilege reviewer',async()=>{
 const snap=await inspectSignedReadOnlyRole(pool,cfg.schema);
 const assessment=assessSignedReadOnlyRole(snap);
 assert.equal(assessment.eligible,false);
 assert.ok(assessment.reasonCodes.includes('owns_schema'));
 // This negative attestation is not a successful restricted-role test.
});

test('unique concurrent nonces and identical-nonce rejection keep M3 conserved',async()=>{
 const inputs=[order(alice,'BUY','1001'),order(alice,'BUY','1002'),order(alice,'BUY','1003')];
 const outcomes=await Promise.allSettled(inputs.map(x=>admit(x,alice)));
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,3);
 const replay=await Promise.allSettled(Array.from({length:5},()=>admit(inputs[0],alice)));
 assert.equal(replay.filter(x=>x.status==='fulfilled').length,0);
 const got=await verifyMargin(alice);
 const im=(await pool.query("SELECT SUM(initial_margin::numeric)::text sum FROM perp_sim_orders WHERE account=$1 AND status='OPEN'",[alice.address.toLowerCase()])).rows[0].sum;
 assert.equal(got.reserved,im);
});
test('concurrent cancellation and distinct admission preserve COMMIT ledger',async()=>{
 const input=order(delta),accepted=await admit(input,delta),other=order(delta);
 const results=await Promise.allSettled([cancel(input,accepted.orderId,delta),admit(other,delta)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,2);
 await verifyMargin(delta);
 const q=await pool.query('SELECT status FROM perp_sim_orders WHERE account=$1 AND nonce=$2',
 [delta.address.toLowerCase(),input.nonce]);
 assert.equal(q.rows[0].status,'CANCELED');
});
test('full opening execution versus signed cancellation commits one valid outcome',async()=>{
 const buyer=order(bob,'BUY'),seller=order(charlie,'SELL');
 const bs=await sign(buyer,bob),ss=await sign(seller,charlie);
 const b=await admitSimPerpOrder(buyer,bs,domain,tx,context().config,source,context().snapshot,NOW);
 await admitSimPerpOrder(seller,ss,domain,tx,context().config,source,context().snapshot,NOW);
 const p:SignedSimPairCandidate={
  executionMode:'SIMULATION_ONLY',fillId:'0x'+'9'.repeat(64),
  priceAtomic:'6500000',quantityAtomic:buyer.quantity,
  buyer:{input:buyer,signature:bs,expectedPositionVersion:0},
  seller:{input:seller,signature:ss,expectedPositionVersion:0}};
 await preparePersistedSignedSimPerpPair(p,context(),tx);
 const results=await Promise.allSettled([executePreparedSignedSimPair(p,context(),tx),
   cancel(buyer,b.orderId,bob)]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 const final=await pool.query('SELECT count(*)::int n FROM perp_signed_pair_executions');
 const statuses=await pool.query('SELECT account,status FROM perp_sim_orders WHERE account=ANY($1)',
 [[bob.address.toLowerCase(),charlie.address.toLowerCase()]]);
 if(final.rows[0].n===1)assert.ok(statuses.rows.every(x=>x.status==='FILLED'));
 else{
  assert.equal(statuses.rows.find(x=>x.account===bob.address.toLowerCase())?.status,'CANCELED');
  assert.equal(statuses.rows.find(x=>x.account===charlie.address.toLowerCase())?.status,'OPEN');
 }
 await verifyMargin(bob);await verifyMargin(charlie);
});
test('unpaired SQL journal and direct margin tampering fail database COMMIT',async()=>{
 const user=alice.address.toLowerCase();
 await assert.rejects(pool.query(
  "UPDATE perp_margin_balances SET balance=(balance::numeric+1)::text WHERE account=$1 AND bucket='RESERVED'",
  [user]),/balance differs|reservation exceeds|conservation/i);
 await assert.rejects(pool.query(
  "INSERT INTO perp_margin_operations(chain_id,verifying_contract,market,collateral_token,operation_id,account,action,from_bucket,to_bucket,amount) VALUES($1,$2,$3,$4,'orphan-pg-qa',$5,'RESERVE','AVAILABLE','RESERVED','1')",
  [domain.chainId,domain.verifyingContract,market,collateralToken,user]),
  /double-entry|posting/i);
 await verifyMargin(alice);
});
