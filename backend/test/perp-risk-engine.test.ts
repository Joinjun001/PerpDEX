import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {MAX_INT256,MAX_UINT256} from '../src/perp/fixed-point.ts';
import {createEmptyPosition,applyPerpPositionFill,type PerpPosition,
  type PerpPositionContext} from '../src/perp/position-engine.ts';
import {evaluateSimIsolatedPerpRisk,type SimIsolatedMarginRiskInput,
  PerpRiskError} from '../src/perp/risk-engine.ts';
import type {PerpMarketConfig} from '../src/perp/market-config.ts';
import type {PerpPriceSnapshot} from '../src/perp/price-snapshot.ts';

const DOMAIN={chainId:11155111,verifyingContract:'0x1111111111111111111111111111111111111111'};
const TOKEN='0x3333333333333333333333333333333333333333';
const ACCOUNT=privateKeyToAccount(generatePrivateKey()).address;
const OTHER=privateKeyToAccount(generatePrivateKey()).address;
const NOW=1800000000;
let next=1;
const id=()=>`0x${(next++).toString(16).padStart(64,'0')}`;
const baseConfig:PerpMarketConfig={
  chainId:DOMAIN.chainId,verifyingContract:DOMAIN.verifyingContract,
  market:'BTC-USD-PERP',baseAsset:'BTC',quoteAsset:'USD',collateralToken:TOKEN,
  sourceId:'risk-local-fixture',oracleSourceId:'risk-local-oracle',revision:1,status:'APPROVED',
  validFrom:NOW-100,validUntil:NOW+1000,baseDecimals:8,priceDecimals:2,collateralDecimals:6,
  tickSize:'5',lotSize:'1',minQuantity:'1',maxQuantity:'1000000000000000000',
  maxOpenInterest:'2000000000000000000',initialMarginBps:1000,
  maintenanceMarginBps:500,maxLeverage:10,maxPriceDeviationBps:300,
  maxConfidenceBps:100,maxOracleAgeSeconds:30,
};
function context(configOverride:Partial<PerpMarketConfig>={},priceOverride:Partial<PerpPriceSnapshot>={},
  extra:Partial<PerpPositionContext>={}):PerpPositionContext{
  const config={...baseConfig,...configOverride};
  return {domain:DOMAIN,config,trustedSourceId:'risk-local-fixture',nowSeconds:NOW,
    snapshot:{chainId:config.chainId,verifyingContract:config.verifyingContract,
      market:config.market,configRevision:config.revision,sourceId:config.oracleSourceId,
      markPrice:'6500000',indexPrice:'6500000',sourceSequence:'11',publishedAt:NOW-1,
      confidenceBps:10,...priceOverride},...extra};
}
function position(c=context(),side:'BUY'|'SELL'='BUY',amount='100000000',entry='6500000'){
  const p=createEmptyPosition(ACCOUNT,c);
  return applyPerpPositionFill(p,{
    fillId:id(),side,priceAtomic:entry,quantityAtomic:amount,account:ACCOUNT,
    market:c.config.market,collateralToken:c.config.collateralToken,configRevision:c.config.revision,
    chainId:c.config.chainId,verifyingContract:c.config.verifyingContract,
    expectedVersion:p.version,executionMode:'SIMULATION_ONLY',
  },c).position;
}
function margin(total='8000000000',overrides:Partial<SimIsolatedMarginRiskInput>={},
  buckets?:{available:string;reserved:string;positionMargin:string}):SimIsolatedMarginRiskInput{
  return {executionMode:'SIMULATION_ONLY',chainId:DOMAIN.chainId,
    verifyingContract:DOMAIN.verifyingContract,market:'BTC-USD-PERP',
    collateralToken:TOKEN,account:ACCOUNT,
    balances:{available:buckets?.available??total,reserved:buckets?.reserved??'0',
      positionMargin:buckets?.positionMargin??'0',total},
    realizedPnlBookedAtomic:'0',...overrides};
}
const risk=(p=position(),m=margin(),c=context())=>evaluateSimIsolatedPerpRisk(p,m,c);

