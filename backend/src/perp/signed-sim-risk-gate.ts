/** M5-T3-C1: transactional proof only. No fill, margin transfer, order mutation,
 * execution rights or money movement. SIMULATION_ONLY signed M3 opening orders.
 */
import type {OrderTransactionManager} from '../orders/order-transactions.ts';
import type {PerpPositionContext} from './position-engine.ts';
import {readSimPerpPosition} from './position-ledger.ts';
import {getIsolatedMarginBalances} from './margin-ledger.ts';
import {authenticateSimPerpOrderIntent,type SimPerpOrderInput} from './sim-order.ts';
import {evaluateSimPreTrade,type SimPreTradeReport} from './pre-trade-risk.ts';
import {computeSimMarketOpenInterest} from './paired-clearing.ts';
import {uint256} from './fixed-point.ts';

export class SignedSimRiskGateError extends Error{
  constructor(message:string){super(message);this.name='SignedSimRiskGateError';}
}
export interface SignedSimRiskGateResult{
  executionMode:'SIMULATION_ONLY';orderId:string;nonce:string;
  positionVersion:number;marketOiVersion:number;oracleSequence:string;
  reservedInitialMarginAtomic:string;
  preTrade:Readonly<SimPreTradeReport>;
  executionAuthorized:false;
}
const num=(raw:unknown,label:string)=>{
  const n=Number(raw);if(!Number.isSafeInteger(n)||n<0)throw new SignedSimRiskGateError(`${label}: unsafe version`);
  return n;
};
/** Read existing durable M3/M4/M5 records using one transaction and lock order:
 * market OI -> any capacity guard -> position -> signed shadow order -> nonce
 * -> all margin bucket rows. Never create an account, fill or ledger entry.
 */
