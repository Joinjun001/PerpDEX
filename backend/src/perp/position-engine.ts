/**
 * SIMULATION_ONLY linear perpetual position math.
 * Does not mutate balances, accept public orders, match trades or send transactions.
 * All cost-basis and realized PnL numerators are in baseAtomic * priceAtomic units;
 * only reporting converts to collateralAtomic with truncation toward zero.
 */
import {getAddress} from 'viem';
import type {OrderSigningDomainInput} from '../orders/signature.ts';
import {validatePerpMarketConfig,type PerpMarketConfig} from './market-config.ts';
import {validateMockPriceSnapshot,type PerpPriceSnapshot} from './price-snapshot.ts';
import {
  decimalScale,int256,MAX_INT256,MAX_UINT256,MIN_INT256,uint256,
} from './fixed-point.ts';

export class PerpPositionError extends Error {
  constructor(message:string){super(message);this.name='PerpPositionError';}
}

export interface PerpPositionContext {
  domain:OrderSigningDomainInput;
  config:PerpMarketConfig;
  trustedSourceId:string;
  snapshot:PerpPriceSnapshot;
  nowSeconds:number;
}
export interface PositionScope {
  chainId:number;
  verifyingContract:string;
  market:string;
  collateralToken:string;
  account:string;
  configRevision:number;
}
export interface PerpPosition extends PositionScope {
  /** Positive for LONG and negative for SHORT, in base atomic units. */
  sizeSignedAtomic:string;
  /** Nonnegative and EXACT, baseAtomic * entry priceAtomic, NOT rounded collateral. */
  openCostNumerator:string;
  /** Signed cumulative realized PnL in baseAtomic * priceAtomic units. */
  realizedPnlNumerator:string;
  /** Version is an optimistic in-memory fence; persistent replay defense belongs to M4-T2. */
  version:number;
  lastFillId:string|null;
}
export interface PerpPositionFill {
  fillId:string;
  side:'BUY'|'SELL';
  priceAtomic:string;
  quantityAtomic:string;
  /** Binding must match the position account and validated trusted context. */
  account:string;
  market:string;
  collateralToken:string;
  chainId:number;
  verifyingContract:string;
  configRevision:number;
  expectedVersion:number;
  executionMode:'SIMULATION_ONLY';
}
export interface PerpMarkResult {
  sizeSignedAtomic:string;
  side:'LONG'|'SHORT'|'FLAT';
  /** Truncated, informational only; never used for PnL calculations. */
  averageEntryPriceFloorAtomic:string;
  /** Fractional price numerator remainder modulo abs(size). */
  averageEntryPriceRemainder:string;
  positionNotionalAtomic:string;
  unrealizedPnlAtomic:string;
  realizedPnlAtomic:string;
}
export interface PerpPositionTransition {
  position:Readonly<PerpPosition>;
  closedQuantityAtomic:string;
  openedQuantityAtomic:string;
  /** Difference of cumulative rounded PnL, preserving dust across fills. */
  realizedDeltaAtomic:string;
  mark:Readonly<PerpMarkResult>;
}
const FILL_ID=/^0x[0-9a-f]{64}$/;
const ZERO='0x0000000000000000000000000000000000000000';
function verifiedAddress(value:unknown,label:string):string {
  if(typeof value!=='string')throw new PerpPositionError(`${label}: missing address`);
  try{const checked=getAddress(value).toLowerCase();if(checked===ZERO)throw Error();return checked;}
  catch{throw new PerpPositionError(`${label}: invalid/zero address`);}
}
function checkedInteger(value:unknown,label:string,min:number,max=Number.MAX_SAFE_INTEGER):number {
  if(!Number.isSafeInteger(value)||(value as number)<min||(value as number)>max){
    throw new PerpPositionError(`${label}: invalid version or timestamp`);
  }
  return value as number;
}
function checkedSigned(value:bigint,label:string):bigint{
  if(value<MIN_INT256||value>MAX_INT256)throw new PerpPositionError(`${label}: int256 overflow`);
  return value;
}
function checkedUnsigned(value:bigint,label:string):bigint{
  if(value<0n||value>MAX_UINT256)throw new PerpPositionError(`${label}: uint256 overflow`);
  return value;
}
function abs(value:bigint):bigint{return value<0n?-value:value;}
function sign(value:bigint):bigint{return value<0n?-1n:value>0n?1n:0n;}
function pnlAtomic(numerator:bigint,config:Readonly<PerpMarketConfig>):bigint{
  // JavaScript BigInt division truncates toward zero, including negative amounts.
  const quote= numerator * decimalScale(config.collateralDecimals) /
    (decimalScale(config.baseDecimals)*decimalScale(config.priceDecimals));
  return checkedSigned(quote,'collateral PnL');
}
function ensureCompatible(scope:PositionScope,config:Readonly<PerpMarketConfig>,rawAccount:unknown):string {
  const account=verifiedAddress(rawAccount,'account');
  if(scope.chainId!==config.chainId||
    verifiedAddress(scope.verifyingContract,'verifyingContract')!==config.verifyingContract||
    scope.market!==config.market||
    verifiedAddress(scope.collateralToken,'collateralToken')!==config.collateralToken||
    verifiedAddress(scope.account,'scope.account')!==account||scope.configRevision!==config.revision){
    throw new PerpPositionError('position/fill identity or policy revision mismatch');
  }
  return account;
}
function trustedContext(context:PerpPositionContext){
  if(!context||typeof context!=='object')throw new PerpPositionError('trusted context required');
  const config=validatePerpMarketConfig(context.config,context.domain,context.trustedSourceId,context.nowSeconds);
  const oracle=validateMockPriceSnapshot(context.snapshot,config,context.domain,context.nowSeconds);
  return {config,oracle};
}

