/**
 * M5-T1 simulation-only isolated linear-perpetual risk calculator.
 * No writes, funding, actual collateral credit, order approval or liquidation.
 * All amounts are canonical decimal strings of collateral atomic units.
 */
import {getAddress} from 'viem';
import {collateralNotional,decimalScale,int256,MAX_INT256,MAX_UINT256,
  mulDivUnsigned,uint256} from './fixed-point.ts';
import {validatePerpMarketConfig} from './market-config.ts';
import {validateMockPriceSnapshot} from './price-snapshot.ts';
import {markPerpPosition,type PerpPosition,type PerpPositionContext} from './position-engine.ts';
import type {MarginBalances} from './margin-ledger.ts';

export class PerpRiskError extends Error {
  constructor(message:string){super(message);this.name='PerpRiskError';}
}

/** All buckets must originate from the SAME trusted account/market/domain snapshot. */
export interface SimIsolatedMarginRiskInput {
  executionMode:'SIMULATION_ONLY';
  chainId:number;
  verifyingContract:string;
  market:string;
  collateralToken:string;
  account:string;
  balances:Readonly<MarginBalances>;
  /** There is NO PnL posting to M3 ledger in M5-T1; fail closed on other values. */
  realizedPnlBookedAtomic:'0';
}
export type SimRiskStatus='FLAT'|'HEALTHY'|'LEVERAGE_LIMIT_EXCEEDED'|
  'INITIAL_MARGIN_SHORTFALL'|'MAINTENANCE_MARGIN_BREACH'|'INSOLVENT';
export interface SimPerpRiskReport {
  executionMode:'SIMULATION_ONLY';
  status:SimRiskStatus;
  canMeetInitialMargin:boolean;
  maintenanceBreached:boolean;
  leverageExceeded:boolean;
  /** Exact mark notional converted to collateral atomic units, always UP. */
  notionalAtomic:string;
  initialMarginRequiredAtomic:string;
  maintenanceMarginRequiredAtomic:string;
  /** Free collateral estimate subtracts pending order reservations and existing IM. */
  freeCollateralAfterImAtomic:string;
  /** Position realized PnL not posted to M3 margin buckets, rounded conservatively. */
  unbookedRealizedPnlAtomic:string;
  unrealizedPnlAtomic:string;
  equityAtomic:string;
  /** ceil(10000*notional/equity), null for a nonflat position with equity <= 0. */
  effectiveLeverageBps:string|null;
  maxAllowedLeverageBps:string;
  reservedOrderMarginAtomic:string;
  positionVersion:number;
  oracleSequence:string;
  policyRevision:number;
  /** Risk is ONLY a diagnosis; it cannot authorize an order or trigger liquidation. */
  executionAuthorized:false;
}
const ZERO='0x0000000000000000000000000000000000000000';
function address(raw:unknown,name:string):string {
  if(typeof raw!=='string')throw new PerpRiskError(`${name} address is missing`);
  try{const result=getAddress(raw).toLowerCase();if(result===ZERO)throw Error();return result;}
  catch{throw new PerpRiskError(`${name} address invalid`);}
}
function safeSigned(value:bigint,name:string):bigint {
  if(value < -(1n<<255n) || value>MAX_INT256){
    throw new PerpRiskError(`${name}: int256 overflow`);
  }
  return value;
}
/** Signed positive profit truncates; signed negative debt rounds AWAY from zero. */
function conservativeSignedAtomic(numerator:bigint,denominator:bigint):bigint {
  if(denominator<=0n)throw new PerpRiskError('invalid decimal denominator');
  const loss=numerator<0n;
  const magnitude=loss?-numerator:numerator;
  const rounded=magnitude/denominator+(loss&&magnitude%denominator!==0n?1n:0n);
  return safeSigned(loss?-rounded:rounded,'risk PnL');
}
/**
 * Assessment consumes trusted inputs only. Local test settings are NOT production
 * risk limits, M3 ledger buckets are NOT proof of actual deposits and recognized
 * realized PnL is NOT separately booked until a future atomic settlement stage.
 */
