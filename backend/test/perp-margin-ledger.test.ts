import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PGlite} from '@electric-sql/pglite';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import type {OrderTransactionManager} from '../src/orders/order-transactions.ts';
import {getIsolatedMarginBalances,transferIsolatedMargin,MarginLedgerError,
  type MarginOperationInput} from '../src/perp/margin-ledger.ts';

const DOMAIN={chainId:11155111,verifyingContract:'0x1111111111111111111111111111111111111111'};
const OTHER={chainId:1,verifyingContract:DOMAIN.verifyingContract};
const TOKEN='0x3333333333333333333333333333333333333333';
const ALT_TOKEN='0x4444444444444444444444444444444444444444';
const ACCOUNT=privateKeyToAccount(generatePrivateKey()).address;
const ACCOUNT2=privateKeyToAccount(generatePrivateKey()).address;
let db:PGlite;
function tx(instance:PGlite):OrderTransactionManager{
  return {withTransaction:fn=>instance.transaction(async client=>fn({
    async query(sql,params=[]){const r=await client.query(sql,[...params]);return {rows:r.rows,rowCount:r.affectedRows??null};},
  }))};
}
async function localDb(dir?:string){
  const instance=new PGlite(dir);await instance.waitReady;
  for(const name of ['008_perp_margin_ledger']){
    await instance.exec(await readFile(fileURLToPath(new URL(`../sql/${name}.sql`,import.meta.url)),'utf8'));
  }
  return instance;
}
function op(action:MarginOperationInput['action'],operationId:string,amount:string,extra:Partial<MarginOperationInput>={}):MarginOperationInput{
  return {market:'BTC-USD-PERP',collateralToken:TOKEN,account:ACCOUNT,operationId,action,amount,...extra};
}
/** TEST-ONLY: bypass API and create an unaudited opening fixture balance. NEVER a production funding path. */
async function fixtureOpening(instance:PGlite,amount:string,extra:Partial<MarginOperationInput>={}){
  const entry=op('RESERVE','fixture-only','1',extra);
  await instance.query(
    `INSERT INTO perp_margin_balances
      (chain_id,verifying_contract,market,collateral_token,account,bucket,balance)
     VALUES($1,$2,$3,$4,$5,'AVAILABLE',$6)`,
    [DOMAIN.chainId,DOMAIN.verifyingContract,entry.market,entry.collateralToken.toLowerCase(),
      entry.account.toLowerCase(),amount],
  );
}
async function twoLegs(instance:PGlite,operationId:string,market='BTC-USD-PERP'){
  const result=await instance.query(
    `SELECT leg,bucket,signed_delta FROM perp_margin_entries WHERE operation_id=$1 AND market=$2 ORDER BY leg`,
    [operationId,market],
  );
  return result.rows as Array<{leg:number;bucket:string;signed_delta:string}>;
}
before(async()=>{db=await localDb();});
after(async()=>{if(db)await db.close();});

test('no funding path: empty account cannot reserve or create phantom opening funds',async()=>{
  const input=op('RESERVE','never-fund','1',{market:'EMPTY-PERP'});
  assert.deepEqual(await getIsolatedMarginBalances(db,DOMAIN,input),
    {available:'0',reserved:'0',positionMargin:'0',total:'0'});
  await assert.rejects(transferIsolatedMargin(tx(db),DOMAIN,input),MarginLedgerError);
  assert.equal(((await db.query('SELECT COUNT(*)::INTEGER n FROM perp_margin_operations')).rows[0] as {n:number}).n,0);
  assert.deepEqual(await getIsolatedMarginBalances(db,DOMAIN,input),
    {available:'0',reserved:'0',positionMargin:'0',total:'0'});
});

test('fixture margin moves available → reserved → position → available, ledger balanced',async()=>{
  await fixtureOpening(db,'1000000');
  const a=await transferIsolatedMargin(tx(db),DOMAIN,op('RESERVE','reserve-A','600000'));
  assert.deepEqual(a.balances,{available:'400000',reserved:'600000',positionMargin:'0',total:'1000000'});
  assert.deepEqual(await twoLegs(db,'reserve-A'),[
    {leg:0,bucket:'AVAILABLE',signed_delta:'-600000'},
    {leg:1,bucket:'RESERVED',signed_delta:'600000'},
  ]);
  assert.deepEqual((await transferIsolatedMargin(tx(db),DOMAIN,op('ALLOCATE','allocate-A','300000'))).balances,
    {available:'400000',reserved:'300000',positionMargin:'300000',total:'1000000'});
  assert.deepEqual((await transferIsolatedMargin(tx(db),DOMAIN,op('RELEASE','release-A','300000'))).balances,
    {available:'700000',reserved:'0',positionMargin:'300000',total:'1000000'});
  assert.deepEqual((await transferIsolatedMargin(tx(db),DOMAIN,op('UNALLOCATE','unallocate-A','300000'))).balances,
    {available:'1000000',reserved:'0',positionMargin:'0',total:'1000000'});
  const legs=await db.query('SELECT signed_delta FROM perp_margin_entries WHERE market=$1',['BTC-USD-PERP']);
  assert.equal((legs.rows as Array<{signed_delta:string}>).reduce((sum,row)=>sum+BigInt(row.signed_delta),0n),0n);
  const balances=await db.query('SELECT SUM(version)::INTEGER n FROM perp_margin_balances WHERE market=$1',['BTC-USD-PERP']);
  assert.equal((balances.rows[0] as {n:number}).n,8); // two balance mutations per operation
});

