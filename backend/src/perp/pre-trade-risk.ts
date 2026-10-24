/**
 * M5-T2: PURE simulation-only pre-trade guard. This is NOT an order admission,
 * authorization, asset movement, margin reservation, or persistent fill action.
 * All evaluations use one caller-owned trusted market/oracle snapshot.
 */
import {getAddress} from 'viem';
import {uint256} from './fixed-point.ts';
import {validatePerpMarketConfig} from './market-config.ts';
import {validateMockPriceSnapshot} from './price-snapshot.ts';
import {applyPerpPositionFill, type PerpPosition, type PerpPositionContext,
  type PerpPositionFill, type PerpPositionTransition} from './position-engine.ts';
import {evaluateSimIsolatedPerpRisk, type SimIsolatedMarginRiskInput,
  type SimPerpRiskReport} from './risk-engine.ts';

export class SimPreTradeError extends Error {
  constructor(message:string){super(message);this.name='SimPreTradeError';}
}
export type SimPreTradeDecision='SIMULATION_ELIGIBLE'|'REJECTED';
export type SimPreTradeReason='NONE'|'REDUCE_ONLY_FLAT'|'REDUCE_ONLY_DIRECTION'|
  'REDUCE_ONLY_OVERSIZE'|'POSITION_REVERSAL'|'EXISTING_RISK_BREACH'|
  'POST_TRADE_MARGIN_SHORTFALL'|'POST_TRADE_LEVERAGE_LIMIT'|
  'REDUCTION_WORSENS_RISK';
export type SimPositionEffect='INCREASE'|'REDUCE'|'CLOSE'|'REVERSE';
/** Both requested order quantity and tentative partial-fill quantity are validated. */
export interface SimPreTradeRequest {
  executionMode:'SIMULATION_ONLY';
  fillId:string;
  account:string;
  chainId:number;
  verifyingContract:string;
  market:string;
  collateralToken:string;
  configRevision:number;
  expectedVersion:number;
  side:'BUY'|'SELL';
  priceAtomic:string;
  /** Total proposed order quantity: reduce-only must bound THIS, not just one fill. */
  orderQuantityAtomic:string;
  /** The quantity hypothetically executed in this evaluation; <= order quantity. */
  simulatedFillQuantityAtomic:string;
  reduceOnly:boolean;
}
export interface SimPreTradeReport {
  executionMode:'SIMULATION_ONLY';
  decision:SimPreTradeDecision;
  reason:SimPreTradeReason;
  effect:SimPositionEffect|null;
  reduceOnly:boolean;
  orderQuantityAtomic:string;
  simulatedFillQuantityAtomic:string;
  remainingOrderQuantityAtomic:string;
  /** Current persisted position is never mutated. */
  before:Readonly<SimPerpRiskReport>;
  /** Optional candidate state only, NEVER a committed fill or execution approval. */
  candidate:Readonly<PerpPositionTransition>|null;
  after:Readonly<SimPerpRiskReport>|null;
  executionAuthorized:false;
}
const HEX=/^0x[0-9a-f]{64}$/;
const ZERO='0x0000000000000000000000000000000000000000';
function address(raw:unknown,label:string):string {
  if(typeof raw!=='string')throw new SimPreTradeError(`${label}: missing EVM address`);
  try{const v=getAddress(raw).toLowerCase();if(v===ZERO)throw Error();return v;}
  catch{throw new SimPreTradeError(`${label}: invalid EVM address`);}
}
const abs=(n:bigint)=>n<0n?-n:n;
/**
 * Risk-increasing fill: BOTH the prior and the candidate position must be
 * healthy. A reduction can still be simulated with an already distressed
 * account, provided it cannot increase gross exposure or worsen equity.
 */
