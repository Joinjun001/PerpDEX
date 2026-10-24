/**
 * C3-C2-B2-B1: read-only, fail-closed signed SQL 015..020 trigger integrity.
 * Static manifest reviewed from the versioned SQL migrations; no migration
 * writes, no DDL, and no PostgreSQL role changes.
 */
import type {Pool} from 'pg';

export type SignedTriggerSpec={
 readonly name:string;readonly table:string;readonly functionName:string;
 readonly typeBits:number;readonly deferred:boolean;
};
export const REQUIRED_SIGNED_TRIGGERS=Object.freeze(
[
  {
    "name": "perp_signed_order_immutable_identity",
    "table": "perp_sim_orders",
    "functionName": "perp_signed_order_reject_mutation",
    "typeBits": 27,
    "deferred": false
  },
  {
    "name": "perp_signed_order_commit",
    "table": "perp_sim_orders",
    "functionName": "perp_signed_order_commit_check",
    "typeBits": 21,
    "deferred": true
  },
  {
    "name": "perp_signed_nonce_commit",
    "table": "order_nonces",
    "functionName": "perp_signed_nonce_commit_check",
    "typeBits": 21,
    "deferred": true
  },
  {
    "name": "perp_signed_position_commit",
    "table": "perp_position_snapshots",
    "functionName": "perp_signed_position_commit_fence",
    "typeBits": 29,
    "deferred": true
  },
  {
    "name": "perp_signed_paired_commit",
    "table": "perp_sim_paired_fills",
    "functionName": "perp_signed_paired_commit_fence",
    "typeBits": 5,
    "deferred": true
  },
  {
    "name": "perp_signed_allocation_commit",
    "table": "perp_margin_operations",
    "functionName": "perp_signed_allocation_commit_fence",
    "typeBits": 5,
    "deferred": true
  },
  {
    "name": "perp_margin_operations_immutable",
    "table": "perp_margin_operations",
    "functionName": "perp_signed_margin_history_immutable",
    "typeBits": 27,
    "deferred": false
  },
  {
    "name": "perp_margin_entries_immutable",
    "table": "perp_margin_entries",
    "functionName": "perp_signed_margin_history_immutable",
    "typeBits": 27,
    "deferred": false
  },
  {
    "name": "perp_signed_margin_balance_commit",
    "table": "perp_margin_balances",
    "functionName": "perp_signed_margin_balance_commit_check",
    "typeBits": 29,
    "deferred": true
  },
  {
    "name": "perp_signed_pair_preparation_immutable",
    "table": "perp_signed_pair_preparations",
    "functionName": "reject_signed_pair_preparation_mutation",
    "typeBits": 27,
    "deferred": false
  },
  {
    "name": "perp_signed_pair_preparation_commit",
    "table": "perp_signed_pair_preparations",
    "functionName": "check_signed_pair_preparation_commit",
    "typeBits": 5,
    "deferred": true
  },
  {
    "name": "perp_signed_pair_executions_immutable",
    "table": "perp_signed_pair_executions",
    "functionName": "reject_signed_pair_preparation_mutation",
    "typeBits": 27,
    "deferred": false
  },
  {
    "name": "perp_signed_filled_order_commit",
    "table": "perp_sim_orders",
    "functionName": "check_signed_filled_order_commit",
    "typeBits": 21,
    "deferred": true
  },
  {
    "name": "perp_signed_execution_commit",
    "table": "perp_signed_pair_executions",
    "functionName": "signed_pair_execution_commit_check",
    "typeBits": 5,
    "deferred": true
  },
  {
    "name": "perp_signed_execution_paired_commit",
    "table": "perp_sim_paired_fills",
    "functionName": "signed_pair_mutation_commit_check",
    "typeBits": 5,
    "deferred": true
  },
  {
    "name": "perp_signed_execution_balance_commit",
    "table": "perp_margin_balances",
    "functionName": "signed_execution_account_commit_check",
    "typeBits": 29,
    "deferred": true
  },
  {
    "name": "perp_signed_execution_position_commit",
    "table": "perp_position_snapshots",
    "functionName": "signed_execution_account_commit_check",
    "typeBits": 29,
    "deferred": true
  },
  {
    "name": "perp_signed_market_oi_commit",
    "table": "perp_market_open_interest",
    "functionName": "signed_execution_market_conservation_commit",
    "typeBits": 29,
    "deferred": true
  },
  {
    "name": "perp_signed_market_position_commit",
    "table": "perp_position_snapshots",
    "functionName": "signed_execution_market_conservation_commit",
    "typeBits": 29,
    "deferred": true
  },
  {
    "name": "perp_signed_cancel_receipt_immutable",
    "table": "perp_signed_cancel_receipts",
    "functionName": "perp_signed_cancel_receipt_immutable",
    "typeBits": 27,
    "deferred": false
  },
  {
    "name": "perp_signed_cancel_order_commit",
    "table": "perp_sim_orders",
    "functionName": "perp_signed_cancel_order_commit",
    "typeBits": 21,
    "deferred": true
  },
  {
    "name": "perp_signed_cancel_nonce_commit",
    "table": "order_nonces",
    "functionName": "perp_signed_cancel_nonce_commit",
    "typeBits": 21,
    "deferred": true
  },
  {
    "name": "perp_signed_cancel_receipt_commit",
    "table": "perp_signed_cancel_receipts",
    "functionName": "perp_signed_cancel_receipt_commit",
    "typeBits": 5,
    "deferred": true
  },
  {
    "name": "perp_signed_cancel_balance_commit",
    "table": "perp_margin_balances",
    "functionName": "perp_signed_cancel_balance_commit",
    "typeBits": 29,
    "deferred": true
  },
  {
    "name": "perp_signed_cancel_operation_commit",
    "table": "perp_margin_operations",
    "functionName": "perp_signed_cancel_m3_operation_commit",
    "typeBits": 5,
    "deferred": true
  },
  {
    "name": "perp_signed_order_fill_progress_commit",
    "table": "perp_sim_orders",
    "functionName": "perp_signed_order_fill_progress_commit",
    "typeBits": 21,
    "deferred": true
  },
  {
    "name": "perp_signed_execution_fill_progress_commit",
    "table": "perp_signed_pair_executions",
    "functionName": "perp_signed_execution_fill_progress_commit",
    "typeBits": 5,
    "deferred": true
  },
  {
    "name": "signed_account_margin_order_commit",
    "table": "perp_sim_orders",
    "functionName": "signed_account_margin_on_order_commit",
    "typeBits": 21,
    "deferred": true
  },
  {
    "name": "signed_account_margin_bucket_commit",
    "table": "perp_margin_balances",
    "functionName": "signed_account_margin_on_bucket_commit",
    "typeBits": 29,
    "deferred": true
  },
  {
    "name": "signed_account_margin_operation_commit",
    "table": "perp_margin_operations",
    "functionName": "signed_account_margin_on_operation_commit",
    "typeBits": 5,
    "deferred": true
  },
  {
    "name": "signed_account_margin_entry_commit",
    "table": "perp_margin_entries",
    "functionName": "signed_account_margin_on_entry_commit",
    "typeBits": 5,
    "deferred": true
  }
] as const satisfies readonly SignedTriggerSpec[]);
export type SignedTriggerCatalogRow={
 name:string;table:string;functionSchema:string;functionName:string;
 enabled:string;deferrable:boolean;initiallyDeferred:boolean;
 internal:boolean;securityDefiner:boolean;typeBits:number;
};
export type SignedTriggerAttestation={
 eligible:boolean;reasonCodes:readonly string[];
 requiredTriggerCount:number;
};
/**
 * Reads ONLY pg_catalog. A positive result attests trigger shape/state,
 * not trigger PL/pgSQL body integrity, SQL transaction isolation, role
 * permissions, or actual real-PostgreSQL concurrency.
 */