export async function assessPersistedSignedSimPerpOrder(
  input:SimPerpOrderInput,signature:string,ctx:PerpPositionContext,
  transactions:OrderTransactionManager,simulatedFillQuantityAtomic:string=input.quantity,
  expectedPositionVersion:number=0,
):Promise<Readonly<SignedSimRiskGateResult>>{
  const {order,config,snapshot,orderId,initialMargin}=await authenticateSimPerpOrderIntent(
    input,signature,ctx.domain,ctx.config,ctx.trustedSourceId,ctx.snapshot,ctx.nowSeconds);
  const fill=uint256(simulatedFillQuantityAtomic,'simulatedFillQuantityAtomic',true);
  if(fill>BigInt(order.quantity))throw new SignedSimRiskGateError('fill exceeds signed quantity');
  if(!Number.isSafeInteger(expectedPositionVersion)||expectedPositionVersion<0){
    throw new SignedSimRiskGateError('unsafe expected position version');
  }
  const key=[config.chainId,config.verifyingContract,config.market,config.collateralToken] as const;
  const account=order.account.toLowerCase();
  return transactions.withTransaction(async db=>{
    const market=await db.query(`SELECT mode,config_revision,open_interest_atomic,version
      FROM perp_market_open_interest WHERE chain_id=$1 AND verifying_contract=$2
      AND market=$3 AND collateral_token=$4 FOR UPDATE`,key);
    const marker=market.rows[0] as {mode:string;config_revision:number|string;
      open_interest_atomic:string;version:number|string}|undefined;
    if(!marker||marker.mode!=='PAIRED'||num(marker.config_revision,'market config')!==config.revision){
      throw new SignedSimRiskGateError('existing paired market and current policy required');
    }
    // Opening orders are not interchangeable with M5 reduce-only reservations.
    const guard=await db.query(`SELECT position_version FROM perp_reduce_guards
      WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4
      AND account=$5 FOR UPDATE`,[...key,account]);
    if(guard.rows.length)throw new SignedSimRiskGateError('opening order cannot reuse reduce-only guard');
    const snap=await db.query(`SELECT version FROM perp_position_snapshots
      WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4
      AND account=$5 FOR UPDATE`,[...key,account]);
    const position=await readSimPerpPosition(db,account,ctx);
    if(position.version!==expectedPositionVersion||
       snap.rows.length>0 && num((snap.rows[0] as {version:number|string}).version,'position version')!==position.version){
      throw new SignedSimRiskGateError('position version changed after proposed assessment');
    }
    const active=await db.query(`SELECT market,collateral_token,side,price,quantity,expires_at,
      config_revision,market_config_hash,policy_source,oracle_sequence,initial_margin,status
      FROM perp_sim_orders WHERE chain_id=$1 AND verifying_contract=$2 AND account=$3
      AND nonce=$4 AND order_id=$5 FOR UPDATE`,
      [key[0],key[1],account,order.nonce,orderId]);
    const stored=active.rows[0] as Record<string,unknown>|undefined;
    if(!stored||stored.status!=='OPEN'||stored.market!==config.market||
       stored.collateral_token!==config.collateralToken||stored.side!==order.side||
       stored.price!==order.price||stored.quantity!==order.quantity||
       num(stored.expires_at,'expiry')!==order.expiresAt||
       num(stored.config_revision,'revision')!==config.revision||
       stored.market_config_hash!==order.marketConfigHash||
       stored.policy_source!==config.sourceId||
       stored.oracle_sequence!==snapshot.sourceSequence||
       stored.initial_margin!==initialMargin){
      throw new SignedSimRiskGateError('stale/mismatched signed shadow order, policy or oracle');
    }
    const nonce=await db.query(`SELECT status,order_id,expires_at FROM order_nonces
      WHERE chain_id=$1 AND verifying_contract=$2 AND account=$3 AND nonce=$4 FOR UPDATE`,
      [key[0],key[1],account,order.nonce]);
    const consumed=nonce.rows[0] as {status:string;order_id:string;expires_at:number|string}|undefined;
    if(!consumed||consumed.status!=='USED'||consumed.order_id!==orderId||
       num(consumed.expires_at,'nonce expiry')!==order.expiresAt){
      throw new SignedSimRiskGateError('missing or invalid signed nonce tombstone');
    }
    const operation=await db.query(`SELECT action,amount,account,from_bucket,to_bucket
      FROM perp_margin_operations WHERE chain_id=$1 AND verifying_contract=$2
      AND market=$3 AND collateral_token=$4 AND operation_id=$5 FOR SHARE`,
      [...key,orderId.slice(2)]);
    const reserve=operation.rows[0] as {action:string;amount:string;account:string;
      from_bucket:string;to_bucket:string}|undefined;
    if(!reserve||reserve.action!=='RESERVE'||reserve.amount!==initialMargin||
      reserve.account!==account||reserve.from_bucket!=='AVAILABLE'||reserve.to_bucket!=='RESERVED'){
      throw new SignedSimRiskGateError('missing or mismatched M3 reserve operation');
    }
    const entries=await db.query(`SELECT leg,account,bucket,signed_delta FROM perp_margin_entries
      WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4
      AND operation_id=$5 ORDER BY leg FOR SHARE`,[...key,orderId.slice(2)]);
    const legs=entries.rows as Array<{leg:number;account:string;bucket:string;signed_delta:string}>;
    if(legs.length!==2||legs[0].leg!==0||legs[1].leg!==1||
       legs[0].account!==account||legs[1].account!==account||
       legs[0].bucket!=='AVAILABLE'||legs[1].bucket!=='RESERVED'||
       legs[0].signed_delta!==`-${initialMargin}`||legs[1].signed_delta!==initialMargin){
      throw new SignedSimRiskGateError('reserved collateral has no valid double-entry postings');
    }
    const rows=await db.query(`SELECT bucket,balance,version FROM perp_margin_balances
      WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4
      AND account=$5 ORDER BY bucket FOR SHARE`,[...key,account]);
    const buckets=rows.rows as Array<{bucket:string;balance:string;version:number|string}>;
    if(buckets.length!==3||buckets.map(x=>x.bucket).join(',')!=='AVAILABLE,POSITION,RESERVED'){
      throw new SignedSimRiskGateError('three durable M3 margin buckets required');
    }
    for(const b of buckets){num(b.version,'margin version');uint256(b.balance,'persisted margin');}
    const margin=await getIsolatedMarginBalances(db,ctx.domain,
      {market:config.market,collateralToken:config.collateralToken,account});
    const sum=await db.query(`SELECT initial_margin FROM perp_sim_orders WHERE
      chain_id=$1 AND verifying_contract=$2 AND account=$3 AND market=$4
      AND collateral_token=$5 AND status='OPEN'`,
      [key[0],key[1],account,key[2],key[3]]);
    let committed=0n;
    for(const row of sum.rows as Array<{initial_margin:string}>){
      committed+=uint256(row.initial_margin,'open reservation');
    }
    if(committed>BigInt(margin.reserved)||BigInt(margin.reserved)<BigInt(initialMargin)){
      throw new SignedSimRiskGateError('persisted reservation obligations exceed M3 reserved bucket');
    }
    const oi=await computeSimMarketOpenInterest(db,ctx);
    if(oi.longQuantityAtomic!==oi.shortQuantityAtomic||
       oi.openInterestAtomic!==marker.open_interest_atomic){
      throw new SignedSimRiskGateError('tracked OI differs from durable positions');
    }
    const preTrade=evaluateSimPreTrade(position,{
      executionMode:'SIMULATION_ONLY',chainId:config.chainId,
      verifyingContract:config.verifyingContract,market:config.market,
      collateralToken:config.collateralToken,account,balances:margin,
      realizedPnlBookedAtomic:'0'},
      {executionMode:'SIMULATION_ONLY',fillId:orderId,account,
        chainId:config.chainId,verifyingContract:config.verifyingContract,
        market:config.market,collateralToken:config.collateralToken,
        configRevision:config.revision,expectedVersion:position.version,
        side:order.side,priceAtomic:order.price,orderQuantityAtomic:order.quantity,
        simulatedFillQuantityAtomic:fill.toString(),reduceOnly:false},ctx);
    return Object.freeze({executionMode:'SIMULATION_ONLY',orderId,nonce:order.nonce,
      positionVersion:position.version,marketOiVersion:num(marker.version,'OI version'),
      oracleSequence:snapshot.sourceSequence,reservedInitialMarginAtomic:initialMargin,
      preTrade,executionAuthorized:false});
  });
}
