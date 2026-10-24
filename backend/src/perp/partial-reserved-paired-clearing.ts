/** M5-T3-B2: simulate one partial fill with two reserved reduce-only accounts.
 * Paired OI -> sorted guards -> positions -> margin. NO real order admission
 * or funds; both accounts and ALL surviving reduce reservations are reconciled.
 */
import {getAddress} from 'viem';
import type {OrderTransactionManager} from '../orders/order-transactions.ts';
import type {PerpPositionContext} from './position-engine.ts';
import {validatePerpMarketConfig} from './market-config.ts';
import {validateMockPriceSnapshot} from './price-snapshot.ts';
import {uint256} from './fixed-point.ts';
import {applySimPairedFillWithinTransaction,type PairedExecutionResult,type SimPairedFill} from './paired-clearing.ts';
import {lockReservedReduceGuardForPair,checkPartialReservedReduceForPair,
  finalizePartialReservedReduceForPair} from './reduce-reservations.ts';
export interface SimPartialReservedPair extends SimPairedFill {buyerOrderId:string;sellerOrderId:string;}
export async function applySimPartialReservedPair(transactions:OrderTransactionManager,
  fill:SimPartialReservedPair,ctx:PerpPositionContext):Promise<Readonly<PairedExecutionResult>>{
  if(!fill||fill.executionMode!=='SIMULATION_ONLY')throw new Error('simulation-only required');
  const c=validatePerpMarketConfig(ctx.config,ctx.domain,ctx.trustedSourceId,ctx.nowSeconds);
  validateMockPriceSnapshot(ctx.snapshot,c,ctx.domain,ctx.nowSeconds);
  const buy=getAddress(fill.buyerAccount).toLowerCase(),sell=getAddress(fill.sellerAccount).toLowerCase();
  if(buy===sell)throw Error('self match rejected');
  const qty=uint256(fill.quantityAtomic,'quantity',true).toString();
  const price=uint256(fill.priceAtomic,'price',true).toString();
  const legs=[{account:buy,orderId:fill.buyerOrderId,side:'BUY' as const,version:fill.buyerExpectedVersion},
    {account:sell,orderId:fill.sellerOrderId,side:'SELL' as const,version:fill.sellerExpectedVersion}]
    .sort((a,b)=>a.account.localeCompare(b.account));
  return transactions.withTransaction(async db=>{
    const q=await db.query(`SELECT mode,config_revision FROM perp_market_open_interest
      WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4 FOR UPDATE`,
      [c.chainId,c.verifyingContract,c.market,c.collateralToken]);
    const m=q.rows[0] as {mode:string;config_revision:string|number}|undefined;
    if(!m||m.mode!=='PAIRED'||Number(m.config_revision)!==c.revision){
      throw Error('paired market required');
    }
    for(const leg of legs)await lockReservedReduceGuardForPair(db,ctx,leg.account);
    for(const leg of legs){
      await checkPartialReservedReduceForPair(db,ctx,leg.account,leg.orderId,
        leg.side,price,qty,leg.version);
    }
    const result=await applySimPairedFillWithinTransaction(db,fill,ctx,true);
    for(const leg of legs){
      const applied=leg.side==='BUY'?result.buyer:result.seller;
      if(applied.closedQuantityAtomic!==qty||applied.openedQuantityAtomic!=='0'){
        throw Error('reduce-only quantity was not conserved');
      }
      await finalizePartialReservedReduceForPair(db,ctx,leg.account,leg.orderId,
        fill.fillId,qty,applied.position.sizeSignedAtomic,applied.position.version);
    }
    return result;
  });
}
