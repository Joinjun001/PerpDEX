/** M5-T3-B1 internal-only: two FULL reduce-only reservations, one atomic pair.
 * Strict order market OI -> sorted account guards -> positions -> margin rows.
 * NOT regular public signed orders, real assets, or live settlement.
 */
import {getAddress} from 'viem';
import type {OrderTransactionManager} from '../orders/order-transactions.ts';
import type {PerpPositionContext} from './position-engine.ts';
import {validatePerpMarketConfig} from './market-config.ts';
import {validateMockPriceSnapshot} from './price-snapshot.ts';
import {uint256} from './fixed-point.ts';
import {applySimPairedFillWithinTransaction,type PairedExecutionResult,type SimPairedFill} from './paired-clearing.ts';
import {lockReservedReduceGuardForPair,checkReservedReduceForPair,finalizeReservedReduceForPair} from './reduce-reservations.ts';
export interface SimReservedPairedFill extends SimPairedFill {buyerOrderId:string;sellerOrderId:string;}
export async function applySimReservedPairedFill(transactions:OrderTransactionManager,
  trade:SimReservedPairedFill,ctx:PerpPositionContext):Promise<Readonly<PairedExecutionResult>>{
  if(!trade||trade.executionMode!=='SIMULATION_ONLY')throw new Error('simulation only');
  const c=validatePerpMarketConfig(ctx.config,ctx.domain,ctx.trustedSourceId,ctx.nowSeconds);
  validateMockPriceSnapshot(ctx.snapshot,c,ctx.domain,ctx.nowSeconds);
  const buyer=getAddress(trade.buyerAccount).toLowerCase(),seller=getAddress(trade.sellerAccount).toLowerCase();
  if(buyer===seller)throw Error('self trade rejected');
  const qty=uint256(trade.quantityAtomic,'quantityAtomic',true).toString();
  const price=uint256(trade.priceAtomic,'priceAtomic',true).toString();
  const legs=[{account:buyer,orderId:trade.buyerOrderId,side:'BUY' as const,version:trade.buyerExpectedVersion},
    {account:seller,orderId:trade.sellerOrderId,side:'SELL' as const,version:trade.sellerExpectedVersion}]
    .sort((a,b)=>a.account.localeCompare(b.account));
  return transactions.withTransaction(async db=>{
    const locked=await db.query(`SELECT mode,config_revision FROM perp_market_open_interest
      WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4 FOR UPDATE`,
      [c.chainId,c.verifyingContract,c.market,c.collateralToken]);
    const row=locked.rows[0] as {mode:string;config_revision:number|string}|undefined;
    if(!row||row.mode!=='PAIRED'||Number(row.config_revision)!==c.revision){
      throw new Error('existing paired market required for reserved close');
    }
    for(const leg of legs)await lockReservedReduceGuardForPair(db,ctx,leg.account);
    for(const leg of legs){
      await checkReservedReduceForPair(db,ctx,leg.account,leg.orderId,leg.side,price,qty,leg.version);
    }
    const result=await applySimPairedFillWithinTransaction(db,trade,ctx,{buyerOrderId:trade.buyerOrderId,sellerOrderId:trade.sellerOrderId});
    for(const leg of legs){
      const delta=leg.side==='BUY'?result.buyer:result.seller;
      if(delta.closedQuantityAtomic!==qty||delta.openedQuantityAtomic!=='0'){
        throw new Error('reserved fill did not purely reduce');
      }
      await finalizeReservedReduceForPair(db,ctx,leg.account,leg.orderId,
        trade.fillId,qty,delta.position.sizeSignedAtomic,delta.position.version);
    }
    return result;
  });
}
