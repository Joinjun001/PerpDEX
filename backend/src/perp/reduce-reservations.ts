/** M5-T3-A. Durable SIMULATION_ONLY reduce-only capacity reservation lifecycle.
 * No M4 position updates, real fills, M3 balance movements, or actual trade admission.
 */
import {createHash} from 'node:crypto';
import {getAddress} from 'viem';
import type {SqlRunner} from '../orders/nonce-registry.ts';
import type {OrderTransactionManager} from '../orders/order-transactions.ts';
import {uint256,MAX_UINT256} from './fixed-point.ts';
import {validatePerpMarketConfig} from './market-config.ts';
import {validateMockPriceSnapshot} from './price-snapshot.ts';
import type {PerpPosition,PerpPositionContext} from './position-engine.ts';
import {readSimPerpPosition} from './position-ledger.ts';
import {getIsolatedMarginBalances} from './margin-ledger.ts';
import {evaluateSimPreTrade,type SimPreTradeRequest} from './pre-trade-risk.ts';
import {hashPerpMarketConfig} from './sim-order.ts';

export class SimReduceReservationError extends Error {
  constructor(message:string){super(message);this.name='SimReduceReservationError';}
}
export interface SimReduceOrderRequest {
  executionMode:'SIMULATION_ONLY';
  orderId:string;
  account:string;
  side:'BUY'|'SELL';
  priceAtomic:string;
  orderQuantityAtomic:string;
  expectedPositionVersion:number;
}
export interface SimReduceEventRequest {
  executionMode:'SIMULATION_ONLY';
  orderId:string;
  eventId:string;
  account:string;
  /** CONSUME means reservation-only dry run, not an executed position fill. */
  quantityAtomic?:string;
}
export interface SimReduceOrderView {
  orderId:string;status:'OPEN'|'CANCELLED'|'EXHAUSTED';
  requestedQuantityAtomic:string;remainingQuantityAtomic:string;
  consumedQuantityAtomic:string;cancelledQuantityAtomic:string;
  positionVersion:number;replayed:boolean;executionAuthorized:false;
}
const HEX=/^0x[0-9a-f]{64}$/;
const ZERO='0x0000000000000000000000000000000000000000';
function evm(value:unknown):string{
  if(typeof value!=='string')throw new SimReduceReservationError('missing account');
  try{const normalized=getAddress(value).toLowerCase();if(normalized===ZERO)throw Error();return normalized;}
  catch{throw new SimReduceReservationError('invalid/zero account');}
}
function eventId(s:unknown){if(typeof s!=='string'||!HEX.test(s))throw new SimReduceReservationError('noncanonical ID');return s;}
function digest(value:unknown){return '0x'+createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function safeQuantity(s:unknown){return uint256(s,'quantityAtomic',true);}
function asNumber(raw:unknown){const v=Number(raw);if(!Number.isSafeInteger(v)||v<0)throw new SimReduceReservationError('unsafe DB version');return v;}
function accountKey(ctx:PerpPositionContext,account:string){
  const config=validatePerpMarketConfig(ctx.config,ctx.domain,ctx.trustedSourceId,ctx.nowSeconds);
  validateMockPriceSnapshot(ctx.snapshot,config,ctx.domain,ctx.nowSeconds);
  return {config,key:[config.chainId,config.verifyingContract,config.market,config.collateralToken,evm(account)] as const};
}
function snapshotHash(ctx:PerpPositionContext){
  const s=ctx.snapshot;
  return digest([s.chainId,evm(s.verifyingContract),s.market,s.configRevision,
    s.sourceId,s.sourceSequence,s.indexPrice,s.markPrice,s.publishedAt,s.confidenceBps]);
}
type MarginRow={bucket:string;balance:string;version:number|string};
async function lockedMargin(db:SqlRunner,key:readonly unknown[],ctx:PerpPositionContext){
  const r=await db.query(`SELECT bucket,balance,version FROM perp_margin_balances
    WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4 AND account=$5
    ORDER BY bucket FOR SHARE`,key);
  const rows=r.rows as MarginRow[];
  // Absent buckets must NOT be mistaken for custody proof.
  if(rows.length!==3||rows.map(v=>v.bucket).sort().join(',')!=='AVAILABLE,POSITION,RESERVED'){
    throw new SimReduceReservationError('all 3 explicitly seeded margin buckets required');
  }
  const balances=await getIsolatedMarginBalances(db,ctx.domain,
    {market:ctx.config.market,collateralToken:ctx.config.collateralToken,account:String(key[4])});
  return {balances,hash:digest(rows.map(row=>[row.bucket,row.balance,asNumber(row.version)]))};
}
async function existingPositionLocked(db:SqlRunner,key:readonly unknown[],ctx:PerpPositionContext):Promise<Readonly<PerpPosition>>{
  const locked=await db.query(`SELECT version FROM perp_position_snapshots
    WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4 AND account=$5 FOR UPDATE`,key);
  if(locked.rows.length!==1)throw new SimReduceReservationError('persistent position required; no synthetic exposure');
  return readSimPerpPosition(db,String(key[4]),ctx);
}
async function lockGuard(db:SqlRunner,key:readonly unknown[]){
  await db.query(`INSERT INTO perp_reduce_guards
    (chain_id,verifying_contract,market,collateral_token,account)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,key);
  const r=await db.query(`SELECT position_version,position_size_atomic,config_revision,config_hash,
    consumed_qty_atomic FROM perp_reduce_guards
    WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4 AND account=$5 FOR UPDATE`,key);
  const row=r.rows[0] as {position_version:number|string|null;position_size_atomic:string|null;
    config_revision:number|string|null;config_hash:string|null;consumed_qty_atomic:string}|undefined;
  if(!row)throw new SimReduceReservationError('missing capacity guard');
  return row;
}
function abs(value:bigint){return value<0n?-value:value;}
async function ensureAnchored(db:SqlRunner,key:readonly unknown[],position:Readonly<PerpPosition>,
  hash:string,guard:Awaited<ReturnType<typeof lockGuard>>){
  const size=position.sizeSignedAtomic;
  if(guard.position_version===null){
    await db.query(`UPDATE perp_reduce_guards SET position_version=$6,position_size_atomic=$7,
      config_revision=$8,config_hash=$9 WHERE chain_id=$1 AND verifying_contract=$2
      AND market=$3 AND collateral_token=$4 AND account=$5`,
    [...key,position.version,size,position.configRevision,hash]);
    return;
  }
  if(asNumber(guard.position_version)!==position.version||
    guard.position_size_atomic!==size||guard.config_revision===null||
    asNumber(guard.config_revision)!==position.configRevision||guard.config_hash!==hash){
    throw new SimReduceReservationError('position or policy changed: explicit capacity reconciliation required');
  }
}
type OrderRow={order_id:string;side:'BUY'|'SELL';price_atomic:string;requested_qty_atomic:string;
  remaining_qty_atomic:string;consumed_qty_atomic:string;cancelled_qty_atomic:string;
  status:SimReduceOrderView['status'];position_version:number|string;config_revision:number|string;
  config_hash:string;snapshot_hash:string;margin_fingerprint:string};
async function orderById(db:SqlRunner,key:readonly unknown[],order:string){
  const r=await db.query(`SELECT order_id,side,price_atomic,requested_qty_atomic,
    remaining_qty_atomic,consumed_qty_atomic,cancelled_qty_atomic,status,position_version,
    config_revision,config_hash,snapshot_hash,margin_fingerprint FROM perp_reduce_orders
    WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4
      AND account=$5 AND order_id=$6`,[...key,order]);
  return r.rows[0] as OrderRow|undefined;
}
function view(r:OrderRow,replayed:boolean):Readonly<SimReduceOrderView>{
  return Object.freeze({orderId:r.order_id,status:r.status,
    requestedQuantityAtomic:r.requested_qty_atomic,remainingQuantityAtomic:r.remaining_qty_atomic,
    consumedQuantityAtomic:r.consumed_qty_atomic,cancelledQuantityAtomic:r.cancelled_qty_atomic,
    positionVersion:asNumber(r.position_version),replayed,executionAuthorized:false});
}
async function totalOpen(db:SqlRunner,key:readonly unknown[]){
  const r=await db.query(`SELECT remaining_qty_atomic FROM perp_reduce_orders
    WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4 AND account=$5
      AND status='OPEN'`,key);
  let sum=0n;for(const row of r.rows as Array<{remaining_qty_atomic:string}>){
    sum+=uint256(row.remaining_qty_atomic,'stored remaining');
    if(sum>MAX_UINT256)throw new SimReduceReservationError('reservation sum overflow');
  }
  return sum;
}
/** Reservation only: every concurrent writer must first own this account guard. */
export async function reserveSimReduceOnly(transactions:OrderTransactionManager,
  raw:SimReduceOrderRequest,ctx:PerpPositionContext):Promise<Readonly<SimReduceOrderView>>{
  if(!raw||raw.executionMode!=='SIMULATION_ONLY')throw new SimReduceReservationError('simulation-only required');
  const id=eventId(raw.orderId),{config,key}=accountKey(ctx,raw.account);
  const size=safeQuantity(raw.orderQuantityAtomic);
  const hash=hashPerpMarketConfig(config),snapshot=snapshotHash(ctx);
  if(!Number.isSafeInteger(raw.expectedPositionVersion)||raw.expectedPositionVersion<0){
    throw new SimReduceReservationError('invalid expected position version');
  }
  return transactions.withTransaction(async db=>{
    const guard=await lockGuard(db,key);
    const position=await existingPositionLocked(db,key,ctx);
    const {balances,hash:marginHash}=await lockedMargin(db,key,ctx);
    await ensureAnchored(db,key,position,hash,guard);
    const prev=await orderById(db,key,id);
    if(prev){
      if(prev.side!==raw.side||prev.price_atomic!==raw.priceAtomic||
         prev.requested_qty_atomic!==size.toString()||prev.position_version!=raw.expectedPositionVersion||
         prev.config_hash!==hash||prev.snapshot_hash!==snapshot||prev.margin_fingerprint!==marginHash){
        throw new SimReduceReservationError('order ID reused with changed inputs');
      }
      return view(prev,true);
    }
    const order:SimPreTradeRequest={executionMode:'SIMULATION_ONLY',fillId:id,
      account:String(key[4]),chainId:config.chainId,verifyingContract:config.verifyingContract,
      market:config.market,collateralToken:config.collateralToken,configRevision:config.revision,
      expectedVersion:raw.expectedPositionVersion,side:raw.side,priceAtomic:raw.priceAtomic,
      orderQuantityAtomic:size.toString(),simulatedFillQuantityAtomic:size.toString(),reduceOnly:true};
    const evaluation=evaluateSimPreTrade(position,{executionMode:'SIMULATION_ONLY',
      chainId:config.chainId,verifyingContract:config.verifyingContract,market:config.market,
      collateralToken:config.collateralToken,account:String(key[4]),balances,realizedPnlBookedAtomic:'0'},
    order,ctx);
    if(evaluation.decision!=='SIMULATION_ELIGIBLE'){
      throw new SimReduceReservationError(`reduce-only risk gate rejected: ${evaluation.reason}`);
    }
    const old=BigInt(position.sizeSignedAtomic),consumed=uint256(guard.consumed_qty_atomic,'consumed');
    const remaining=await totalOpen(db,key);
    if(remaining+consumed+size>abs(old)){
      throw new SimReduceReservationError('total outstanding and consumed reduce quota exceeds position');
    }
    await db.query(`INSERT INTO perp_reduce_orders (chain_id,verifying_contract,market,
      collateral_token,account,order_id,side,price_atomic,requested_qty_atomic,
      remaining_qty_atomic,position_version,config_revision,config_hash,snapshot_hash,margin_fingerprint)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [...key,id,raw.side,raw.priceAtomic,size.toString(),size.toString(),position.version,
      config.revision,hash,snapshot,marginHash]);
    return view((await orderById(db,key,id))!,false);
  });
}
/** Consumption only records a hypothetical fill and permanently uses quota. */
export async function consumeSimReduceReservation(transactions:OrderTransactionManager,
  raw:SimReduceEventRequest,ctx:PerpPositionContext):Promise<Readonly<SimReduceOrderView>>{
  return mutateReservation(transactions,raw,ctx,'CONSUME');
}
/** Cancellation only releases the unconsumed remainder; never releases used quota. */
export async function cancelSimReduceReservation(transactions:OrderTransactionManager,
  raw:SimReduceEventRequest,ctx:PerpPositionContext):Promise<Readonly<SimReduceOrderView>>{
  return mutateReservation(transactions,raw,ctx,'CANCEL');
}
async function mutateReservation(transactions:OrderTransactionManager,
  raw:SimReduceEventRequest,ctx:PerpPositionContext,action:'CONSUME'|'CANCEL'){
  if(!raw||raw.executionMode!=='SIMULATION_ONLY')throw new SimReduceReservationError('simulation-only required');
  const id=eventId(raw.orderId),eid=eventId(raw.eventId),{key,config}=accountKey(ctx,raw.account);
  if(action==='CANCEL'&&raw.quantityAtomic!==undefined){
    throw new SimReduceReservationError('cancel must not specify a fill quantity');
  }
  const quantity=action==='CONSUME'?safeQuantity(raw.quantityAtomic):null;
  if(quantity!==null&&quantity%BigInt(config.lotSize)!==0n){
    throw new SimReduceReservationError('simulated consumed quantity violates lot size');
  }
  return transactions.withTransaction(async db=>{
    const guard=await lockGuard(db,key);
    const position=await existingPositionLocked(db,key,ctx);
    const {hash:marginHash}=await lockedMargin(db,key,ctx);
    await ensureAnchored(db,key,position,hashPerpMarketConfig(config),guard);
    const order=await orderById(db,key,id);
    if(!order)throw new SimReduceReservationError('unknown reservation');
    const existing=await db.query(`SELECT order_id,action,quantity_atomic FROM perp_reduce_events
      WHERE chain_id=$1 AND verifying_contract=$2 AND account=$3 AND event_id=$4`,
      [key[0],key[1],key[4],eid]);
    const event=existing.rows[0] as {order_id:string;action:string;quantity_atomic:string}|undefined;
    if(event){
      if(event.order_id!==id||event.action!==action||
          action==='CONSUME'&&event.quantity_atomic!==quantity!.toString()){
        throw new SimReduceReservationError('event ID reused with different payload');
      }
      return view(order,true);
    }
    if(order.status!=='OPEN')throw new SimReduceReservationError('reservation is no longer open');
    if(action==='CONSUME'&&(order.snapshot_hash!==snapshotHash(ctx)||order.margin_fingerprint!==marginHash)){
      throw new SimReduceReservationError('oracle or margin changed: stale risk admission');
    }
    const available=uint256(order.remaining_qty_atomic,'remaining');
    const used=action==='CONSUME'?quantity!:available;
    if(used>available)throw new SimReduceReservationError('event exceeds remaining reserved quantity');
    const rem=available-used;
    const newConsumed=BigInt(order.consumed_qty_atomic)+(action==='CONSUME'?used:0n);
    const newCancelled=BigInt(order.cancelled_qty_atomic)+(action==='CANCEL'?used:0n);
    const status=action==='CANCEL'?'CANCELLED':rem===0n?'EXHAUSTED':'OPEN';
    await db.query(`UPDATE perp_reduce_orders SET remaining_qty_atomic=$7,
      consumed_qty_atomic=$8,cancelled_qty_atomic=$9,status=$10
      WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4
        AND account=$5 AND order_id=$6`,
    [...key,id,rem.toString(),newConsumed.toString(),newCancelled.toString(),status]);
    if(action==='CONSUME'){
      const total=uint256(guard.consumed_qty_atomic,'cumulative consumed')+used;
      if(total>abs(BigInt(position.sizeSignedAtomic))){
        throw new SimReduceReservationError('simulated consumption exceeds anchored exposure');
      }
      await db.query(`UPDATE perp_reduce_guards SET consumed_qty_atomic=$6,revision=revision+1
        WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4 AND account=$5`,
        [...key,total.toString()]);
    }
    await db.query(`INSERT INTO perp_reduce_events
      (chain_id,verifying_contract,account,event_id,order_id,market,collateral_token,action,
       quantity_atomic,remaining_after) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [key[0],key[1],key[4],eid,id,key[2],key[3],action,used.toString(),rem.toString()]);
    return view((await orderById(db,key,id))!,false);
  });
}

/** Acquire all capacity locks before either account position/margin read.
 * Call for each party in canonical account order under the market OI lock.
 */
export async function lockReservedReduceGuardForPair(db:SqlRunner,ctx:PerpPositionContext,account:string){
  const {key}=accountKey(ctx,account);
  await lockGuard(db,key);
}

/** M5-T3-B1 internal-only: called after MARKET row lock, accounts in sorted order.
 * Supports exactly one pristine OPEN reduce-only order per party (no partials).
 */
export async function checkReservedReduceForPair(db:SqlRunner,ctx:PerpPositionContext,
  account:string,orderId:string,side:'BUY'|'SELL',priceAtomic:string,
  quantityAtomic:string,expectedVersion:number):Promise<void>{
  const {config,key}=accountKey(ctx,account);
  const guard=await lockGuard(db,key);
  const position=await existingPositionLocked(db,key,ctx);
  const {balances,hash:marginHash}=await lockedMargin(db,key,ctx);
  await ensureAnchored(db,key,position,hashPerpMarketConfig(config),guard);
  const row=await orderById(db,key,eventId(orderId));
  if(!row||row.status!=='OPEN'||row.side!==side||
    row.price_atomic!==priceAtomic||row.remaining_qty_atomic!==quantityAtomic||
    row.requested_qty_atomic!==quantityAtomic||row.consumed_qty_atomic!=='0'||
    row.cancelled_qty_atomic!=='0'||guard.consumed_qty_atomic!=='0'||
    asNumber(row.position_version)!==expectedVersion||position.version!==expectedVersion||
    asNumber(row.config_revision)!==config.revision||
    row.config_hash!==hashPerpMarketConfig(config)||
    row.snapshot_hash!==snapshotHash(ctx)||row.margin_fingerprint!==marginHash){
    throw new SimReduceReservationError('stale, non-pristine or mismatched pair reservation');
  }
  if(await totalOpen(db,key)!==BigInt(quantityAtomic)){
    throw new SimReduceReservationError('multiple outstanding reservations require coordinated reconciliation');
  }
  const evalResult=evaluateSimPreTrade(position,{executionMode:'SIMULATION_ONLY',
    chainId:config.chainId,verifyingContract:config.verifyingContract,
    market:config.market,collateralToken:config.collateralToken,account:String(key[4]),
    balances,realizedPnlBookedAtomic:'0'},
    {executionMode:'SIMULATION_ONLY',fillId:eventId(orderId),account:String(key[4]),
      chainId:config.chainId,verifyingContract:config.verifyingContract,
      market:config.market,collateralToken:config.collateralToken,
      configRevision:config.revision,expectedVersion,side,priceAtomic,
      orderQuantityAtomic:quantityAtomic,simulatedFillQuantityAtomic:quantityAtomic,reduceOnly:true},ctx);
  if(evalResult.decision!=='SIMULATION_ELIGIBLE'||
     !['CLOSE','REDUCE'].includes(evalResult.effect??'')){
    throw new SimReduceReservationError('post-fill reduce-only gate rejected');
  }
}

/** Caller holds market and both account guards in one TX; M4 journals already
 * applied before calling. Reanchor to the newly persisted size, NOT shadow quota.
 */
export async function finalizeReservedReduceForPair(db:SqlRunner,ctx:PerpPositionContext,
  account:string,orderId:string,fillId:string,quantityAtomic:string,
  nextSize:string,nextVersion:number):Promise<void>{
  const {key,config}=accountKey(ctx,account);
  const oid=eventId(orderId),fid=eventId(fillId);
  const order=await db.query(`UPDATE perp_reduce_orders SET remaining_qty_atomic='0',
    consumed_qty_atomic=$7,status='EXHAUSTED'
    WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4
      AND account=$5 AND order_id=$6 AND remaining_qty_atomic=$7
      AND consumed_qty_atomic='0' AND cancelled_qty_atomic='0' AND status='OPEN'
    RETURNING order_id`,[...key,oid,quantityAtomic]);
  if(order.rows.length!==1)throw new SimReduceReservationError('reserved consumption CAS failed');
  const evt=await db.query(`INSERT INTO perp_reduce_events
    (chain_id,verifying_contract,account,event_id,order_id,market,collateral_token,
      action,quantity_atomic,remaining_after)
    VALUES($1,$2,$3,$4,$5,$6,$7,'CONSUME',$8,'0') RETURNING event_id`,
    [key[0],key[1],key[4],fid,oid,key[2],key[3],quantityAtomic]);
  if(evt.rows.length!==1)throw new SimReduceReservationError('missing fill-bound receipt');
  const updated=await db.query(`UPDATE perp_reduce_guards SET position_version=$6,
    position_size_atomic=$7,consumed_qty_atomic='0',revision=revision+1
    WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4
      AND account=$5 AND config_revision=$8 AND config_hash=$9 RETURNING revision`,
    [...key,nextVersion,nextSize,config.revision,hashPerpMarketConfig(config)]);
  if(updated.rows.length!==1)throw new SimReduceReservationError('post-fill capacity anchor CAS failed');
}

/** M5-T3-B2: locked, trusted account snapshot for one partial paired reduction.
 * The market lock and BOTH account guards must already be held, in that order.
 * Rejects unreconciled shadow CONSUME events, old quote bindings, and other
 * open orders whose risk cannot be reevaluated against this version.
 */
export async function checkPartialReservedReduceForPair(db:SqlRunner,ctx:PerpPositionContext,
  account:string,orderId:string,side:'BUY'|'SELL',priceAtomic:string,
  quantityAtomic:string,expectedVersion:number):Promise<void>{
  const {config,key}=accountKey(ctx,account);
  const guard=await lockGuard(db,key);
  const position=await existingPositionLocked(db,key,ctx);
  const {balances,hash:marginHash}=await lockedMargin(db,key,ctx);
  await ensureAnchored(db,key,position,hashPerpMarketConfig(config),guard);
  if(guard.consumed_qty_atomic!=='0'){
    throw new SimReduceReservationError('unreconciled shadow consumption prevents paired execution');
  }
  const open=await getOpenPairOrders(db,key);
  const order=open.find(row=>row.order_id===eventId(orderId));
  const qty=safeQuantity(quantityAtomic);
  if(!order||order.side!==side||order.price_atomic!==priceAtomic||
     asNumber(order.position_version)!==expectedVersion||position.version!==expectedVersion||
     qty>uint256(order.remaining_qty_atomic,'remaining')||
     qty%BigInt(config.lotSize)!==0n){
    throw new SimReduceReservationError('missing/stale/insufficient partial order reservation');
  }
  if(await totalOpen(db,key)>abs(BigInt(position.sizeSignedAtomic))){
    throw new SimReduceReservationError('outstanding reserve exceeds position');
  }
  for(const current of open){
    await validatePairedOrder(db,ctx,key,config,current,position,balances,marginHash);
  }
  // Check the specific proposed partial fill, not the entire outstanding order.
  const result=evaluateSimPreTrade(position,riskMargin(key,balances),{
    ...riskRequest(key,config,order,position.version),fillId:eventId(orderId),
    orderQuantityAtomic:order.remaining_qty_atomic,
    simulatedFillQuantityAtomic:qty.toString(),
  },ctx);
  if(result.decision!=='SIMULATION_ELIGIBLE'||
      result.candidate?.closedQuantityAtomic!==qty.toString()||
      result.candidate.openedQuantityAtomic!=='0'){
    throw new SimReduceReservationError('partial paired risk or actual reduction rejected');
  }
}

async function getOpenPairOrders(db:SqlRunner,key:readonly unknown[]):Promise<OrderRow[]>{
  const found=await db.query(`SELECT order_id,side,price_atomic,requested_qty_atomic,
    remaining_qty_atomic,consumed_qty_atomic,cancelled_qty_atomic,status,position_version,
    config_revision,config_hash,snapshot_hash,margin_fingerprint
    FROM perp_reduce_orders WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3
      AND collateral_token=$4 AND account=$5 AND status='OPEN' ORDER BY order_id FOR UPDATE`,key);
  return found.rows as OrderRow[];
}
function riskMargin(key:readonly unknown[],balances:Awaited<ReturnType<typeof lockedMargin>>['balances']){
  return {executionMode:'SIMULATION_ONLY' as const,chainId:Number(key[0]),
    verifyingContract:String(key[1]),market:String(key[2]),collateralToken:String(key[3]),
    account:String(key[4]),balances,realizedPnlBookedAtomic:'0' as const};
}
function riskRequest(key:readonly unknown[],config:PerpPositionContext['config'],
  order:OrderRow,version:number):SimPreTradeRequest{
  return {executionMode:'SIMULATION_ONLY',fillId:order.order_id,account:String(key[4]),
    chainId:Number(key[0]),verifyingContract:String(key[1]),market:String(key[2]),
    collateralToken:String(key[3]),configRevision:config.revision,expectedVersion:version,
    side:order.side,priceAtomic:order.price_atomic,orderQuantityAtomic:order.remaining_qty_atomic,
    simulatedFillQuantityAtomic:order.remaining_qty_atomic,reduceOnly:true};
}
/** A previously consumed order is safe only if every consumption event is
 * provably paired to a durable M4 fill where this account was a participant.
 * Never promote the A-stage shadow CONSUME to an actual position fill. */
async function verifiedPairedConsumption(db:SqlRunner,key:readonly unknown[],order:OrderRow):Promise<void>{
  const consumed=uint256(order.consumed_qty_atomic,'consumed');
  const history=await db.query(`SELECT e.event_id,e.quantity_atomic,p.quantity_atomic AS paired_quantity,
    p.buyer_account,p.seller_account,p.market AS paired_market,
    p.collateral_token AS paired_collateral FROM perp_reduce_events e
    LEFT JOIN perp_sim_paired_fills p ON e.chain_id=p.chain_id
      AND e.verifying_contract=p.verifying_contract AND e.event_id=p.fill_id
    WHERE e.chain_id=$1 AND e.verifying_contract=$2 AND e.account=$3
      AND e.order_id=$4 AND e.action='CONSUME'`,[key[0],key[1],key[4],order.order_id]);
  let proven=0n;
  for(const h of history.rows as Array<{event_id:string;quantity_atomic:string;paired_quantity:string|null;
    buyer_account:string|null;seller_account:string|null;paired_market:string|null;paired_collateral:string|null}>){
    if(h.paired_quantity!==h.quantity_atomic||
       (h.buyer_account!==key[4]&&h.seller_account!==key[4])||
       h.paired_market!==key[2]||h.paired_collateral!==key[3]){
      throw new SimReduceReservationError('unpaired shadow consumption in reservation history');
    }
    proven+=uint256(h.quantity_atomic,'historic consumption');
  }
  if(proven!==consumed){
    throw new SimReduceReservationError('reserved consumption journal inconsistent');
  }
}
async function validatePairedOrder(db:SqlRunner,ctx:PerpPositionContext,key:readonly unknown[],
  config:PerpPositionContext['config'],order:OrderRow,position:Readonly<PerpPosition>,
  balances:Awaited<ReturnType<typeof lockedMargin>>['balances'],marginHash:string){
  if(order.status!=='OPEN'||asNumber(order.position_version)!==position.version||
     asNumber(order.config_revision)!==config.revision||
     order.config_hash!==hashPerpMarketConfig(config)||
     order.snapshot_hash!==snapshotHash(ctx)||order.margin_fingerprint!==marginHash||
     order.cancelled_qty_atomic!=='0'){
    throw new SimReduceReservationError('stale outstanding order policy/oracle/margin/position');
  }
  await verifiedPairedConsumption(db,key,order);
  const candidate=evaluateSimPreTrade(position,riskMargin(key,balances),
    riskRequest(key,config,order,position.version),ctx);
  if(candidate.decision!=='SIMULATION_ELIGIBLE'){
    throw new SimReduceReservationError(`outstanding reduce-only risk invalid: ${candidate.reason}`);
  }
}

/** Reconcile BOTH true M4 position changes and ALL still-open reservations.
 * Called only after paired journal & OI update in the SAME market-locked TX.
 */
export async function finalizePartialReservedReduceForPair(db:SqlRunner,
  ctx:PerpPositionContext,account:string,orderId:string,fillId:string,
  quantityAtomic:string,nextSize:string,nextVersion:number):Promise<void>{
  const {key,config}=accountKey(ctx,account);
  const guard=await lockGuard(db,key);
  if(guard.consumed_qty_atomic!=='0'){
    throw new SimReduceReservationError('unexpected shadow quota in paired finalization');
  }
  const oid=eventId(orderId),fid=eventId(fillId);
  const before=await getOpenPairOrders(db,key);
  const selected=before.find(v=>v.order_id===oid);
  const qty=safeQuantity(quantityAtomic);
  if(!selected||qty>uint256(selected.remaining_qty_atomic,'remaining')){
    throw new SimReduceReservationError('missing or insufficient reserved fill capacity');
  }
  const remaining=BigInt(selected.remaining_qty_atomic)-qty;
  const updated=await db.query(`UPDATE perp_reduce_orders SET remaining_qty_atomic=$7,
    consumed_qty_atomic=(consumed_qty_atomic::numeric+$8::numeric)::text,
    status=$9 WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3
      AND collateral_token=$4 AND account=$5 AND order_id=$6 AND status='OPEN'
      AND remaining_qty_atomic=$10 RETURNING order_id`,
    [...key,oid,remaining.toString(),qty.toString(),remaining===0n?'EXHAUSTED':'OPEN',selected.remaining_qty_atomic]);
  if(updated.rows.length!==1)throw new SimReduceReservationError('partial order CAS failure');
  await db.query(`INSERT INTO perp_reduce_events
    (chain_id,verifying_contract,account,event_id,order_id,market,collateral_token,
     action,quantity_atomic,remaining_after) VALUES($1,$2,$3,$4,$5,$6,$7,'CONSUME',$8,$9)`,
    [key[0],key[1],key[4],fid,oid,key[2],key[3],qty.toString(),remaining.toString()]);
  const fresh=await existingPositionLocked(db,key,ctx);
  if(fresh.version!==nextVersion||fresh.sizeSignedAtomic!==nextSize){
    throw new SimReduceReservationError('post-fill position snapshot/version mismatch');
  }
  const {balances,hash:marginHash}=await lockedMargin(db,key,ctx);
  const open=await getOpenPairOrders(db,key);
  let outstanding=0n;
  for(const order of open){outstanding+=uint256(order.remaining_qty_atomic,'remaining');}
  if(outstanding>abs(BigInt(nextSize))){
    throw new SimReduceReservationError('remaining reserved quantities exceed new position');
  }
  // Revalidate all surviving orders on the NEW position version; keep same
  // trusted oracle/margin fingerprint and conservative price for each order.
  for(const order of open){
    if(order.snapshot_hash!==snapshotHash(ctx)||order.margin_fingerprint!==marginHash||
       asNumber(order.config_revision)!==config.revision||
       order.config_hash!==hashPerpMarketConfig(config)){
      throw new SimReduceReservationError('outstanding quote changed during clearing');
    }
    await verifiedPairedConsumption(db,key,order);
    const check=evaluateSimPreTrade(fresh,riskMargin(key,balances),
      riskRequest(key,config,order,nextVersion),ctx);
    if(check.decision!=='SIMULATION_ELIGIBLE'){
      throw new SimReduceReservationError('remaining order fails post-fill risk gate');
    }
  }
  // Orders that are now EXHAUSTED keep their historical position version.
  if(open.length){
    await db.query(`UPDATE perp_reduce_orders SET position_version=$6
      WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3
        AND collateral_token=$4 AND account=$5 AND status='OPEN'`,[...key,nextVersion]);
  }
  const g=await db.query(`UPDATE perp_reduce_guards SET position_size_atomic=$6,
    position_version=$7,consumed_qty_atomic='0',revision=revision+1
    WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3
      AND collateral_token=$4 AND account=$5 AND config_revision=$8
      AND config_hash=$9 RETURNING revision`,
    [...key,nextSize,nextVersion,config.revision,hashPerpMarketConfig(config)]);
  if(g.rows.length!==1)throw new SimReduceReservationError('post-fill quota reanchor failure');
}
