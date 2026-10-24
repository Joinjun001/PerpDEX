/**
 * M5-T3-C3-A: policy-neutral, read-only audit of signed v2 margin obligations.
 * No new funds, PnL posting, cancellation, allocation, settlement or authority.
 */
import {getAddress,keccak256,toHex} from 'viem';
import type {OrderTransactionManager} from '../orders/order-transactions.ts';
import type {PerpPositionContext} from './position-engine.ts';
import {markPerpPosition} from './position-engine.ts';
import {readSimPerpPosition} from './position-ledger.ts';
import {getIsolatedMarginBalances,type MarginBalances} from './margin-ledger.ts';
import {validatePerpMarketConfig} from './market-config.ts';
import {validateMockPriceSnapshot} from './price-snapshot.ts';
import {uint256,MAX_UINT256} from './fixed-point.ts';

export class SignedAccountReconciliationError extends Error {
  constructor(message:string){super(message);this.name='SignedAccountReconciliationError';}
}
export interface SignedAccountReconciliation {
  executionMode:'SIMULATION_ONLY';
  account:string;
  market:string;
  orderCount:number;
  openOrderCount:number;
  canceledOrderCount:number;
  filledOrderCount:number;
  openReservationLiabilityAtomic:string;
  terminalAllocationLiabilityAtomic:string;
  /** Reserved above signed OPEN obligations; NOT approved for release/withdrawal. */
  nonSignedReservedAtomic:string;
  /** Position bucket above signed opening ALLOCATE journal; NOT free collateral. */
  unclassifiedPositionMarginAtomic:string;
  positionVersion:number;
  positionSizeSignedAtomic:string;
  realizedPnlNumerator:string;
  realizedPnlAtomic:string;
  unrealizedPnlAtomic:string;
  feesAndFunding:'NOT_ACCOUNTED';
  balances:Readonly<MarginBalances>;
  executionAuthorized:false;
}
function address(value:string):string{
  try{const a=getAddress(value).toLowerCase();
    if(a==='0x0000000000000000000000000000000000000000')throw Error();
    return a;
  }catch{throw new SignedAccountReconciliationError('invalid nonzero EVM account');}
}
function boundedSum(a:bigint,b:bigint):bigint{
  if(a+b>MAX_UINT256)throw new SignedAccountReconciliationError('signed liability sum overflow');
  return a+b;
}
/**
 * Rows are inspected together in one transaction. This is NOT an executable
 * margin-availability oracle: open admissions in other PG sessions may race,
 * and only approved signed executions may move funds.
 */
