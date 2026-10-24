import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLocalSignedPgQaEnvironment,LocalPostgresQaGuardError} from '../qa/postgres-signed-margin-guard.ts';
const good={PERPDEX_TEST_PG_SOCKET:'/tmp/perpdex-pg-isolated-only/socket',
 PERPDEX_TEST_PG_SCHEMA:'perpdex_signed_qa_aabbccddee12',PERPDEX_TEST_PG_PHASE:'seed'};
test('QA guard accepts only exact isolated local socket and fresh schema shape',()=>{
 assert.deepEqual(validateLocalSignedPgQaEnvironment(good,false),{
 socket:good.PERPDEX_TEST_PG_SOCKET,schema:good.PERPDEX_TEST_PG_SCHEMA,phase:'seed'});
});
test('QA guard rejects missing or HTTP/TCP/prod/other socket endpoints',()=>{
 for(const s of [undefined,'localhost','127.0.0.1','/var/run/postgresql',
 '/tmp/postgres/socket','/tmp/perpdex-pg-a/socket/../other',
 '/tmp/perpdex-pg-a/socket?host=example.com']){
  assert.throws(()=>validateLocalSignedPgQaEnvironment(
   {...good,PERPDEX_TEST_PG_SOCKET:s},false),LocalPostgresQaGuardError);
 }
});
test('QA guard rejects unscoped/existing schema and non-seed phases',()=>{
 for(const schema of ['public','production','perp_qa_aabbccddee12',
  'perpdex_signed_qa_aaaa','perpdex_signed_qa_aaaaaaaaaaaa;drop schema']){
  assert.throws(()=>validateLocalSignedPgQaEnvironment(
   {...good,PERPDEX_TEST_PG_SCHEMA:schema},false),LocalPostgresQaGuardError);
 }
 for(const phase of [undefined,'verify','drop','prod']){
  assert.throws(()=>validateLocalSignedPgQaEnvironment(
   {...good,PERPDEX_TEST_PG_PHASE:phase},false),LocalPostgresQaGuardError);
 }
});
test('QA guard requires a real live socket, never silently falls back to TCP',()=>{
 assert.throws(()=>validateLocalSignedPgQaEnvironment(good),/no live private PostgreSQL test socket/);
});