export function evaluateSimPreTrade(
  current:Readonly<PerpPosition>, margin:Readonly<SimIsolatedMarginRiskInput>,
  request:Readonly<SimPreTradeRequest>, context:PerpPositionContext,
):Readonly<SimPreTradeReport>{
  if(!request||request.executionMode!=='SIMULATION_ONLY'||
     typeof request.fillId!=='string'||!HEX.test(request.fillId)||
     typeof request.reduceOnly!=='boolean'||
     !Number.isSafeInteger(request.expectedVersion)||request.expectedVersion<0||
     (request.side!=='BUY'&&request.side!=='SELL')){
    throw new SimPreTradeError('invalid simulation-only request');
  }
  const config=validatePerpMarketConfig(context.config,context.domain,
    context.trustedSourceId,context.nowSeconds);
  validateMockPriceSnapshot(context.snapshot,config,context.domain,context.nowSeconds);
  // Before risk check performs full position/M3 ledger scope verification.
  const before=evaluateSimIsolatedPerpRisk(current,margin,context);
  if(address(request.account,'account')!==address(current.account,'position.account')||
     request.chainId!==config.chainId||
     address(request.verifyingContract,'verifyingContract')!==config.verifyingContract||
     request.market!==config.market||
     address(request.collateralToken,'collateralToken')!==config.collateralToken||
     request.configRevision!==config.revision||request.expectedVersion!==current.version){
    throw new SimPreTradeError('order/position scope or version mismatch');
  }
  const order=uint256(request.orderQuantityAtomic,'orderQuantityAtomic',true);
  const simulated=uint256(request.simulatedFillQuantityAtomic,'simulatedFillQuantityAtomic',true);
  const price=uint256(request.priceAtomic,'priceAtomic',true);
  const tick=BigInt(config.tickSize),lot=BigInt(config.lotSize);
  if(order<BigInt(config.minQuantity)||order>BigInt(config.maxQuantity)||
     order%lot!==0n||simulated>order||simulated%lot!==0n||price%tick!==0n){
    throw new SimPreTradeError('order/fill quantity or price violates market policy');
  }
  const existing=BigInt(current.sizeSignedAtomic);
  const signedFill=request.side==='BUY'?simulated:-simulated;
  const afterQty=existing+signedFill;
  const reducing=existing!==0n&&
    ((existing>0n&&signedFill<0n)||(existing<0n&&signedFill>0n));
  const effect:SimPositionEffect=reducing?
    (abs(signedFill)>abs(existing)?'REVERSE':
      abs(signedFill)===abs(existing)?'CLOSE':'REDUCE'):'INCREASE';
  const remaining=order-simulated;
  const result=(decision:SimPreTradeDecision,reason:SimPreTradeReason,
    transition:Readonly<PerpPositionTransition>|null=null,
    after:Readonly<SimPerpRiskReport>|null=null):Readonly<SimPreTradeReport>=>
    Object.freeze({executionMode:'SIMULATION_ONLY' as const,decision,reason,effect,
      reduceOnly:request.reduceOnly,orderQuantityAtomic:order.toString(),
      simulatedFillQuantityAtomic:simulated.toString(),remainingOrderQuantityAtomic:remaining.toString(),
      before,candidate:transition,after,executionAuthorized:false as const});
  // Validate reduce-only against entire requested quantity: otherwise a partial
  // fill could pass and an independently matched remaining fill could reverse.
  if(request.reduceOnly){
    if(existing===0n)return result('REJECTED','REDUCE_ONLY_FLAT');
    if(!reducing)return result('REJECTED','REDUCE_ONLY_DIRECTION');
    if(order>abs(existing))return result('REJECTED','REDUCE_ONLY_OVERSIZE');
  }
  // Position reversal is not a safe "reduce" and must be separately designed;
  // even non-reduce-only orders cannot implicitly flip across zero in M5-T2.
  if(effect==='REVERSE'||(reducing&&order>abs(existing)))return result('REJECTED','POSITION_REVERSAL');
  const fill:PerpPositionFill={fillId:request.fillId,side:request.side,
    priceAtomic:price.toString(),quantityAtomic:simulated.toString(),account:current.account,
    chainId:config.chainId,verifyingContract:config.verifyingContract,
    market:config.market,collateralToken:config.collateralToken,
    configRevision:config.revision,expectedVersion:current.version,
    executionMode:'SIMULATION_ONLY'};
  const candidate=applyPerpPositionFill(current,fill,context);
  if(candidate.position.sizeSignedAtomic!==afterQty.toString()){
    throw new SimPreTradeError('position transition quantity conservation violation');
  }
  const after=evaluateSimIsolatedPerpRisk(candidate.position,margin,context);
  if(effect==='INCREASE'){
    if(before.status!=='HEALTHY'&&before.status!=='FLAT'){
      return result('REJECTED','EXISTING_RISK_BREACH',candidate,after);
    }
    if(!after.canMeetInitialMargin||after.maintenanceBreached||
       BigInt(after.freeCollateralAfterImAtomic)<0n||after.effectiveLeverageBps===null){
      return result('REJECTED','POST_TRADE_MARGIN_SHORTFALL',candidate,after);
    }
    if(after.leverageExceeded){
      return result('REJECTED','POST_TRADE_LEVERAGE_LIMIT',candidate,after);
    }
    if(after.status!=='HEALTHY'){
      return result('REJECTED','POST_TRADE_MARGIN_SHORTFALL',candidate,after);
    }
    return result('SIMULATION_ELIGIBLE','NONE',candidate,after);
  }
  // A close/reduction in financial distress is useful, but it must never
  // worsen simulated equity or increase OI/notional/required IM or MM.
  if(BigInt(after.equityAtomic)<BigInt(before.equityAtomic)||
     BigInt(after.notionalAtomic)>BigInt(before.notionalAtomic)||
     BigInt(after.initialMarginRequiredAtomic)>BigInt(before.initialMarginRequiredAtomic)||
     BigInt(after.maintenanceMarginRequiredAtomic)>BigInt(before.maintenanceMarginRequiredAtomic)){
    return result('REJECTED','REDUCTION_WORSENS_RISK',candidate,after);
  }
  return result('SIMULATION_ELIGIBLE','NONE',candidate,after);
}
