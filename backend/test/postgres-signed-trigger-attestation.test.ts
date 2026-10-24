import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {fileURLToPath} from 'node:url';
import {
 REQUIRED_SIGNED_TRIGGERS,inspectSignedTriggerCatalog,attestSignedTriggerCatalog,
 type SignedTriggerCatalogRow,
} from '../qa/postgres-signed-trigger-attestation.ts';

const schema='perpdex_signed_qa_aabbccddee12';
function expectedRows():SignedTriggerCatalogRow[]{
 return REQUIRED_SIGNED_TRIGGERS.map(s=>({
  name:s.name,table:s.table,functionSchema:schema,functionName:s.functionName,
  enabled:'O',deferrable:s.deferred,initiallyDeferred:s.deferred,
  internal:false,securityDefiner:false,typeBits:s.typeBits,
 }));
}
test('B2-B1 manifests 31 signed SQL 015-020 enforcement triggers',()=>{
 assert.equal(REQUIRED_SIGNED_TRIGGERS.length,31);
 assert.equal(new Set(REQUIRED_SIGNED_TRIGGERS.map(x=>x.name)).size,31);
 assert.equal(attestSignedTriggerCatalog(expectedRows(),schema).eligible,true);
});
test('B2-B1 manifest matches versioned SQL CREATE TRIGGER declarations',()=>{
 let expected=0;
 for(let i=15;i<=20;i++){
  const pathname=fileURLToPath(new URL('../sql/'+String(i).padStart(3,'0')+
   '_'+({15:'perp_signed_opening_fence',16:'perp_signed_pair_preparations',
    17:'perp_signed_pair_executions',18:'perp_signed_cancel_integrity',
    19:'perp_signed_order_fill_progress',
    20:'perp_signed_account_margin_conservation'} as Record<number,string>)[i]+'.sql',
   import.meta.url));
  const sql=readFileSync(pathname,'utf8');
  const blocks=[...sql.matchAll(/CREATE\s+(CONSTRAINT\s+)?TRIGGER\s+(\w+)\s+([^;]+);/gi)];
  expected+=blocks.length;
  for(const [,constraint,name,body] of blocks){
   const table=/\bON\s+(\w+)/i.exec(body)?.[1];
   const fn=/EXECUTE\s+FUNCTION\s+(\w+)\(/i.exec(body)?.[1];
   const spec=REQUIRED_SIGNED_TRIGGERS.find(t=>t.name===name);
   assert.ok(spec,'manifest must include '+name);
   assert.equal(spec.table,table);
   assert.equal(spec.functionName,fn);
   assert.equal(spec.deferred,Boolean(constraint));
  }
 }
 assert.equal(expected,31);
});
test('B2-B1 missing or duplicated trigger fails, unrelated triggers permitted',()=>{
 const good=expectedRows();
 const missing=attestSignedTriggerCatalog(good.slice(1),schema);
 assert.ok(missing.reasonCodes.some(x=>x.startsWith('missing:')));
 const duplicate=attestSignedTriggerCatalog([...good,good[0]!],schema);
 assert.ok(duplicate.reasonCodes.some(x=>x.startsWith('duplicate:')));
 assert.equal(attestSignedTriggerCatalog([...good,{
  ...good[0]!,name:'unrelated_additional_trigger',
 }],schema).eligible,true);
});
test('B2-B1 disabled or replica-only enforcement trigger fails',()=>{
 for(const enabled of ['D','R','',null] as const){
  const rows=expectedRows();rows[0]!.enabled=enabled as string;
  assert.ok(attestSignedTriggerCatalog(rows,schema).reasonCodes
   .some(x=>x.startsWith('disabled:')));
 }
 const always=expectedRows();always[0]!.enabled='A';
 assert.equal(attestSignedTriggerCatalog(always,schema).eligible,true);
});
test('B2-B1 incorrect table/function/schema/owner-mode detection fails',()=>{
 for(const [field,value] of [
  ['functionName','wrong_trigger'],['functionSchema','public'],
  ['securityDefiner',true],['internal',true],['table','other_table'],
 ] as const){
  const rows=expectedRows();(rows[0] as unknown as Record<string,unknown>)[field]=value;
  assert.equal(attestSignedTriggerCatalog(rows,schema).eligible,false,field);
 }
});
test('B2-B1 changed ROW/BEFORE/AFTER/INSERT/UPDATE/DELETE mask fails',()=>{
 for(const bit of [1,2,4,8,16,32]){
  const rows=expectedRows();rows[0]!.typeBits^=bit;
  assert.ok(attestSignedTriggerCatalog(rows,schema).reasonCodes
    .some(x=>x.startsWith('event_or_phase_mismatch:')));
 }
});
test('B2-B1 disabling deferrability/initially deferred on signed COMMIT fails',()=>{
 const target=REQUIRED_SIGNED_TRIGGERS.findIndex(x=>x.deferred);
 assert.ok(target>=0);
 for(const prop of ['deferrable','initiallyDeferred'] as const){
  const rows=expectedRows();rows[target]![prop]=false;
  assert.ok(attestSignedTriggerCatalog(rows,schema).reasonCodes
   .some(x=>x.startsWith('deferred_mismatch:')));
 }
 const pre=expectedRows();pre[0]!.deferrable=true;
 assert.equal(attestSignedTriggerCatalog(pre,schema).eligible,false);
});
test('B2-B1 noncanonical schema and missing/null catalog metadata fail closed',()=>{
 assert.ok(attestSignedTriggerCatalog(expectedRows(),'public').reasonCodes.includes('invalid_schema'));
 assert.ok(attestSignedTriggerCatalog(null as unknown as SignedTriggerCatalogRow[],schema)
   .reasonCodes.includes('catalog_not_array'));
 const rows=expectedRows();
 rows[0]!.typeBits=null as unknown as number;
 assert.equal(attestSignedTriggerCatalog(rows,schema).eligible,false);
});
test('B2-B1 collector only makes one parameterized catalog SELECT',async()=>{
 let calls=0;
 const mock={async query(request:{text:string;values:unknown[]}){
  calls++;
  assert.equal(request.values[0],schema);
  assert.ok(request.text.startsWith('SELECT '));
  assert.ok(!request.text.includes(';'));
  return {rows:expectedRows()};
 }} as never;
 const rows=await inspectSignedTriggerCatalog(mock,schema);
 assert.equal(calls,1);
 assert.equal(attestSignedTriggerCatalog(rows,schema).eligible,true);
});
test('B2-B1 collector rejects unsafe schema before touching connection',async()=>{
 const fake={query(){throw Error('must not touch PG');}} as never;
 for(const name of ['public','production','perpdex_signed_qa_11',
 'perpdex_signed_qa_aaaaaaaaaaaa;DROP SCHEMA public']){
  await assert.rejects(inspectSignedTriggerCatalog(fake,name),
   /canonical private signed QA schema/i);
 }
});

test('B2-B1 real PGlite pg_catalog SQL 001/008-020 trigger attestation',{timeout:60000},async()=>{
 const db=new PGlite();
 try{
  await db.waitReady;
  await db.exec('CREATE SCHEMA '+schema+'; SET search_path TO '+schema+';');
  const migrations=readdirSync(fileURLToPath(new URL('../sql/',import.meta.url)))
    .filter(f=>/^(001|0(?:0[8-9]|1[0-9]|20))_.*\.sql$/.test(f)).sort();
  assert.equal(migrations.length,14);
  for(const file of migrations){
   await db.exec(readFileSync(fileURLToPath(new URL('../sql/'+file,import.meta.url)),'utf8'));
  }
  const adapter={query:({text,values}:{text:string;values:unknown[]})=>
   db.query(text,values)} as never;
  const catalog=await inspectSignedTriggerCatalog(adapter,schema);
  const result=attestSignedTriggerCatalog(catalog,schema);
  assert.deepEqual(result.reasonCodes,[]);
  assert.equal(result.requiredTriggerCount,31);
  // Even in the loaded SQL schema, our pure assessment must reject a
  // simulated disabled trigger. Never ALTER the actual test schema.
  const disabled=catalog.map(x=>({...x}));
  const target=disabled.find(x=>x.name==='signed_account_margin_order_commit');
  assert.ok(target);target.enabled='D';
  assert.ok(attestSignedTriggerCatalog(disabled,schema).reasonCodes
    .some(x=>x.startsWith('disabled:')));
 }finally{await db.close();}
});