test('healthy 1 BTC LONG at $65k: 10% IM, 5% MM, 8.125x leverage, local-only',()=>{
  const p=position(),m=margin();
  const r=risk(p,m);
  assert.deepEqual([r.status,r.notionalAtomic,r.initialMarginRequiredAtomic,
    r.maintenanceMarginRequiredAtomic,r.equityAtomic,r.effectiveLeverageBps],
  ['HEALTHY','65000000000','6500000000','3250000000','8000000000','81250']);
  assert.equal(r.canMeetInitialMargin,true);
  assert.equal(r.leverageExceeded,false);
  assert.equal(r.executionAuthorized,false);
  assert.ok(Object.isFrozen(r));
  assert.equal(p.sizeSignedAtomic,'100000000');
  assert.equal(m.balances.total,'8000000000');
});

test('mark-based LONG profit increases equity, notional and IM without writing margin',()=>{
  const p=position();
  const c=context({}, {markPrice:'6600000',indexPrice:'6600000'});
  const r=risk(p,margin(),c);
  assert.equal(r.unrealizedPnlAtomic,'1000000000');
  assert.equal(r.equityAtomic,'9000000000');
  assert.equal(r.notionalAtomic,'66000000000');
  assert.equal(r.initialMarginRequiredAtomic,'6600000000');
});

test('SHORT adverse and favorable moves have opposite equity effects',()=>{
  const p=position(context(),'SELL');
  const adverse=risk(p,margin(),context({}, {markPrice:'6600000',indexPrice:'6600000'}));
  const favorable=risk(p,margin(),context({}, {markPrice:'6400000',indexPrice:'6400000'}));
  assert.equal(adverse.unrealizedPnlAtomic,'-1000000000');
  assert.equal(adverse.equityAtomic,'7000000000');
  assert.equal(favorable.unrealizedPnlAtomic,'1000000000');
  assert.equal(favorable.equityAtomic,'9000000000');
});

test('isolated available + reserved + position margin is conserved in equity; reserved reduces free collateral',()=>{
  const p=position();
  const m=margin('8000000000',{}, {available:'2000000000',reserved:'1000000000',positionMargin:'5000000000'});
  const r=risk(p,m);
  assert.equal(r.equityAtomic,'8000000000');
  assert.equal(r.freeCollateralAfterImAtomic,'500000000');
  assert.equal(r.reservedOrderMarginAtomic,'1000000000');
  assert.equal(r.status,'HEALTHY');
});

test('flat with empty or positive collateral has zero notional/IM/MM and no division by zero',()=>{
  const p=createEmptyPosition(ACCOUNT,context());
  const zero=risk(p,margin('0'));
  assert.equal(zero.status,'FLAT');
  assert.equal(zero.notionalAtomic,'0');
  assert.equal(zero.initialMarginRequiredAtomic,'0');
  assert.equal(zero.maintenanceMarginRequiredAtomic,'0');
  assert.equal(zero.effectiveLeverageBps,'0');
  assert.equal(risk(p,margin('500')).equityAtomic,'500');
});

test('between maintenance and initial margin is INITIAL_MARGIN_SHORTFALL',()=>{
  const r=risk(position(),margin('4000000000'));
  assert.equal(r.status,'INITIAL_MARGIN_SHORTFALL');
  assert.equal(r.canMeetInitialMargin,false);
  assert.equal(r.maintenanceBreached,false);
});

test('strict maintenance boundary is flagged, even at exact collateral coverage',()=>{
  const at=risk(position(),margin('3250000000'));
  assert.equal(at.status,'MAINTENANCE_MARGIN_BREACH');
  assert.equal(at.maintenanceBreached,true);
  const below=risk(position(),margin('3249999999'));
  assert.equal(below.status,'MAINTENANCE_MARGIN_BREACH');
});

test('negative equity is insolvent; no numeric leverage or liquidation side effect',()=>{
  const r=risk(position(),margin('1000000000'),context({}, {markPrice:'6300000',indexPrice:'6300000'}));
  assert.equal(r.unrealizedPnlAtomic,'-2000000000');
  assert.equal(r.equityAtomic,'-1000000000');
  assert.equal(r.status,'INSOLVENT');
  assert.equal(r.effectiveLeverageBps,null);
  assert.equal(r.executionAuthorized,false);
});

