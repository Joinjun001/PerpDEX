/**
 * Guard for destructive-capable, opt-in local PostgreSQL QA only.
 * Does not connect, discover credentials, install PostgreSQL or touch a DB.
 */
import {statSync} from 'node:fs';
import {join} from 'node:path';

export class LocalPostgresQaGuardError extends Error {
  constructor(message:string){super(message);this.name='LocalPostgresQaGuardError';}
}
export type PgQaSettings={socket:string;schema:string;phase:'seed'};
export function validateLocalSignedPgQaEnvironment(
  env:Readonly<Record<string,string|undefined>>,checkSocket=true,
):PgQaSettings {
  const socket=env.PERPDEX_TEST_PG_SOCKET;
  const schema=env.PERPDEX_TEST_PG_SCHEMA;
  const phase=env.PERPDEX_TEST_PG_PHASE;
  if(!socket||!/^\/tmp\/perpdex-pg-[a-z0-9-]+\/socket$/.test(socket)){
    throw new LocalPostgresQaGuardError('private perpdex-pg test Unix socket required; network hosts forbidden');
  }
  if(!schema||!/^perpdex_signed_qa_[a-f0-9]{12}$/.test(schema)){
    throw new LocalPostgresQaGuardError('fresh perpdex_signed_qa_<12 hex> schema required');
  }
  if(phase!=='seed'){
    throw new LocalPostgresQaGuardError('explicit seed-only QA phase required');
  }
  if(checkSocket) {
    try {
      if(!statSync(join(socket,'.s.PGSQL.5432')).isSocket()){
        throw new Error('not a socket');
      }
    }catch {
      throw new LocalPostgresQaGuardError('no live private PostgreSQL test socket; do not substitute production');
    }
  }
  return {socket,schema,phase};
}
