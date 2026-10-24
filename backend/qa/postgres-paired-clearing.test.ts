/** Opt-in, Unix-socket-only REAL PostgreSQL 15 M4-T4 QA. No live assets or network. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {Pool} from 'pg';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {postgresTransactionManager} from '../src/orders/order-transactions.ts';
import {applySimPairedFill,verifySimMarketOpenInterest,type SimPairedFill} from '../src/perp/paired-clearing.ts';
import {applySimPerpFillToLedger} from '../src/perp/position-ledger.ts';
import type {PerpMarketConfig} from '../src/perp/market-config.ts';
import type {PerpPriceSnapshot} from '../src/perp/price-snapshot.ts';
import type {PerpPositionContext,PerpPositionFill} from '../src/perp/position-engine.ts';

const socket=process.env.PERPDEX_TEST_PG_SOCKET;
const schema=process.env.PERPDEX_TEST_PG_SCHEMA;
const phase=process.env.PERPDEX_TEST_PG_PHASE;
if(!socket||!/^\/tmp\/perpdex-pg-[a-z0-9-]+\/socket$/.test(socket)||
  !statSync(join(socket,'.s.PGSQL.5432')).isSocket()||
  !schema||!/^perp_qa_[a-f0-9]{12}$/.test(schema)||
  !['seed','verify'].includes(phase??'')){
  throw new Error('Private test socket, fresh perp_qa_<12-hex> schema and seed|verify phase required');
}
const DOMAIN={chainId:11155111,verifyingContract:'0x1111111111111111111111111111111111111111'};
const TOKEN='0x3333333333333333333333333333333333333333';
const NOW=Math.floor(Date.now()/1000);
const SOURCE='pg-local-sim-registry';
const accounts=Array.from({length:12},()=>privateKeyToAccount(generatePrivateKey()).address);
const [A,B,C,D,E,F,G,H,I,J,K,L]=accounts;
let counter=1;
const nextId=()=>`0x${(counter++).toString(16).padStart(64,'0')}`;
function ctx(market='BTC-USD-PERP'):PerpPositionContext{
  const config:PerpMarketConfig={market,baseAsset:market.split('-')[0],quoteAsset:'USD',collateralToken:TOKEN,
    chainId:DOMAIN.chainId,verifyingContract:DOMAIN.verifyingContract,sourceId:SOURCE,oracleSourceId:'pg-mock-oracle',
    revision:1,status:'APPROVED',validFrom:NOW-30,validUntil:NOW+3600,
    baseDecimals:8,priceDecimals:2,collateralDecimals:6,tickSize:'5',lotSize:'100',minQuantity:'100',
    maxQuantity:'100000000000000',maxOpenInterest:'100000000000000',initialMarginBps:1000,
    maintenanceMarginBps:500,maxLeverage:10,maxPriceDeviationBps:300,maxConfidenceBps:100,maxOracleAgeSeconds:30};
  const snapshot:PerpPriceSnapshot={chainId:config.chainId,verifyingContract:config.verifyingContract,
    market:config.market,configRevision:config.revision,sourceId:config.oracleSourceId,
    indexPrice:'6500000',markPrice:'6500000',publishedAt:NOW-1,sourceSequence:'100',confidenceBps:10};
  return {domain:DOMAIN,config,snapshot,trustedSourceId:SOURCE,nowSeconds:NOW};
}
function trade(buyer=A,seller=B,changes:Partial<SimPairedFill>={}):SimPairedFill{
  return {fillId:nextId(),buyerAccount:buyer,sellerAccount:seller,quantityAtomic:'100000000',
    priceAtomic:'6500000',buyerExpectedVersion:0,sellerExpectedVersion:0,
    executionMode:'SIMULATION_ONLY',...changes};
}
const pool=new Pool({host:socket,port:5432,user:'nobody',database:'perpdex_autopilot_test',max:16,
  connectionTimeoutMillis:6000,statement_timeout:18000,
  options:`-c search_path=${schema}`});
const manager=postgresTransactionManager(pool);
const paired=(t:SimPairedFill,c=ctx())=>applySimPairedFill(manager,t,c);
const oi=(c=ctx())=>verifySimMarketOpenInterest(pool,c);
async function n(table:'perp_position_snapshots'|'perp_position_applications'|'perp_sim_paired_fills'){
  const rows=await pool.query(`SELECT COUNT(*)::int AS n FROM ${table}`);return rows.rows[0].n as number;
}
const balance=(market:string)=>pool.query(`SELECT mode,open_interest_atomic,version FROM perp_market_open_interest WHERE market=$1`,[market]);
async function execAsSeparateTransaction(statement:string){await pool.query(statement);}

before(async()=>{
  const p=await pool.query(`SELECT current_database() database,current_user username,
    inet_server_addr() server_addr,current_setting('listen_addresses') listen_addresses`);
  assert.equal(p.rows[0].database,'perpdex_autopilot_test');
  assert.equal(p.rows[0].username,'nobody');
  assert.equal(p.rows[0].server_addr,null);
  assert.equal(p.rows[0].listen_addresses,'');
  if(phase==='seed'){
    const db=await pool.connect();
    try{
      await db.query('BEGIN');
      await db.query(`CREATE SCHEMA "${schema}"`);
      for(const migration of ['010_perp_position_ledger','011_perp_pair_clearing']){
        await db.query(readFileSync(fileURLToPath(new URL(`../sql/${migration}.sql`,import.meta.url)),'utf8'));
      }
      await db.query('COMMIT');
    }catch(error){await db.query('ROLLBACK');throw error;}
    finally{db.release();}
  }else{
    const q=await pool.query('SELECT to_regclass($1) AS obj',[`${schema}.perp_sim_paired_fills`]);
    assert.ok(q.rows[0].obj,'existing QA schema must survive PG restart');
  }
});
after(async()=>pool.end());

if(phase==='seed'){
  test('isolated 010/011 schema migration and private postgres socket only',async()=>{
    const q=await pool.query(`SELECT COUNT(*)::int AS n FROM information_schema.tables
      WHERE table_schema=$1 AND table_name IN ('perp_position_snapshots',
      'perp_position_applications','perp_market_open_interest','perp_sim_paired_fills')`,[schema]);
    assert.equal(q.rows[0].n,4);
    assert.equal((await oi()).openInterestAtomic,'0');
  });

  test('12 concurrent IDENTICAL fills on 16-connection pool commit exactly one pair',async()=>{
    const t=trade();
    const settled=await Promise.allSettled(Array.from({length:12},()=>paired(t)));
    assert.equal(settled.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(settled.filter(x=>x.status==='rejected').length,11);
    assert.equal(await n('perp_sim_paired_fills'),1);
    assert.equal(await n('perp_position_applications'),2);
    assert.equal((await oi()).openInterestAtomic,'100000000');
    const clientCount=await pool.query(`SELECT COUNT(DISTINCT pid)::int n
      FROM pg_stat_activity WHERE datname=current_database() AND usename=current_user`);
    assert.ok(clientCount.rows[0].n>=2);
  });

  test('12 competing different fills with same expected versions never double-apply',async()=>{
    const a=Array.from({length:12},()=>trade(A,B,{buyerExpectedVersion:1,sellerExpectedVersion:1}));
    const settled=await Promise.allSettled(a.map(t=>paired(t)));
    assert.equal(settled.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(settled.filter(x=>x.status==='rejected').length,11);
    assert.equal((await oi()).openInterestAtomic,'200000000');
    assert.equal(await n('perp_sim_paired_fills'),2);
  });

  test('independent account pairs with fresh versions both execute; OI aggregates across accounts',async()=>{
    const [a,b]=await Promise.all([paired(trade(C,D)),paired(trade(E,F))]);
    assert.equal(a.buyer.position.version,1);
    assert.equal(b.seller.position.version,1);
    assert.equal((await oi()).openInterestAtomic,'400000000');
    assert.equal(await n('perp_sim_paired_fills'),4);
    assert.equal(await n('perp_position_applications'),8);
  });

  test('stale counterparty version rejects entire pair without changing buyer/market OI',async()=>{
    const t=trade(A,B,{buyerExpectedVersion:2,sellerExpectedVersion:1});
    const before=await oi();
    await assert.rejects(paired(t));
    assert.deepEqual(await oi(),before);
    assert.equal(await n('perp_sim_paired_fills'),4);
  });

  test('seller-only SQL failure rolls back both applications, OI and immutable pair receipt',async()=>{
    const t=trade(G,H);
    await execAsSeparateTransaction(`ALTER TABLE perp_position_applications
      ADD CONSTRAINT reject_specific_seller CHECK (fill_id <> '${t.fillId}' OR account <> '${H.toLowerCase()}')`);
    try{
      await assert.rejects(paired(t));
      assert.equal((await oi()).openInterestAtomic,'400000000');
      assert.equal((await pool.query('SELECT COUNT(*)::int n FROM perp_position_applications WHERE fill_id=$1',[t.fillId])).rows[0].n,0);
      assert.equal((await pool.query('SELECT COUNT(*)::int n FROM perp_position_snapshots WHERE account IN ($1,$2)',[G.toLowerCase(),H.toLowerCase()])).rows[0].n,0);
      assert.equal(await n('perp_sim_paired_fills'),4);
    }finally{await execAsSeparateTransaction('ALTER TABLE perp_position_applications DROP CONSTRAINT reject_specific_seller');}
    assert.equal((await paired(t)).openInterest.openInterestAtomic,'500000000');
  });

  test('PAIRED vs UNPAIRED first-writer race has exactly one mode and no unbalanced tracked OI',async()=>{
    const c=ctx('ETH-USD-PERP'),t=trade(I,J);
    const f:PerpPositionFill={fillId:nextId(),account:K,side:'BUY',priceAtomic:t.priceAtomic,
      quantityAtomic:t.quantityAtomic,chainId:c.config.chainId,
      verifyingContract:c.config.verifyingContract,market:c.config.market,
      collateralToken:c.config.collateralToken,configRevision:c.config.revision,
      expectedVersion:0,executionMode:'SIMULATION_ONLY'};
    const results=await Promise.allSettled([paired(t,c),applySimPerpFillToLedger(manager,f,c)]);
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(results.filter(x=>x.status==='rejected').length,1);
    const mode=(await balance('ETH-USD-PERP')).rows[0].mode;
    assert.ok(mode==='PAIRED'||mode==='UNPAIRED');
    const rows=await pool.query(`SELECT account,size_signed_atomic FROM perp_position_snapshots WHERE market='ETH-USD-PERP'`);
    if(mode==='PAIRED'){
      assert.equal(rows.rows.length,2);
      assert.equal((await oi(c)).openInterestAtomic,'100000000');
    }else{
      assert.equal(rows.rows.length,1);
      await assert.rejects(oi(c));
    }
  });

  test('pair rollback on final receipt constraint, retry same fill succeeds',async()=>{
    const c=ctx('ADA-USD-PERP'),t=trade(K,L);
    await execAsSeparateTransaction(`ALTER TABLE perp_sim_paired_fills
      ADD CONSTRAINT reject_final_receipt CHECK (fill_id <> '${t.fillId}')`);
    try{
      await assert.rejects(paired(t,c));
      assert.equal((await pool.query(`SELECT COUNT(*)::int n FROM perp_position_snapshots WHERE market='ADA-USD-PERP'`)).rows[0].n,0);
      assert.equal((await pool.query(`SELECT COUNT(*)::int n FROM perp_sim_paired_fills WHERE fill_id=$1`,[t.fillId])).rows[0].n,0);
    }finally{await execAsSeparateTransaction('ALTER TABLE perp_sim_paired_fills DROP CONSTRAINT reject_final_receipt');}
    assert.equal((await paired(t,c)).openInterest.openInterestAtomic,'100000000');
  });

  test('persist replay fence and OI across restart: primary market contains paired-only journal',async()=>{
    const tracked=await oi();
    assert.equal(tracked.openInterestAtomic,'500000000');
    const q=await pool.query(`SELECT COUNT(*)::int n FROM perp_sim_paired_fills WHERE market=$1`,['BTC-USD-PERP']);
    assert.equal(q.rows[0].n,5);
  });
}else{
  test('postmaster restart preserves paired fills, account snapshots, LONG=SHORT OI and replay fence',async()=>{
    const c=ctx(),tracked=await oi(c);
    assert.equal(tracked.openInterestAtomic,'500000000');
    const pairs=await pool.query(`SELECT fill_id,buyer_account,seller_account,price_atomic,quantity_atomic
      FROM perp_sim_paired_fills WHERE market=$1 ORDER BY created_at,fill_id`,[c.config.market]);
    assert.equal(pairs.rows.length,5);
    for(const row of pairs.rows){
      const q=await pool.query(`SELECT account,side,price_atomic,quantity_atomic FROM perp_position_applications
        WHERE fill_id=$1 ORDER BY side`,[row.fill_id]);
      assert.equal(q.rows.length,2);
      assert.deepEqual(q.rows.map((r:Record<string,string>)=>r.side),['BUY','SELL']);
      assert.ok(q.rows.every((r:Record<string,string>)=>r.price_atomic===row.price_atomic&&r.quantity_atomic===row.quantity_atomic));
    }
    const t=pairs.rows[0];
    const v=await pool.query(`SELECT account,version FROM perp_position_snapshots
      WHERE account IN ($1,$2)`,[t.buyer_account,t.seller_account]);
    const versions=new Map(v.rows.map((row:{account:string;version:string})=>[row.account,Number(row.version)]));
    await assert.rejects(paired({fillId:t.fill_id,buyerAccount:t.buyer_account,sellerAccount:t.seller_account,
      priceAtomic:t.price_atomic,quantityAtomic:t.quantity_atomic,
      buyerExpectedVersion:versions.get(t.buyer_account)!,sellerExpectedVersion:versions.get(t.seller_account)!,
      executionMode:'SIMULATION_ONLY'}));
    assert.deepEqual(await oi(c),tracked);
  });

  test('new paired fill after restart updates persistent OI without loss or duplicated counterparties',async()=>{
    const c=ctx();
    // The verify phase runs in a NEW process and must recover account identities
    // from PostgreSQL, not freshly generated in-memory test signer fixtures.
    const persisted=await pool.query(`SELECT f.buyer_account,b.version AS buyer_version,
      f.seller_account,s.version AS seller_version FROM perp_sim_paired_fills f
      JOIN perp_position_snapshots b ON b.account=f.buyer_account AND b.market=f.market
      JOIN perp_position_snapshots s ON s.account=f.seller_account AND s.market=f.market
      WHERE f.market=$1 AND b.version=1 AND s.version=1 LIMIT 1`,[c.config.market]);
    assert.equal(persisted.rows.length,1);
    const item=persisted.rows[0] as {buyer_account:string;seller_account:string;buyer_version:number|string;seller_version:number|string};
    const result=await paired(trade(item.buyer_account,item.seller_account,{
      fillId:`0x${'f'.repeat(64)}`,
      buyerExpectedVersion:Number(item.buyer_version),sellerExpectedVersion:Number(item.seller_version),
    }));
    assert.equal(result.openInterest.openInterestAtomic,'600000000');
    assert.equal((await oi(c)).openInterestAtomic,'600000000');
    const q=await pool.query('SELECT COUNT(*)::int n FROM perp_sim_paired_fills WHERE market=$1',[c.config.market]);
    assert.equal(q.rows[0].n,6);
  });
}