test('zero equity stays MAINTENANCE_MARGIN_BREACH, never divides by zero',()=>{
  const r=risk(position(),margin('1000000000'),context({}, {markPrice:'6400000',indexPrice:'6400000'}));
  assert.equal(r.equityAtomic,'0');
  assert.equal(r.effectiveLeverageBps,null);
  assert.equal(r.status,'MAINTENANCE_MARGIN_BREACH');
});

test('policy leverage cap stricter than initial margin is independently enforced',()=>{
  const c=context({initialMarginBps:2000,maintenanceMarginBps:1000,maxLeverage:2});
  const p=position(c);
  const r=risk(p,margin('30000000000'),c);
  assert.equal(r.canMeetInitialMargin,true);
  assert.equal(r.initialMarginRequiredAtomic,'13000000000');
  assert.equal(r.status,'LEVERAGE_LIMIT_EXCEEDED');
  assert.equal(r.leverageExceeded,true);
  assert.equal(r.maxAllowedLeverageBps,'20000');
  assert.equal(r.effectiveLeverageBps,'21667');
});

test('margin exact IM boundary passes initial requirement, one atomic unit below fails',()=>{
  assert.equal(risk(position(),margin('6500000000')).canMeetInitialMargin,true);
  assert.equal(risk(position(),margin('6499999999')).status,'INITIAL_MARGIN_SHORTFALL');
});

test('position realized PnL unbooked is incorporated even after going flat',()=>{
  const c=context(),p=position(c);
  const higher=context({}, {markPrice:'6600000',indexPrice:'6600000'});
  const closed=applyPerpPositionFill(p,{fillId:id(),side:'SELL',priceAtomic:'6600000',
    quantityAtomic:'100000000',account:ACCOUNT,market:c.config.market,
    collateralToken:TOKEN,configRevision:c.config.revision,chainId:c.config.chainId,
    verifyingContract:c.config.verifyingContract,expectedVersion:p.version,
    executionMode:'SIMULATION_ONLY'},higher).position;
  const r=risk(closed,margin('8000000000'),higher);
  assert.equal(r.unbookedRealizedPnlAtomic,'1000000000');
  assert.equal(r.equityAtomic,'9000000000');
  assert.equal(r.notionalAtomic,'0');
  assert.equal(r.status,'FLAT');
});

test('unbooked realized loss is conservatively reflected in equity',()=>{
  const c=context(),p=position(c);
  const lower=context({}, {markPrice:'6400000',indexPrice:'6400000'});
  const closed=applyPerpPositionFill(p,{fillId:id(),side:'SELL',priceAtomic:'6400000',
    quantityAtomic:'100000000',account:ACCOUNT,market:c.config.market,
    collateralToken:TOKEN,configRevision:c.config.revision,chainId:c.config.chainId,
    verifyingContract:c.config.verifyingContract,expectedVersion:p.version,
    executionMode:'SIMULATION_ONLY'},lower).position;
  assert.equal(risk(closed,margin('0'),lower).equityAtomic,'-1000000000');
});

test('fractional losses round AWAY from zero; fractional positive profit truncates',()=>{
  const c=context({baseDecimals:1,priceDecimals:1,collateralDecimals:0,
    tickSize:'1',lotSize:'1',minQuantity:'1',maxQuantity:'100',maxOpenInterest:'1000'},
    {markPrice:'1',indexPrice:'1'});
  const short=position(c,'SELL','1','1');
  const long=position(c,'BUY','1','1');
  const higher=context(c.config,{markPrice:'2',indexPrice:'2'});
  const shortReport=risk(short,margin('1'),higher);
  assert.equal(shortReport.notionalAtomic,'1');
  assert.equal(shortReport.initialMarginRequiredAtomic,'1');
  assert.equal(shortReport.maintenanceMarginRequiredAtomic,'1');
  assert.equal(shortReport.unrealizedPnlAtomic,'-1');
  assert.equal(shortReport.equityAtomic,'0');
  const longReport=risk(long,margin('1'),higher);
  assert.equal(longReport.unrealizedPnlAtomic,'0');
  assert.equal(longReport.equityAtomic,'1');
});