/** All-zero position factory: no deposit, PnL, funding or trading action. */
export function createEmptyPosition(account:string,context:PerpPositionContext):Readonly<PerpPosition>{
  const {config}=trustedContext(context);
  return Object.freeze({chainId:config.chainId,verifyingContract:config.verifyingContract,
    market:config.market,collateralToken:config.collateralToken,account:verifiedAddress(account,'account'),
    configRevision:config.revision,sizeSignedAtomic:'0',openCostNumerator:'0',
    realizedPnlNumerator:'0',version:0,lastFillId:null});
}
function parsedPosition(position:Readonly<PerpPosition>,config:Readonly<PerpMarketConfig>){
  if(!position||typeof position!=='object')throw new PerpPositionError('position required');
  ensureCompatible(position,config,position.account);
  checkedInteger(position.version,'position.version',0,Number.MAX_SAFE_INTEGER-1);
  if(position.lastFillId!==null &&
    (typeof position.lastFillId!=='string'||!FILL_ID.test(position.lastFillId))){
    throw new PerpPositionError('position last fill ID invalid');
  }
  if(position.version===0 && position.lastFillId!==null ||
     position.version>0 && position.lastFillId===null){
    throw new PerpPositionError('position version/fill integrity mismatch');
  }
  const qty=int256(position.sizeSignedAtomic,'sizeSignedAtomic');
  const cost=uint256(position.openCostNumerator,'openCostNumerator');
  const pnl=int256(position.realizedPnlNumerator,'realizedPnlNumerator');
  if((qty===0n)!==(cost===0n))throw new PerpPositionError('flat position must have zero cost');
  if(abs(qty)>BigInt(config.maxOpenInterest))throw new PerpPositionError('position size exceeds OI limit');
  return {qty,cost,pnl};
}

function markValidated(position:Readonly<PerpPosition>,config:Readonly<PerpMarketConfig>,markPrice:bigint):Readonly<PerpMarkResult>{
  const {qty,cost,pnl}=parsedPosition(position,config);
  const size=abs(qty);
  const value=checkedUnsigned(markPrice*size,'mark position notional numerator');
  const unrealized=qty===0n?0n:checkedSigned(sign(qty)*(value-cost),'unrealized pnl numerator');
  const denominator=decimalScale(config.baseDecimals)*decimalScale(config.priceDecimals);
  const notional=checkedUnsigned(value*decimalScale(config.collateralDecimals)/denominator,'mark notional');
  const report:PerpMarkResult={
    sizeSignedAtomic:qty.toString(),side:qty>0n?'LONG':qty<0n?'SHORT':'FLAT',
    averageEntryPriceFloorAtomic:(size===0n?0n:cost/size).toString(),
    averageEntryPriceRemainder:(size===0n?0n:cost%size).toString(),
    positionNotionalAtomic:notional.toString(),
    unrealizedPnlAtomic:pnlAtomic(unrealized,config).toString(),
    realizedPnlAtomic:pnlAtomic(pnl,config).toString(),
  };
  return Object.freeze(report);
}
/** Refuses untrusted market, stale mark and policy/domain mismatches. */
export function markPerpPosition(position:Readonly<PerpPosition>,context:PerpPositionContext):Readonly<PerpMarkResult>{
  const {config,oracle}=trustedContext(context);
  return markValidated(position,config,uint256(oracle.markPrice,'markPrice',true));
}

