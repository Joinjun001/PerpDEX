import test from 'node:test';
import assert from 'node:assert/strict';
import {
 SIGNED_PROTECTED_TABLES,inspectSignedReadOnlyRole,assessSignedReadOnlyRole,
 type SignedReadOnlyRoleSnapshot,
} from '../qa/postgres-signed-role-permissions.ts';

const schema='perpdex_signed_qa_aabbccddee12';
function eligibleFixture():SignedReadOnlyRoleSnapshot{
 return {role:{
  role:'qa_auditor',superuser:false,createRole:false,createDb:false,
  bypassRls:false,replication:false,ownsSchema:false,
  memberOfSchemaOwner:false,canCreateSchema:false,canCreateDatabase:false,
  securityDefinerExecutable:0,
 },tables:SIGNED_PROTECTED_TABLES.map(name=>({
  name,owns:false,memberOfOwner:false,canSelect:true,
  canInsert:false,canUpdate:false,canDelete:false,canTruncate:false,
  canReferences:false,canTrigger:false,
 }))};
}
test('B2-A pure auditor policy permits full read-only protected catalog',()=>{
 const s=assessSignedReadOnlyRole(eligibleFixture());
 assert.equal(s.eligible,true);
 assert.deepEqual(s.reasonCodes,[]);
 assert.equal(s.protectedTableCount,12);
});
test('B2-A superuser/owner/create-role/DDL/SECURITY DEFINER privilege always fails',()=>{
 for(const property of ['superuser','createRole','createDb','bypassRls',
 'replication','ownsSchema','memberOfSchemaOwner','canCreateSchema',
 'canCreateDatabase'] as const){
  const x=eligibleFixture();x.role[property]=true;
  assert.equal(assessSignedReadOnlyRole(x).eligible,false,property);
 }
 const x=eligibleFixture();x.role.securityDefinerExecutable=1;
 assert.ok(assessSignedReadOnlyRole(x).reasonCodes.includes('executable_security_definer'));
});
test('B2-A INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES or table ownership fails',()=>{
 for(const property of ['owns','memberOfOwner','canInsert','canUpdate',
  'canDelete','canTruncate','canReferences','canTrigger'] as const){
  const x=eligibleFixture();x.tables[0]![property]=true;
  assert.equal(assessSignedReadOnlyRole(x).eligible,false,property);
 }
});
test('B2-A missing tables, duplicate objects, missing SELECT, NULL flags all fail closed',()=>{
 const missing=eligibleFixture();
 assert.ok(assessSignedReadOnlyRole({...missing,tables:missing.tables.slice(1)})
   .reasonCodes.some(x=>x.startsWith('missing_table')));
 const duplicate=eligibleFixture();
 assert.ok(assessSignedReadOnlyRole({...duplicate,
   tables:[...duplicate.tables,{...duplicate.tables[0]!}]})
   .reasonCodes.includes('invalid_table_catalog'));
 const read=eligibleFixture();read.tables[0]!.canSelect=false;
 assert.equal(assessSignedReadOnlyRole(read).eligible,false);
 const unknown=eligibleFixture();unknown.role.superuser=null as unknown as boolean;
 assert.equal(assessSignedReadOnlyRole(unknown).eligible,false);
});
test('B2-A collector performs only parameterized SELECT and preserves exact schema',async()=>{
 const fixture=eligibleFixture();
 let called=0;
 const fake={
  async query(arg:{text:string;values:unknown[]}){
   called++;
   assert.ok(/^\s*SELECT /.test(arg.text));
   assert.equal(arg.values[0],schema);
   assert.ok(!arg.text.includes(';'),'single SELECT statement only');
   return {rows:called===1?[fixture.role]:fixture.tables};
  },
 } as never;
 const snap=await inspectSignedReadOnlyRole(fake,schema);
 assert.equal(called,2);
 assert.equal(assessSignedReadOnlyRole(snap).eligible,true);
});
test('B2-A collector rejects noncanonical schema before making DB call',async()=>{
 const forbidden=['public','production','perpdex_signed_qa_',
  'perpdex_signed_qa_aabbccddee12;DROP SCHEMA public',
  'perpdex_signed_qa_aabbccddee12."x"'];
 const fake={query:()=>{throw new Error('database call must not occur');}} as never;
 for(const name of forbidden){
  await assert.rejects(inspectSignedReadOnlyRole(fake,name),
   /canonical isolated signed QA schema/);
 }
});
test('B2-A collector rejects absent catalog metadata instead of approving role',async()=>{
 const fake={async query(){return {rows:[]};}} as never;
 await assert.rejects(inspectSignedReadOnlyRole(fake,schema),/not uniquely readable/);
});
