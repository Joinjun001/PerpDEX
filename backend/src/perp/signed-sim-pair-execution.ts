/**
 * Internal, SIMULATION_ONLY, full-size opening execution. Not an HTTP route or
 * real custody action. All financial and journal changes use one SQL transaction.
 */
import {keccak256,toHex} from 'viem';
import type {OrderTransactionManager} from '../orders/order-transactions.ts';
import type {SqlRunner} from '../orders/nonce-registry.ts';
import type {PerpPositionContext} from './position-engine.ts';
import type {SignedSimPairCandidate} from './signed-sim-pair-gate.ts';
import {assessPersistedSignedSimPerpPairWithinTransaction} from './signed-sim-pair-gate.ts';
import {applySimPairedFillWithinTransaction} from './paired-clearing.ts';
import {transferIsolatedMargin} from './margin-ledger.ts';

export class SignedSimPairExecutionError extends Error {
  constructor(message:string){super(message);this.name='SignedSimPairExecutionError';}
}
function withRunner(db:SqlRunner):OrderTransactionManager{
  return {withTransaction:fn=>fn(db)};
}
function operationId(fillId:string,orderId:string){
  return keccak256(toHex(`perp-signed-alloc:${fillId}:${orderId}`)).slice(2);
}
export interface SignedPairExecutionReceipt {
  executionMode:'SIMULATION_ONLY';
  status:'FILLED';
  fillId:string;
  buyerOrderId:string;
  sellerOrderId:string;
  buyerAllocationId:string;
  sellerAllocationId:string;
  executionAuthorized:false;
}
/**
 * A prior PREPARED row is historical evidence, NOT approval. Every signature,
 * source oracle, active order, reservation, risk and M4/OI state is rechecked
 * under market -> account canonical order locks.
 */
