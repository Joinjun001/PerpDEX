/**
 * C3-C1: read-only persisted-fill projection. Each committed fill is counted
 * from immutable M4-linked signed terminal evidence (SQL 017), not proposed
 * fills or PREPARED records. Partial signed fills are NOT enabled.
 */
import type {OrderSigningDomainInput} from '../orders/signature.ts';
import {validateOrderSigningDomain} from '../orders/signature.ts';
import type {OrderTransactionManager} from '../orders/order-transactions.ts';
import {uint256} from './fixed-point.ts';

const ORDER_ID=/^0x[0-9a-f]{64}$/;
export class SignedSimFillProgressError extends Error {
  constructor(message:string){super(message);this.name='SignedSimFillProgressError';}
}
export interface SignedSimFillProgress {
  executionMode:'SIMULATION_ONLY';
  orderId:string;
  account:string;
  nonce:string;
  market:string;
  status:'OPEN'|'CANCELED'|'FILLED';
  totalQuantityAtomic:string;
  cumulativeFilledQuantityAtomic:string;
  unfilledQuantityAtomic:string;
  executableRemainingQuantityAtomic:string;
  committedFillCount:number;
  /** Future partial fills require new settlement and margin invariants. */
  partialFillsAuthorized:false;
  executionAuthorized:false;
}
type StoredProgress={
  order_id:string;account:string;nonce:string;market:string;status:string;
  total_quantity_atomic:string;cumulative_filled_quantity_atomic:string;
  unfilled_quantity_atomic:string;executable_remaining_quantity_atomic:string;
  committed_fill_count:number;
};
/**
 * Order row lock prevents THIS read from racing a cancel/full-fill transaction.
 * It is not a market-matching lock or a token for later execution.
 */
export async function inspectSignedSimFillProgress(
  orderId:string,domainInput:OrderSigningDomainInput,
  transactions:OrderTransactionManager,
):Promise<Readonly<SignedSimFillProgress>>{
  if(typeof orderId!=='string'||!ORDER_ID.test(orderId)){
    throw new SignedSimFillProgressError('canonical signed v2 orderId required');
  }
  const domain=validateOrderSigningDomain(domainInput);
  return transactions.withTransaction(async db=>{
    const schema=await db.query(
      "SELECT to_regclass('perp_signed_order_fill_progress') AS oid");
    if(!(schema.rows[0] as {oid:string|null}|undefined)?.oid){
      throw new SignedSimFillProgressError('SQL 019 signed fill progress missing');
    }
    const key=[domain.chainId,domain.verifyingContract.toLowerCase(),orderId] as const;
    const locked=await db.query(
      `SELECT order_id FROM perp_sim_orders WHERE chain_id=$1 AND
        verifying_contract=$2 AND order_id=$3 FOR UPDATE`,key);
    if(locked.rows.length!==1){
      throw new SignedSimFillProgressError('signed order not found');
    }
    const got=await db.query(`SELECT * FROM perp_signed_order_fill_progress
      WHERE chain_id=$1 AND verifying_contract=$2 AND order_id=$3`,key);
    const row=got.rows[0] as StoredProgress|undefined;
    if(!row||got.rows.length!==1||row.order_id!==orderId){
      throw new SignedSimFillProgressError('signed fill progress projection missing');
    }
    let total:bigint,filled:bigint,unfilled:bigint,executable:bigint;
    try{
      total=uint256(row.total_quantity_atomic,'total quantity',true);
      filled=uint256(row.cumulative_filled_quantity_atomic,'filled quantity');
      unfilled=uint256(row.unfilled_quantity_atomic,'unfilled quantity');
      executable=uint256(row.executable_remaining_quantity_atomic,'executable quantity');
    }catch{
      throw new SignedSimFillProgressError('persisted progress amount malformed');
    }
    const full=row.status==='FILLED';
    if(!Number.isSafeInteger(row.committed_fill_count)||row.committed_fill_count<0||
       filled>total||unfilled>total||filled+unfilled!==total||
       (full&&(row.committed_fill_count!==1||filled!==total||unfilled!==0n))||
       (!full&&(row.committed_fill_count!==0||filled!==0n||unfilled!==total))||
       (row.status!=='OPEN'&&row.status!=='CANCELED'&&!full)||
       executable!==(row.status==='OPEN'?unfilled:0n)){
      throw new SignedSimFillProgressError('committed fill/remaining quantity mismatch');
    }
    return Object.freeze({
      executionMode:'SIMULATION_ONLY' as const,
      orderId,account:row.account,nonce:row.nonce,market:row.market,
      status:row.status as 'OPEN'|'CANCELED'|'FILLED',
      totalQuantityAtomic:total.toString(),
      cumulativeFilledQuantityAtomic:filled.toString(),
      unfilledQuantityAtomic:unfilled.toString(),
      executableRemainingQuantityAtomic:executable.toString(),
      committedFillCount:row.committed_fill_count,
      partialFillsAuthorized:false as const,
      executionAuthorized:false as const,
    });
  });
}