export function evaluateSimIsolatedPerpRisk(
  position:Readonly<PerpPosition>,margin:Readonly<SimIsolatedMarginRiskInput>,
  context:PerpPositionContext,
):Readonly<SimPerpRiskReport>{
  if(!context||!margin||margin.executionMode!=='SIMULATION_ONLY'||
      margin.realizedPnlBookedAtomic!=='0'){
    throw new PerpRiskError('simulation-only unbooked realized PnL accounting required');
  }
  const config=validatePerpMarketConfig(context.config,context.domain,
    context.trustedSourceId,context.nowSeconds);
  const oracle=validateMockPriceSnapshot(context.snapshot,config,context.domain,context.nowSeconds);
  if(margin.chainId!==config.chainId||
    address(margin.verifyingContract,'verifyingContract')!==config.verifyingContract||
    margin.market!==config.market||
    address(margin.collateralToken,'collateralToken')!==config.collateralToken||
    address(margin.account,'account')!==address(position?.account,'position account')||
    position.chainId!==config.chainId||position.market!==config.market||
    position.configRevision!==config.revision){
    throw new PerpRiskError('isolated margin and position scope mismatch');
  }
  // Recheck full position scope, internal cost basis, and trusted mark (no writes).
  markPerpPosition(position,context);
  const balances=margin.balances;
  if(!balances||typeof balances!=='object')throw new PerpRiskError('margin balances required');
  const available=uint256(balances.available,'available');
  const reserved=uint256(balances.reserved,'reserved');
  const positionMargin=uint256(balances.positionMargin,'positionMargin');
  const total=uint256(balances.total,'total');
  if(available+reserved+positionMargin!==total)throw new PerpRiskError('margin buckets do not sum to total');
  if(total>MAX_INT256)throw new PerpRiskError('margin total exceeds risk int256 range');
  const signedSize=int256(position.sizeSignedAtomic,'sizeSignedAtomic');
  const size=signedSize<0n?-signedSize:signedSize;
  const openCost=uint256(position.openCostNumerator,'openCostNumerator');
  const realized=int256(position.realizedPnlNumerator,'realizedPnlNumerator');
  const mark=uint256(oracle.markPrice,'markPrice',true);
  const notional=size===0n?0n:BigInt(collateralNotional(size.toString(),mark.toString(),config,'UP'));
  const initial=mulDivUnsigned(notional,BigInt(config.initialMarginBps),10000n,'UP');
  const maintenance=mulDivUnsigned(notional,BigInt(config.maintenanceMarginBps),10000n,'UP');
  if(notional>MAX_INT256||initial>MAX_INT256||maintenance>MAX_INT256){
    throw new PerpRiskError('notional/IM/MM exceeds risk signed range');
  }
  const denominator=decimalScale(config.baseDecimals)*decimalScale(config.priceDecimals);
  const scale=decimalScale(config.collateralDecimals);
  const markNumerator=size*mark;
  if(markNumerator>MAX_UINT256)throw new PerpRiskError('mark product overflow');
  const unrealizedNumerator=signedSize>0n?markNumerator-openCost:
    signedSize<0n?openCost-markNumerator:0n;
  const unrealized=conservativeSignedAtomic(unrealizedNumerator*scale,denominator);
  const realizedAtomic=conservativeSignedAtomic(realized*scale,denominator);
  const equity=safeSigned(total+realizedAtomic+unrealized,'equity');
  const free=safeSigned(equity-reserved-initial,'free collateral');
  const effective=size===0n?'0':equity<=0n?null:
    mulDivUnsigned(notional,10000n,equity,'UP').toString();
  const leverageExceeded=effective===null?size!==0n:
    BigInt(effective)>BigInt(config.maxLeverage)*10000n;
  const canMeetInitialMargin=equity>=initial&&equity>0n;
  const maintenanceBreached=size>0n&&equity<=maintenance;
  const status:SimRiskStatus=equity<0n?'INSOLVENT':maintenanceBreached?
    'MAINTENANCE_MARGIN_BREACH':!canMeetInitialMargin&&size>0n?
    'INITIAL_MARGIN_SHORTFALL':leverageExceeded?'LEVERAGE_LIMIT_EXCEEDED':
    size===0n?'FLAT':'HEALTHY';
  return Object.freeze({executionMode:'SIMULATION_ONLY',status,canMeetInitialMargin,
    maintenanceBreached,leverageExceeded,notionalAtomic:notional.toString(),
    initialMarginRequiredAtomic:initial.toString(),maintenanceMarginRequiredAtomic:maintenance.toString(),
    freeCollateralAfterImAtomic:free.toString(),
    unbookedRealizedPnlAtomic:realizedAtomic.toString(),unrealizedPnlAtomic:unrealized.toString(),
    equityAtomic:equity.toString(),effectiveLeverageBps:effective,
    maxAllowedLeverageBps:(BigInt(config.maxLeverage)*10000n).toString(),
    reservedOrderMarginAtomic:reserved.toString(),positionVersion:position.version,
    oracleSequence:oracle.sourceSequence,policyRevision:config.revision,executionAuthorized:false});
}