export async function executePreparedSignedSimPair(
  candidate:SignedSimPairCandidate,ctx:PerpPositionContext,
  transactions:OrderTransactionManager,
):Promise<Readonly<SignedPairExecutionReceipt>>{
  return transactions.withTransaction(async db=>{
    const proof=await assessPersistedSignedSimPerpPairWithinTransaction(candidate,ctx,db);
    if(candidate.quantityAtomic!==candidate.buyer.input.quantity||
       candidate.quantityAtomic!==candidate.seller.input.quantity||
       proof.buyer.positionVersion!==0||proof.seller.positionVersion!==0||
       proof.buyer.preTrade.before.status!=='FLAT'||
       proof.seller.preTrade.before.status!=='FLAT'||
       proof.buyer.preTrade.candidate?.realizedDeltaAtomic!=='0'||
       proof.seller.preTrade.candidate?.realizedDeltaAtomic!=='0'){
      throw new SignedSimPairExecutionError('only full-size flat opening supported');
    }
    const c=ctx.config;
    const marketKey=[c.chainId,c.verifyingContract.toLowerCase(),c.market,c.collateralToken.toLowerCase()];
    const prepared=await db.query(`SELECT * FROM perp_signed_pair_preparations
      WHERE chain_id=$1 AND verifying_contract=$2 AND fill_id=$3 FOR UPDATE`,
      [c.chainId,c.verifyingContract.toLowerCase(),proof.fillId]);
    const p=prepared.rows[0] as Record<string,unknown>|undefined;
    if(!p||p.market!==c.market||p.collateral_token!==c.collateralToken.toLowerCase()||
      p.fill_id!==proof.fillId||p.buyer_order_id!==proof.buyer.orderId||
      p.seller_order_id!==proof.seller.orderId||p.quantity_atomic!==proof.quantityAtomic||
      p.price_atomic!==proof.priceAtomic||Number(p.config_revision)!==c.revision||
      p.config_hash!==candidate.buyer.input.marketConfigHash||
      p.oracle_sequence!==proof.buyer.oracleSequence||
      Number(p.market_oi_version)!==proof.marketOiVersion||
      Number(p.buyer_position_version)!==proof.buyer.positionVersion||
      Number(p.seller_position_version)!==proof.seller.positionVersion||
      p.buyer_reserved_margin!==proof.buyer.reservedInitialMarginAtomic||
      p.seller_reserved_margin!==proof.seller.reservedInitialMarginAtomic){
      throw new SignedSimPairExecutionError('prepared evidence is stale or mismatched');
    }
    const buyer=candidate.buyer.input.account.toLowerCase();
    const seller=candidate.seller.input.account.toLowerCase();
    if(p.buyer_account!==buyer||p.seller_account!==seller){
      throw new SignedSimPairExecutionError('prepared account identity mismatch');
    }
    // Narrow first settlement to one signed OPEN order per account: no implicit
    // allocation/release for other outstanding signed reservations.
    const obligations=await db.query(`SELECT account,COUNT(*)::integer AS n
      FROM perp_sim_orders WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3
       AND collateral_token=$4 AND status='OPEN' AND account IN ($5,$6)
      GROUP BY account`,[...marketKey,buyer,seller]);
    if(obligations.rows.length!==2||
      (obligations.rows as Array<{account:string;n:number}>).some(r=>r.n!==1)){
      throw new SignedSimPairExecutionError('opening execution needs exactly one active signed order per account');
    }
    const trade=await applySimPairedFillWithinTransaction(db,{
      executionMode:'SIMULATION_ONLY',fillId:proof.fillId,
      priceAtomic:proof.priceAtomic,quantityAtomic:proof.quantityAtomic,
      buyerAccount:buyer,sellerAccount:seller,
      buyerExpectedVersion:proof.buyer.positionVersion,
      sellerExpectedVersion:proof.seller.positionVersion,
    },ctx);
    if(trade.buyer.position.lastFillId!==proof.fillId||
       trade.seller.position.lastFillId!==proof.fillId||
       trade.openInterest.longQuantityAtomic!==trade.openInterest.shortQuantityAtomic){
      throw new SignedSimPairExecutionError('paired position receipt mismatch');
    }
    const legs=[
      {account:buyer,orderId:proof.buyer.orderId,amount:proof.buyer.reservedInitialMarginAtomic},
      {account:seller,orderId:proof.seller.orderId,amount:proof.seller.reservedInitialMarginAtomic},
    ].sort((a,b)=>a.account.localeCompare(b.account));
    const allocations=new Map<string,string>();
    for(const leg of legs){
      const op=operationId(proof.fillId,leg.orderId);
      const moved=await transferIsolatedMargin(withRunner(db),ctx.domain,{
        operationId:op,action:'ALLOCATE',amount:leg.amount,account:leg.account,
        market:c.market,collateralToken:c.collateralToken,
      });
      if(moved.replayed)throw new SignedSimPairExecutionError('unexpected preexisting allocation replay');
      allocations.set(leg.account,op);
    }
    // Insert terminal proof before updating status; SQL 017 BEFORE trigger only
    // permits FILLED when linked terminal receipt is present. Deferred trigger
    // verifies M4, all M3 legs, immutable signing commitments, nonce and OI.
    const insert=await db.query(`INSERT INTO perp_signed_pair_executions
      (chain_id,verifying_contract,market,collateral_token,fill_id,
       buyer_order_id,seller_order_id,buyer_allocation_id,seller_allocation_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING fill_id`,
      [...marketKey,proof.fillId,proof.buyer.orderId,proof.seller.orderId,
        allocations.get(buyer),allocations.get(seller)]);
    if(insert.rows.length!==1)throw new SignedSimPairExecutionError('terminal execution receipt missing');
    for(const leg of legs){
      const changed=await db.query(`UPDATE perp_sim_orders SET status='FILLED'
        WHERE chain_id=$1 AND verifying_contract=$2 AND order_id=$3
         AND account=$4 AND status='OPEN' RETURNING order_id`,
        [c.chainId,c.verifyingContract.toLowerCase(),leg.orderId,leg.account]);
      if(changed.rows.length!==1)throw new SignedSimPairExecutionError('signed order lost filling race');
    }
    return Object.freeze({executionMode:'SIMULATION_ONLY',status:'FILLED',
      fillId:proof.fillId,buyerOrderId:proof.buyer.orderId,sellerOrderId:proof.seller.orderId,
      buyerAllocationId:allocations.get(buyer)!,sellerAllocationId:allocations.get(seller)!,
      executionAuthorized:false});
  });
}