test('duplicate operationId is idempotent, not a second transfer; any changed payload conflicts',async()=>{
  const original=op('RESERVE','reserve-A','600000');
  const repeat=await transferIsolatedMargin(tx(db),DOMAIN,original);
  assert.equal(repeat.replayed,true);
  assert.deepEqual(repeat.balances,{available:'1000000',reserved:'0',positionMargin:'0',total:'1000000'});
  assert.equal((await twoLegs(db,'reserve-A')).length,2);
  for(const change of [
    {amount:'600001'}, {action:'RELEASE' as const}, {account:ACCOUNT2}, {collateralToken:ALT_TOKEN},
  ]){
    if(change.collateralToken)continue; // different token is a separate isolated scope, tested below
    await assert.rejects(transferIsolatedMargin(tx(db),DOMAIN,{...original,...change}),MarginLedgerError);
  }
});

test('concurrent requests with one operation ID post only two legs',async()=>{
  const source=op('RESERVE','same-id-parallel','25');
  const all=await Promise.all(Array.from({length:9},()=>transferIsolatedMargin(tx(db),DOMAIN,source)));
  assert.equal(all.filter(x=>!x.replayed).length,1);
  assert.equal(all.filter(x=>x.replayed).length,8);
  assert.equal((await twoLegs(db,'same-id-parallel')).length,2);
  assert.equal((await getIsolatedMarginBalances(db,DOMAIN,source)).reserved,'25');
});

test('concurrent distinct reservations cannot overdraw the same available bucket',async()=>{
  const args=Array.from({length:5},(_,i)=>op('RESERVE',`contend-${i}`,'400000'));
  const results=await Promise.allSettled(args.map(input=>transferIsolatedMargin(tx(db),DOMAIN,input)));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,2);
  assert.equal(results.filter(x=>x.status==='rejected').length,3);
  const state=await getIsolatedMarginBalances(db,DOMAIN,args[0]);
  assert.equal(state.available,'199975');
  assert.equal(state.reserved,'800025');
  assert.equal(state.total,'1000000');
  const ops=await db.query("SELECT COUNT(*)::INTEGER n FROM perp_margin_operations WHERE operation_id LIKE 'contend-%'");
  assert.equal((ops.rows[0] as {n:number}).n,2);
});

test('release and allocate are bounded by reserved; unallocate by position',async()=>{
  for(const input of [op('RELEASE','release-over','800026'),
    op('ALLOCATE','allocate-over','800026'),op('UNALLOCATE','position-over','1')]){
    await assert.rejects(transferIsolatedMargin(tx(db),DOMAIN,input),MarginLedgerError);
  }
  const before=await getIsolatedMarginBalances(db,DOMAIN,op('RESERVE','read','1'));
  assert.equal(before.total,'1000000');
  assert.equal(((await db.query('SELECT COUNT(*)::INTEGER n FROM perp_margin_operations WHERE operation_id=$1',['release-over'])).rows[0] as {n:number}).n,0);
});

test('ledger is strictly isolated by domain, market, token and account',async()=>{
  await fixtureOpening(db,'500',{market:'ETH-USD-PERP'});
  await fixtureOpening(db,'400',{collateralToken:ALT_TOKEN});
  await fixtureOpening(db,'300',{account:ACCOUNT2});
  const sample=op('RESERVE','scope-test','100');
  assert.equal((await transferIsolatedMargin(tx(db),DOMAIN,{...sample,market:'ETH-USD-PERP'})).balances.total,'500');
  assert.equal((await transferIsolatedMargin(tx(db),DOMAIN,{...sample,collateralToken:ALT_TOKEN})).balances.total,'400');
  assert.equal((await transferIsolatedMargin(tx(db),DOMAIN,{...sample,account:ACCOUNT2})).balances.total,'300');
  assert.equal((await getIsolatedMarginBalances(db,OTHER,sample)).total,'0');
  await assert.rejects(transferIsolatedMargin(tx(db),OTHER,sample),MarginLedgerError);
  assert.equal((await getIsolatedMarginBalances(db,DOMAIN,sample)).total,'1000000');
});