/**
 * One-way, pure isolated linear-perp transition; only mock executions are supported.
 * An immutable OPEN cost numerator is allocated pro rata with floor on reduction;
 * ALL rounding remainder stays with the surviving open position and therefore
 * the final close realizes the full entry cost exactly. A displayed floored
 * average price is never used to compute realized or unrealized PnL.
 *
 * Does NOT guarantee global exactly-once execution, collateral backing, leverage,
 * liquidation safety or settled PnL. Version and lastFillId only guard local replay;
 * M4-T2 must implement unique persistent fill IDs + atomic position journal.
 */
export function applyPerpPositionFill(
  previous:Readonly<PerpPosition>,fill:PerpPositionFill,context:PerpPositionContext,
):Readonly<PerpPositionTransition>{
  const {config,oracle}=trustedContext(context);
  const {qty:oldQty,cost:oldCost,pnl:oldRealized}=parsedPosition(previous,config);
  if(!fill||typeof fill!=='object'||fill.executionMode!=='SIMULATION_ONLY'||
    typeof fill.fillId!=='string'||!FILL_ID.test(fill.fillId)){
    throw new PerpPositionError('valid simulation-only fill ID required');
  }
  ensureCompatible(fill,config,fill.account);
  if(verifiedAddress(fill.account,'fill.account')!==previous.account)throw new PerpPositionError('cross-account fill');
  if(fill.expectedVersion!==previous.version||previous.lastFillId===fill.fillId){
    throw new PerpPositionError('stale version or immediate fill replay');
  }
  if(fill.side!=='BUY'&&fill.side!=='SELL')throw new PerpPositionError('invalid side');
  const execute=uint256(fill.priceAtomic,'priceAtomic',true);
  const quantity=uint256(fill.quantityAtomic,'quantityAtomic',true);
  const tick=BigInt(config.tickSize),lot=BigInt(config.lotSize);
  if(execute%tick!==0n||quantity%lot!==0n||quantity>BigInt(config.maxQuantity)){
    throw new PerpPositionError('price tick, lot or fill size invalid');
  }
  // No trusted execution price outside the mark deviation policy.
  const mark=uint256(oracle.markPrice,'markPrice',true);
  if(abs(execute-mark)*10000n>mark*BigInt(config.maxPriceDeviationBps)){
    throw new PerpPositionError('fill price outside trusted mark band');
  }
  const side=fill.side==='BUY'?1n:-1n;
  const signedFill=quantity*side;
  const nextQty=checkedSigned(oldQty+signedFill,'new position size');
  if(abs(nextQty)>BigInt(config.maxOpenInterest))throw new PerpPositionError('position exceeds OI limit');
  const executeValue=checkedUnsigned(quantity*execute,'fill cost numerator');
  let newCost:bigint,realizedDelta=0n,closed=0n,opened=0n;
  if(oldQty===0n||sign(oldQty)===side){
    opened=quantity;
    newCost=checkedUnsigned(oldCost+executeValue,'added cost numerator');
  }else{
    closed=abs(oldQty)<quantity?abs(oldQty):quantity;
    // Integer truncation remainder is carried forward, including on partial closes.
    const allocatedCost=oldCost*closed/abs(oldQty);
    const closedValue=checkedUnsigned(execute*closed,'close value');
    realizedDelta=checkedSigned(sign(oldQty)*(closedValue-allocatedCost),'realized pnl delta');
    const leftover=quantity-closed;
    opened=leftover;
    const survivingCost=oldCost-allocatedCost;
    newCost=checkedUnsigned(survivingCost+leftover*execute,'new cost basis numerator');
  }
  if(nextQty===0n && newCost!==0n || nextQty!==0n && newCost===0n){
    throw new PerpPositionError('position flattening/cost invariant');
  }
  const totalRealized=checkedSigned(oldRealized+realizedDelta,'cumulative realized pnl');
  const next:Readonly<PerpPosition>=Object.freeze({...previous,
    sizeSignedAtomic:nextQty.toString(),openCostNumerator:newCost.toString(),
    realizedPnlNumerator:totalRealized.toString(),version:previous.version+1,
    lastFillId:fill.fillId});
  // Realized delta must be computed from the cumulative rounded value, not
  // rounded per fill (otherwise many tiny fills lose or fabricate PnL dust).
  const roundedDelta=pnlAtomic(totalRealized,config)-pnlAtomic(oldRealized,config);
  return Object.freeze({position:next,closedQuantityAtomic:closed.toString(),
    openedQuantityAtomic:opened.toString(),realizedDeltaAtomic:roundedDelta.toString(),
    mark:markValidated(next,config,mark)});
}