test('tiny notional/ratio never rounds risk requirement down to zero',()=>{
  const c=context({baseDecimals:1,priceDecimals:1,collateralDecimals:0,
    tickSize:'1',lotSize:'1',minQuantity:'1',maxQuantity:'100',maxOpenInterest:'1000'},
    {markPrice:'1',indexPrice:'1'});
  const p=position(c,'BUY','1','1');
  assert.deepEqual([risk(p,margin('0'),c).notionalAtomic,
    risk(p,margin('0'),c).initialMarginRequiredAtomic,
    risk(p,margin('0'),c).maintenanceMarginRequiredAtomic],['1','1','1']);
});

test('bad balances and canonical decimal formats fail closed',()=>{
  const p=position();
  const bad=[{available:'-1'}, {available:'01'}, {available:'0x10'},
    {available:'8000000001'}, {reserved:'1'}, {positionMargin:'3'},
    {available:'100000000000000000000000000000000000000000000000000000000000000000000000000000000000'}];
  for(const patch of bad){
    const m=margin();
    assert.throws(()=>risk(p,{...m,balances:{...m.balances,...patch}}),Error,JSON.stringify(patch));
  }
});

test('scope mismatch account, collateral, market, chain and contract all fail closed',()=>{
  const p=position(),m=margin();
  const cases=[{account:OTHER},{market:'ETH-USD-PERP'},
    {chainId:1},{verifyingContract:'0x4444444444444444444444444444444444444444'},
    {collateralToken:'0x4444444444444444444444444444444444444444'},
    {account:'0x0000000000000000000000000000000000000000'}];
  for(const patch of cases){
    assert.throws(()=>risk(p,{...m,...patch}),Error,JSON.stringify(patch));
  }
  const tampered:PerpPosition={...p,account:OTHER};
  assert.throws(()=>risk(tampered,m));
});

test('rejects unverified margin booking and any non-SIMULATION execution request',()=>{
  const p=position(),m=margin();
  assert.throws(()=>risk(p,{...m,realizedPnlBookedAtomic:'1' as '0'}),PerpRiskError);
  assert.throws(()=>risk(p,{...m,executionMode:'LIVE' as 'SIMULATION_ONLY'}),PerpRiskError);
  assert.throws(()=>risk(p,{...m,realizedPnlBookedAtomic:undefined as unknown as '0'}),PerpRiskError);
});

test('approved source and fresh trusted mark are mandatory and cannot be forged',()=>{
  const p=position();
  const invalid=[context({status:'DRAFT'}),context({status:'REVOKED'}),
    context({sourceId:'external'}),context({chainId:1}),
    context({revision:2}),context({}, {configRevision:2}),
    context({}, {markPrice:'0'}),context({}, {indexPrice:'0'}),
    context({}, {sourceId:'wrong'}),context({}, {publishedAt:NOW+1}),
    context({}, {publishedAt:NOW-100}),context({}, {confidenceBps:999}),
    context({}, {markPrice:'7500000'}),
    context({}, {},{trustedSourceId:'unknown'}),
  ];
  for(const c of invalid)assert.throws(()=>risk(p,margin(),c));
});

test('max uint / max int and huge net PnL are rejected before misleading leverage is computed',()=>{
  const p=position();
  assert.throws(()=>risk(p,margin(MAX_UINT256.toString())),PerpRiskError);
  const blank=createEmptyPosition(ACCOUNT,context());
  assert.throws(()=>risk({...blank,realizedPnlNumerator:'10000'},
    margin(MAX_INT256.toString())),PerpRiskError);
  assert.throws(()=>risk({...p,sizeSignedAtomic:MAX_UINT256.toString()}));
  assert.throws(()=>risk({...p,openCostNumerator:MAX_UINT256.toString()}));
});

test('risk does not change its input or mutate the market, margin, or position model',()=>{
  const p=Object.freeze(position()),m=Object.freeze(margin());
  const c=context();
  const serialized=JSON.stringify([p,m,c]);
  assert.equal(risk(p,m,c).executionAuthorized,false);
  assert.equal(JSON.stringify([p,m,c]),serialized);
});