export async function reconcileSignedSimAccount(
  accountInput:string,ctx:PerpPositionContext,transactions:OrderTransactionManager,
):Promise<Readonly<SignedAccountReconciliation>>{
  const config=validatePerpMarketConfig(ctx.config,ctx.domain,ctx.trustedSourceId,ctx.nowSeconds);
  validateMockPriceSnapshot(ctx.snapshot,config,ctx.domain,ctx.nowSeconds);
  const user=address(accountInput);
  const key=[config.chainId,config.verifyingContract.toLowerCase(),
    config.market,config.collateralToken.toLowerCase()] as const;
  return transactions.withTransaction(async db=>{
    const market=await db.query(`SELECT mode,config_revision FROM perp_market_open_interest
      WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4
      FOR UPDATE`,key);
    const m=market.rows[0] as {mode:string;config_revision:number|string}|undefined;
    if(!m||m.mode!=='PAIRED'||Number(m.config_revision)!==config.revision){
      throw new SignedAccountReconciliationError('current paired market required');
    }
    const orderResult=await db.query(`SELECT o.nonce,o.order_id,o.initial_margin,o.status,
         n.order_id AS nonce_order_id,n.expires_at AS nonce_expiry,
         n.status AS nonce_status,o.expires_at
       FROM perp_sim_orders o
       LEFT JOIN order_nonces n ON n.chain_id=o.chain_id
         AND n.verifying_contract=o.verifying_contract
         AND n.account=o.account AND n.nonce=o.nonce
       WHERE o.chain_id=$1 AND o.verifying_contract=$2 AND o.market=$3
         AND o.collateral_token=$4 AND o.account=$5
       ORDER BY o.order_id FOR UPDATE OF o`,[...key,user]);
    const rows=orderResult.rows as Array<{nonce:string;order_id:string;initial_margin:string;
      status:string;nonce_order_id:string|null;nonce_expiry:number|string|null;
      nonce_status:string|null;expires_at:number|string}>;
    let open=0n,filled=0n,openCount=0,filledCount=0,canceledCount=0;
    for(const row of rows){
      if(row.nonce_order_id!==row.order_id||
         Number(row.nonce_expiry)!==Number(row.expires_at)){
        throw new SignedAccountReconciliationError('signed order nonce commitment differs');
      }
      const amount=uint256(row.initial_margin,'signed initial margin',true);
      const reserve=await db.query(`SELECT action,amount,account,from_bucket,to_bucket
        FROM perp_margin_operations WHERE chain_id=$1 AND verifying_contract=$2
         AND market=$3 AND collateral_token=$4 AND operation_id=$5`,
        [...key,row.order_id.slice(2)]);
      const orig=reserve.rows[0] as {action:string;amount:string;account:string;
        from_bucket:string;to_bucket:string}|undefined;
      if(!orig||orig.action!=='RESERVE'||orig.amount!==row.initial_margin||
         orig.account!==user||orig.from_bucket!=='AVAILABLE'||orig.to_bucket!=='RESERVED'){
        throw new SignedAccountReconciliationError('signed reservation operation mismatch');
      }
      const legs=await db.query(`SELECT leg,bucket,signed_delta FROM perp_margin_entries
        WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4
          AND operation_id=$5 AND account=$6 ORDER BY leg`,[...key,row.order_id.slice(2),user]);
      const entries=legs.rows as Array<{leg:number;bucket:string;signed_delta:string}>;
      if(entries.length!==2||entries[0].leg!==0||entries[0].bucket!=='AVAILABLE'||
         entries[0].signed_delta!==`-${row.initial_margin}`||entries[1].leg!==1||
         entries[1].bucket!=='RESERVED'||entries[1].signed_delta!==row.initial_margin){
        throw new SignedAccountReconciliationError('signed reservation posting mismatch');
      }
      if(row.status==='OPEN'){
        if(row.nonce_status!=='USED')throw new SignedAccountReconciliationError('open nonce not USED');
        open=boundedSum(open,amount);openCount++;
      }else if(row.status==='FILLED'){
        if(row.nonce_status!=='USED')throw new SignedAccountReconciliationError('filled nonce not USED');
        const receipt=await db.query(`SELECT e.buyer_allocation_id,e.seller_allocation_id,
            p.buyer_order_id,p.seller_order_id,p.buyer_account,p.seller_account
          FROM perp_signed_pair_executions e
          JOIN perp_signed_pair_preparations p ON p.chain_id=e.chain_id
            AND p.verifying_contract=e.verifying_contract AND p.fill_id=e.fill_id
          WHERE e.chain_id=$1 AND e.verifying_contract=$2 AND e.market=$3
            AND e.collateral_token=$4 AND (p.buyer_order_id=$5 OR p.seller_order_id=$5)`,
          [...key,row.order_id]);
        if(receipt.rows.length!==1){
          throw new SignedAccountReconciliationError('filled order needs one terminal receipt');
        }
        const r=receipt.rows[0] as Record<string,string>;
        const opId=r.buyer_order_id===row.order_id&&r.buyer_account===user
          ?r.buyer_allocation_id
          :r.seller_order_id===row.order_id&&r.seller_account===user
            ?r.seller_allocation_id:null;
        if(!opId)throw new SignedAccountReconciliationError('terminal account/order mismatch');
        const allocation=await db.query(`SELECT account,action,from_bucket,to_bucket,amount
          FROM perp_margin_operations WHERE chain_id=$1 AND verifying_contract=$2
            AND market=$3 AND collateral_token=$4 AND operation_id=$5`,[...key,opId]);
        const a=allocation.rows[0] as Record<string,string>|undefined;
        if(!a||a.account!==user||a.action!=='ALLOCATE'||a.from_bucket!=='RESERVED'||
          a.to_bucket!=='POSITION'||a.amount!==row.initial_margin){
          throw new SignedAccountReconciliationError('filled signed allocation mismatch');
        }
        filled=boundedSum(filled,amount);filledCount++;
      }else if(row.status==='CANCELED'){
        if(row.nonce_status!=='CANCELED'){
          throw new SignedAccountReconciliationError('canceled nonce not CANCELED');
        }
        const releaseId=keccak256(toHex(`perp-sim-cancel:${row.order_id}`)).slice(2);
        const released=await db.query(`SELECT action,amount,account,from_bucket,to_bucket
          FROM perp_margin_operations WHERE chain_id=$1 AND verifying_contract=$2
           AND market=$3 AND collateral_token=$4 AND operation_id=$5`,
          [...key,releaseId]);
        const r=released.rows[0] as {action:string;amount:string;account:string;
          from_bucket:string;to_bucket:string}|undefined;
        if(!r||r.action!=='RELEASE'||r.amount!==row.initial_margin||
           r.account!==user||r.from_bucket!=='RESERVED'||r.to_bucket!=='AVAILABLE'){
          throw new SignedAccountReconciliationError('signed cancellation missing matching M3 RELEASE');
        }
        const deltas=await db.query(`SELECT leg,bucket,signed_delta FROM perp_margin_entries
          WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4
            AND operation_id=$5 AND account=$6 ORDER BY leg`,[...key,releaseId,user]);
        const pair=deltas.rows as Array<{leg:number;bucket:string;signed_delta:string}>;
        if(pair.length!==2||pair[0].leg!==0||pair[0].bucket!=='RESERVED'||
           pair[0].signed_delta!==`-${row.initial_margin}`||pair[1].leg!==1||
           pair[1].bucket!=='AVAILABLE'||pair[1].signed_delta!==row.initial_margin){
          throw new SignedAccountReconciliationError('signed cancellation RELEASE posting mismatch');
        }
        canceledCount++;
      }else throw new SignedAccountReconciliationError('unknown signed order state');
    }
    const balances=await getIsolatedMarginBalances(db,ctx.domain,
      {market:config.market,collateralToken:config.collateralToken,account:user});
    const reserved=uint256(balances.reserved,'reserved balance');
    const positionMargin=uint256(balances.positionMargin,'position margin');
    if(reserved<open){
      throw new SignedAccountReconciliationError('OPEN signed reserve exceeds persisted RESERVED margin');
    }
    if(positionMargin<filled){
      throw new SignedAccountReconciliationError('FILLED signed allocation exceeds persisted POSITION margin');
    }
    const position=await readSimPerpPosition(db,user,ctx);
    const mark=markPerpPosition(position,ctx);
    return Object.freeze({
      executionMode:'SIMULATION_ONLY',account:user,market:config.market,
      orderCount:rows.length,openOrderCount:openCount,filledOrderCount:filledCount,
      canceledOrderCount:canceledCount,openReservationLiabilityAtomic:open.toString(),
      terminalAllocationLiabilityAtomic:filled.toString(),
      nonSignedReservedAtomic:(reserved-open).toString(),
      unclassifiedPositionMarginAtomic:(positionMargin-filled).toString(),
      positionVersion:position.version,positionSizeSignedAtomic:position.sizeSignedAtomic,
      realizedPnlNumerator:position.realizedPnlNumerator,
      realizedPnlAtomic:mark.realizedPnlAtomic,
      unrealizedPnlAtomic:mark.unrealizedPnlAtomic,
      feesAndFunding:'NOT_ACCOUNTED' as const,balances,executionAuthorized:false as const,
    });
  });
}