export async function inspectSignedTriggerCatalog(
 client:Pick<Pool,'query'>,schema:string,
):Promise<SignedTriggerCatalogRow[]>{
 if(!/^perpdex_signed_qa_[a-f0-9]{12}$/.test(schema)){
  throw new Error('canonical private signed QA schema required');
 }
 const result=await client.query({
  text:[
   'SELECT t.tgname AS name,c.relname AS "table",',
   'pn.nspname AS "functionSchema",p.proname AS "functionName",',
   't.tgenabled AS enabled,t.tgdeferrable AS deferrable,',
   't.tginitdeferred AS "initiallyDeferred",t.tgisinternal AS internal,',
   'p.prosecdef AS "securityDefiner",t.tgtype::integer AS "typeBits"',
   'FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid',
   'JOIN pg_namespace n ON n.oid=c.relnamespace',
   'JOIN pg_proc p ON p.oid=t.tgfoid',
   'JOIN pg_namespace pn ON pn.oid=p.pronamespace',
   'WHERE n.nspname=$1 ORDER BY t.tgname,c.relname',
  ].join(' '),values:[schema],
 });
 return result.rows as SignedTriggerCatalogRow[];
}
export function attestSignedTriggerCatalog(
 actual:readonly SignedTriggerCatalogRow[],schema:string,
):SignedTriggerAttestation{
 const reasons:string[]=[];
 if(!/^perpdex_signed_qa_[a-f0-9]{12}$/.test(schema)){
  return {eligible:false,reasonCodes:['invalid_schema'],requiredTriggerCount:REQUIRED_SIGNED_TRIGGERS.length};
 }
 const known=new Map<string,SignedTriggerCatalogRow[]>();
 if(!Array.isArray(actual)){
  return {eligible:false,reasonCodes:['catalog_not_array'],requiredTriggerCount:REQUIRED_SIGNED_TRIGGERS.length};
 }
 for(const row of actual){
  if(!row||typeof row.name!=='string'||typeof row.table!=='string'){
   reasons.push('invalid_trigger_row');continue;
  }
  const key=row.table+'::'+row.name;
  known.set(key,[...(known.get(key)??[]),row]);
 }
 for(const spec of REQUIRED_SIGNED_TRIGGERS){
  const key=spec.table+'::'+spec.name;
  const rows=known.get(key)??[];
  if(rows.length!==1){
   reasons.push((rows.length?'duplicate':'missing')+':'+key);
   continue;
  }
  const row=rows[0];
  if(row.functionSchema!==schema||row.functionName!==spec.functionName)
   reasons.push('function_mismatch:'+key);
  if(row.enabled!=='O'&&row.enabled!=='A')reasons.push('disabled:'+key);
  if(row.internal!==false)reasons.push('internal:'+key);
  if(row.securityDefiner!==false)reasons.push('security_definer:'+key);
  if(row.typeBits!==spec.typeBits)reasons.push('event_or_phase_mismatch:'+key);
  if(row.deferrable!==spec.deferred||row.initiallyDeferred!==spec.deferred)
   reasons.push('deferred_mismatch:'+key);
 }
 return {eligible:reasons.length===0,reasonCodes:Object.freeze(reasons),
  requiredTriggerCount:REQUIRED_SIGNED_TRIGGERS.length};
}