test('bad decimals, zero, overflow, invalid route/id/address are all rejected',async()=>{
  const invalid=[
    {...op('RESERVE','bad-input-1','0')},{...op('RESERVE','bad-input-2','01')},
    {...op('RESERVE','bad-input-3','-1')},{...op('RESERVE','bad-input-4','1.5')},
    {...op('RESERVE','bad-input-5',(1n<<256n).toString())},
    {...op('RESERVE','','1')},{...op('RESERVE','invalid id','1')},
    {...op('RESERVE','test','1',{account:'bad'})},
    {...op('RESERVE','test','1',{collateralToken:'0x0000000000000000000000000000000000000000'})},
    {...op('RESERVE','test','1',{market:'BTC-USD-PERP$'})},
    {...op('RESERVE','test','1',{action:'CREDIT' as MarginOperationInput['action']})},
  ];
  for(const value of invalid){await assert.rejects(transferIsolatedMargin(tx(db),DOMAIN,value));}
});

test('forced failure writing one journal leg rolls back BOTH bucket balances and operation',async()=>{
  const entry=op('RESERVE','fail-second-leg','50');
  const before=await getIsolatedMarginBalances(db,DOMAIN,entry);
  await db.exec("ALTER TABLE perp_margin_entries ADD CONSTRAINT reject_second_leg CHECK (operation_id <> 'fail-second-leg' OR leg <> 1)");
  try{
    await assert.rejects(transferIsolatedMargin(tx(db),DOMAIN,entry),/reject_second_leg/);
    assert.deepEqual(await getIsolatedMarginBalances(db,DOMAIN,entry),before);
    assert.equal((await twoLegs(db,'fail-second-leg')).length,0);
    assert.equal(((await db.query("SELECT COUNT(*)::INTEGER n FROM perp_margin_operations WHERE operation_id='fail-second-leg'")).rows[0] as {n:number}).n,0);
  }finally{await db.exec('ALTER TABLE perp_margin_entries DROP CONSTRAINT reject_second_leg');}
  assert.equal((await transferIsolatedMargin(tx(db),DOMAIN,entry)).replayed,false);
});

test('large atomic units preserve precision and never exceed uint256',async()=>{
  const market='HUGE-USD-PERP';
  const big=(1n<<210n).toString();
  await fixtureOpening(db,big,{market});
  const input=op('RESERVE','huge-transfer',(1n<<205n).toString(),{market});
  const result=await transferIsolatedMargin(tx(db),DOMAIN,input);
  assert.equal(BigInt(result.balances.available)+BigInt(result.balances.reserved),BigInt(big));
  assert.equal(result.balances.reserved,(1n<<205n).toString());
});

test('disk restart retains balanced postings and operation replay protection', {timeout:30000},async()=>{
  const path=await mkdtemp(join(tmpdir(),'perpdex-margin-ledger-'));
  let disk:PGlite|undefined;
  try{
    disk=await localDb(path);
    await fixtureOpening(disk,'1000',{market:'RESTART-PERP'});
    const source=op('RESERVE','restart-once','400',{market:'RESTART-PERP'});
    const first=await transferIsolatedMargin(tx(disk),DOMAIN,source);
    await disk.close();disk=undefined;
    disk=await localDb(path);
    const repeat=await transferIsolatedMargin(tx(disk),DOMAIN,source);
    assert.equal(repeat.replayed,true);
    assert.deepEqual(repeat.balances,first.balances);
    assert.deepEqual(await twoLegs(disk,'restart-once','RESTART-PERP'),[
      {leg:0,bucket:'AVAILABLE',signed_delta:'-400'},
      {leg:1,bucket:'RESERVED',signed_delta:'400'},
    ]);
    await assert.rejects(transferIsolatedMargin(tx(disk),DOMAIN,{...source,amount:'401'}),MarginLedgerError);
  }finally{if(disk)await disk.close();await rm(path,{recursive:true,force:true});}
});

test('tampering one stored posting is detected on replay rather than silently accepted',async()=>{
  const input=op('RESERVE','integrity-tamper','5');
  await transferIsolatedMargin(tx(db),DOMAIN,input);
  await db.query("UPDATE perp_margin_entries SET signed_delta='-6' WHERE operation_id=$1 AND leg=0",[input.operationId]);
  await assert.rejects(transferIsolatedMargin(tx(db),DOMAIN,input),MarginLedgerError);
});
