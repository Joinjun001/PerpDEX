/**
 * C3-C2-B2-A: READ-ONLY pg_catalog permission assessment.
 * A positive result certifies only an audit-only role, NOT a trade writer,
 * user signature authorization, or an actual PostgreSQL QA test.
 */
import type {Pool} from 'pg';

export const SIGNED_PROTECTED_TABLES=Object.freeze([
 'order_nonces','perp_sim_orders','perp_margin_balances',
 'perp_margin_operations','perp_margin_entries','perp_position_snapshots',
 'perp_position_applications','perp_market_open_interest',
 'perp_sim_paired_fills','perp_signed_pair_preparations',
 'perp_signed_pair_executions','perp_signed_cancel_receipts',
] as const);
type RoleSnapshot={
 role:string;superuser:boolean;createRole:boolean;createDb:boolean;
 bypassRls:boolean;replication:boolean;ownsSchema:boolean;
 memberOfSchemaOwner:boolean;canCreateSchema:boolean;
 canCreateDatabase:boolean;securityDefinerExecutable:number;
};
type TableSnapshot={
 name:string;owns:boolean;memberOfOwner:boolean;canSelect:boolean;
 canInsert:boolean;canUpdate:boolean;canDelete:boolean;canTruncate:boolean;
 canReferences:boolean;canTrigger:boolean;
};
export type SignedReadOnlyRoleSnapshot={
 role:RoleSnapshot;tables:readonly TableSnapshot[];
};
export type SignedReadOnlyRoleAssessment={
 eligible:boolean;reasonCodes:readonly string[];roleName:string;protectedTableCount:number;
};
/** Uses only two parameterized SELECT statements, no GRANT, SET ROLE or DDL. */
export async function inspectSignedReadOnlyRole(
 queryClient:Pick<Pool,'query'>,schema:string,
):Promise<SignedReadOnlyRoleSnapshot>{
 if(!/^perpdex_signed_qa_[a-f0-9]{12}$/.test(schema)){
  throw new Error('only a canonical isolated signed QA schema may be inspected');
 }
 const role=await queryClient.query({
  text:[
    'SELECT current_user::text AS role, r.rolsuper AS superuser,',
    'r.rolcreaterole AS "createRole",r.rolcreatedb AS "createDb",',
    'r.rolbypassrls AS "bypassRls",r.rolreplication AS replication,',
    'n.nspowner=r.oid AS "ownsSchema",',
    'pg_has_role(r.oid,n.nspowner,\'MEMBER\') AS "memberOfSchemaOwner",',
    'has_schema_privilege(r.oid,n.oid,\'CREATE\') AS "canCreateSchema",',
    'has_database_privilege(r.oid,current_database(),\'CREATE\') AS "canCreateDatabase",',
    '(SELECT count(*)::integer FROM pg_proc p',
    'WHERE p.pronamespace=n.oid AND p.prosecdef',
    'AND has_function_privilege(r.oid,p.oid,\'EXECUTE\')) AS "securityDefinerExecutable"',
    'FROM pg_roles r JOIN pg_namespace n ON n.nspname=$1 WHERE r.rolname=current_user',
  ].join(' '),values:[schema],
 });
 if(role.rows.length!==1)throw new Error('QA schema or role metadata not uniquely readable');
 const tables=await queryClient.query({
  text:[
    'SELECT c.relname AS name,c.relowner=r.oid AS owns,',
    'pg_has_role(r.oid,c.relowner,\'MEMBER\') AS "memberOfOwner",',
    'has_table_privilege(r.oid,c.oid,\'SELECT\') AS "canSelect",',
    'has_table_privilege(r.oid,c.oid,\'INSERT\') AS "canInsert",',
    'has_table_privilege(r.oid,c.oid,\'UPDATE\') AS "canUpdate",',
    'has_table_privilege(r.oid,c.oid,\'DELETE\') AS "canDelete",',
    'has_table_privilege(r.oid,c.oid,\'TRUNCATE\') AS "canTruncate",',
    'has_table_privilege(r.oid,c.oid,\'REFERENCES\') AS "canReferences",',
    'has_table_privilege(r.oid,c.oid,\'TRIGGER\') AS "canTrigger"',
    'FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace',
    'JOIN pg_roles r ON r.rolname=current_user',
    'WHERE n.nspname=$1 AND c.relkind IN(\'r\',\'p\') ORDER BY c.relname',
  ].join(' '),values:[schema],
 });
 return {role:role.rows[0] as RoleSnapshot,tables:tables.rows as TableSnapshot[]};
}
/** Pure and strict: unknown/NULL flags and missing protected objects fail. */
export function assessSignedReadOnlyRole(snap:SignedReadOnlyRoleSnapshot):
 SignedReadOnlyRoleAssessment{
 const reasons:string[]=[];
 const role=snap?.role;
 if(!role||typeof role.role!=='string'||!role.role){
  return {eligible:false,reasonCodes:['role_metadata_missing'],
   roleName:'unknown',protectedTableCount:0};
 }
 for(const [key,flag] of [
  ['superuser',role.superuser],['create_role',role.createRole],
  ['create_database',role.createDb],['bypass_rls',role.bypassRls],
  ['replication',role.replication],['owns_schema',role.ownsSchema],
  ['member_of_schema_owner',role.memberOfSchemaOwner],
  ['schema_create',role.canCreateSchema],
  ['database_create',role.canCreateDatabase],
 ] as const)if(flag!==false)reasons.push(key);
 if(!Number.isSafeInteger(role.securityDefinerExecutable)||
    role.securityDefinerExecutable!==0)reasons.push('executable_security_definer');
 const byName=new Map<string,TableSnapshot>();
 for(const t of snap.tables??[]){
  if(!t||typeof t.name!=='string'||byName.has(t.name)){
   reasons.push('invalid_table_catalog');continue;
  }
  byName.set(t.name,t);
 }
 for(const name of SIGNED_PROTECTED_TABLES){
  const t=byName.get(name);
  if(!t){reasons.push('missing_table:'+name);continue;}
  if(t.canSelect!==true)reasons.push('select_missing:'+name);
  for(const key of ['owns','memberOfOwner','canInsert','canUpdate',
    'canDelete','canTruncate','canReferences','canTrigger'] as const){
   if(t[key]!==false)reasons.push(key+':'+name);
  }
 }
 return {eligible:reasons.length===0,reasonCodes:Object.freeze(reasons),
  roleName:role.role,protectedTableCount:SIGNED_PROTECTED_TABLES.length};
}
