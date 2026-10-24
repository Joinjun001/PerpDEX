import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {createEmptyPosition,applyPerpPositionFill,type PerpPosition,
  type PerpPositionContext,type PerpPositionFill} from '../src/perp/position-engine.ts';
import type {PerpMarketConfig} from '../src/perp/market-config.ts';
import type {PerpPriceSnapshot} from '../src/perp/price-snapshot.ts';
import type {SimIsolatedMarginRiskInput} from '../src/perp/risk-engine.ts';
import {evaluateSimPreTrade,type SimPreTradeRequest} from '../src/perp/pre-trade-risk.ts';

const DOMAIN={chainId:11155111,verifyingContract:'0x1111111111111111111111111111111111111111'};
const TOKEN='0x3333333333333333333333333333333333333333';
const ACCOUNT=privateKeyToAccount(generatePrivateKey()).address;
const OTHER=privateKeyToAccount(generatePrivateKey()).address;
const NOW=1800000000;
let serial=1;
const id=()=>`0x${(serial++).toString(16).padStart(64,'0')}`;
const base:PerpMarketConfig={chainId:DOMAIN.chainId,verifyingContract:DOMAIN.verifyingContract,
  market:'BTC-USD-PERP',baseAsset:'BTC',quoteAsset:'USD',collateralToken:TOKEN,
  sourceId:'sim-risk-approved-fixture',oracleSourceId:'sim-risk-oracle',revision:1,
  status:'APPROVED',validFrom:NOW-100,validUntil:NOW+1000,
  baseDecimals:8,priceDecimals:2,collateralDecimals:6,tickSize:'5',lotSize:'100',
  minQuantity:'100',maxQuantity:'1000000000000000',maxOpenInterest:'2000000000000000',
  initialMarginBps:1000,maintenanceMarginBps:500,maxLeverage:10,
  maxPriceDeviationBps:300,maxConfidenceBps:100,maxOracleAgeSeconds:30};
function ctx(patch:Partial<PerpMarketConfig>={},snapshot:Partial<PerpPriceSnapshot>={}):PerpPositionContext{
  const config={...base,...patch};
  return {domain:DOMAIN,config,trustedSourceId:'sim-risk-approved-fixture',nowSeconds:NOW,
    snapshot:{chainId:config.chainId,verifyingContract:config.verifyingContract,
      market:config.market,configRevision:config.revision,sourceId:config.oracleSourceId,
      indexPrice:'6500000',markPrice:'6500000',publishedAt:NOW-1,sourceSequence:'101',
      confidenceBps:10,...snapshot}};
}
function margin(total='10000000000',reserved='0'):SimIsolatedMarginRiskInput{
  const sum=BigInt(total),hold=BigInt(reserved);
  return {executionMode:'SIMULATION_ONLY',chainId:DOMAIN.chainId,
    verifyingContract:DOMAIN.verifyingContract,market:base.market,
    collateralToken:TOKEN,account:ACCOUNT,
    balances:{available:(sum-hold).toString(),reserved,positionMargin:'0',total},
    realizedPnlBookedAtomic:'0'};
}
function start(c=ctx(),side?:'BUY'|'SELL',price='6500000',quantity='100000000'){
  const flat=createEmptyPosition(ACCOUNT,c);
  if(!side)return flat;
  const fill:PerpPositionFill={fillId:id(),side,priceAtomic:price,quantityAtomic:quantity,
    account:ACCOUNT,market:c.config.market,collateralToken:c.config.collateralToken,
    configRevision:c.config.revision,chainId:c.config.chainId,verifyingContract:c.config.verifyingContract,
    expectedVersion:0,executionMode:'SIMULATION_ONLY'};
  return applyPerpPositionFill(flat,fill,c).position;
}
function req(p:PerpPosition,options:Partial<SimPreTradeRequest>={}):SimPreTradeRequest{
  return {executionMode:'SIMULATION_ONLY',fillId:id(),account:ACCOUNT,
    chainId:DOMAIN.chainId,verifyingContract:DOMAIN.verifyingContract,
    market:base.market,collateralToken:TOKEN,configRevision:1,expectedVersion:p.version,
    side:'SELL',priceAtomic:'6500000',orderQuantityAtomic:'40000000',
    simulatedFillQuantityAtomic:'40000000',reduceOnly:true,...options};
}
const run=(p:PerpPosition,m:SimIsolatedMarginRiskInput=margin(),
  options:Partial<SimPreTradeRequest>={},c=ctx())=>evaluateSimPreTrade(p,m,req(p,options),c);

test('reduce-only LONG closes part of position, risk is repriced without modifying inputs',()=>{
  const c=ctx(),p=start(c,'BUY'),m=margin();
  const before=JSON.stringify([p,m,c]);
  const r=run(p,m,{},c);
  assert.equal(r.decision,'SIMULATION_ELIGIBLE');
  assert.equal(r.effect,'REDUCE');
  assert.equal(r.candidate?.position.sizeSignedAtomic,'60000000');
  assert.equal(r.after?.notionalAtomic,'39000000000');
  assert.equal(r.after?.initialMarginRequiredAtomic,'3900000000');
  assert.equal(r.executionAuthorized,false);
  assert.ok(Object.isFrozen(r));
  assert.equal(JSON.stringify([p,m,c]),before);
});

test('reduce-only SHORT BUY closes part and leaves short sign unchanged',()=>{
  const p=start(ctx(),'SELL');
  const r=run(p,margin(),{side:'BUY'});
  assert.equal(r.decision,'SIMULATION_ELIGIBLE');
  assert.equal(r.candidate?.position.sizeSignedAtomic,'-60000000');
});

test('reduce-only full close is allowed and restores flat IM/MM=0',()=>{
  const p=start(ctx(),'BUY');
  const r=run(p,margin(),{orderQuantityAtomic:'100000000',simulatedFillQuantityAtomic:'100000000'});
  assert.equal(r.effect,'CLOSE');
  assert.equal(r.after?.status,'FLAT');
  assert.equal(r.after?.initialMarginRequiredAtomic,'0');
  assert.equal(r.candidate?.position.openCostNumerator,'0');
});

test('reduce-only order blocked on FLAT even when proposed fill is zero-direction BUY',()=>{
  const r=run(start(),margin(),{side:'BUY'});
  assert.equal(r.decision,'REJECTED');
  assert.equal(r.reason,'REDUCE_ONLY_FLAT');
  assert.equal(r.candidate,null);
});

test('reduce-only in same direction as existing long/short is rejected',()=>{
  assert.equal(run(start(ctx(),'BUY'),margin(),{side:'BUY'}).reason,'REDUCE_ONLY_DIRECTION');
  assert.equal(run(start(ctx(),'SELL'),margin(),{side:'SELL'}).reason,'REDUCE_ONLY_DIRECTION');
});

test('reduce-only order larger than current position is rejected even if this partial fill is small',()=>{
  const p=start(ctx(),'BUY');
  const r=run(p,margin(),{orderQuantityAtomic:'150000000',simulatedFillQuantityAtomic:'40000000'});
  assert.equal(r.decision,'REJECTED');
  assert.equal(r.reason,'REDUCE_ONLY_OVERSIZE');
  assert.equal(r.after,null);
});

test('reduce-only reverse exceeding current quantity never runs transition',()=>{
  const p=start(ctx(),'SELL');
  const r=run(p,margin(),{side:'BUY',orderQuantityAtomic:'150000000',simulatedFillQuantityAtomic:'150000000'});
  assert.equal(r.reason,'REDUCE_ONLY_OVERSIZE');
});

test('non-reduce-only reverse is rejected, even with partial fill initially reducing',()=>{
  const p=start(ctx(),'BUY');
  const direct=run(p,margin(),{reduceOnly:false,orderQuantityAtomic:'150000000',simulatedFillQuantityAtomic:'150000000'});
  const partial=run(p,margin(),{reduceOnly:false,orderQuantityAtomic:'150000000',simulatedFillQuantityAtomic:'40000000'});
  assert.equal(direct.reason,'POSITION_REVERSAL');
  assert.equal(partial.reason,'POSITION_REVERSAL');
});

test('non-reduce-only partial fill of 2 BTC request simulates only filled quantity and records remaining',()=>{
  const p=start();
  const r=run(p,margin('30000000000'),{reduceOnly:false,side:'BUY',
    orderQuantityAtomic:'200000000',simulatedFillQuantityAtomic:'50000000'});
  assert.equal(r.decision,'SIMULATION_ELIGIBLE');
  assert.equal(r.effect,'INCREASE');
  assert.equal(r.candidate?.openedQuantityAtomic,'50000000');
  assert.equal(r.candidate?.position.sizeSignedAtomic,'50000000');
  assert.equal(r.remainingOrderQuantityAtomic,'150000000');
  assert.equal(r.after?.notionalAtomic,'32500000000');
});

test('increase with insufficient post-fill IM rejects without committing candidate',()=>{
  const p=start();
  const r=run(p,margin('1000000000'),{side:'BUY',reduceOnly:false,
    orderQuantityAtomic:'100000000',simulatedFillQuantityAtomic:'100000000'});
  assert.equal(r.reason,'POST_TRADE_MARGIN_SHORTFALL');
  assert.equal(r.decision,'REJECTED');
  assert.equal(r.candidate?.position.sizeSignedAtomic,'100000000');
  assert.equal(p.sizeSignedAtomic,'0');
});

test('risk increase blocked by reserved collateral even with total >= IM',()=>{
  const p=start();
  const r=run(p,margin('8000000000','2000000000'),{side:'BUY',reduceOnly:false,
    orderQuantityAtomic:'100000000',simulatedFillQuantityAtomic:'100000000'});
  assert.equal(r.reason,'POST_TRADE_MARGIN_SHORTFALL');
  assert.equal(r.after?.freeCollateralAfterImAtomic,'-500000000');
});

test('increased position breaches maxLeverage even though IM covers notional',()=>{
  const c=ctx({initialMarginBps:2000,maintenanceMarginBps:1000,maxLeverage:2});
  const p=start(c);
  const r=run(p,margin('30000000000'),{side:'BUY',reduceOnly:false,
    orderQuantityAtomic:'100000000',simulatedFillQuantityAtomic:'100000000'},c);
  assert.equal(r.reason,'POST_TRADE_LEVERAGE_LIMIT');
  assert.equal(r.after?.canMeetInitialMargin,true);
});

test('increase blocked on an existing IM shortfall even if new fill is small',()=>{
  const p=start(ctx(),'BUY');
  const r=run(p,margin('4000000000'),{side:'BUY',reduceOnly:false,
    orderQuantityAtomic:'1000000',simulatedFillQuantityAtomic:'1000000'});
  assert.equal(r.reason,'EXISTING_RISK_BREACH');
});

test('distressed maintenance breach still permits improving reduce-only partial close',()=>{
  const p=start(ctx(),'BUY');
  const r=run(p,margin('2000000000'));
  assert.equal(r.before.status,'MAINTENANCE_MARGIN_BREACH');
  assert.equal(r.decision,'SIMULATION_ELIGIBLE');
  assert.equal(r.effect,'REDUCE');
  assert.equal(r.after?.notionalAtomic,'39000000000');
  assert.equal(r.executionAuthorized,false);
});

test('negative equity cannot increase position; reduction with mark-neutral execution remains only simulated',()=>{
  const p=start(ctx(),'BUY');
  const adverse=ctx({}, {markPrice:'6300000',indexPrice:'6300000'});
  const inc=run(p,margin('1000000000'),{side:'BUY',reduceOnly:false,
    priceAtomic:'6300000',orderQuantityAtomic:'1000000',simulatedFillQuantityAtomic:'1000000'},adverse);
  assert.equal(inc.reason,'EXISTING_RISK_BREACH');
  const reduce=run(p,margin('1000000000'),{priceAtomic:'6300000'},adverse);
  assert.equal(reduce.before.status,'INSOLVENT');
  assert.equal(reduce.decision,'SIMULATION_ELIGIBLE');
  assert.equal(reduce.after?.equityAtomic,'-1000000000');
});

test('adverse below-mark reduction in distressed account fails closed on worsened equity',()=>{
  const p=start(ctx(),'BUY');
  const c=ctx({}, {markPrice:'6400000',indexPrice:'6400000'});
  const r=run(p,margin('1000000000'),{priceAtomic:'6390000'},c);
  assert.equal(r.reason,'REDUCTION_WORSENS_RISK');
  assert.equal(r.decision,'REJECTED');
  assert.equal(r.after?.executionAuthorized,false);
});

test('non-reduce-only close while IM shortfall can be evaluated if actual exposure falls',()=>{
  const p=start(ctx(),'BUY');
  const r=run(p,margin('1000000000'),{reduceOnly:false});
  assert.equal(r.effect,'REDUCE');
  assert.equal(r.decision,'SIMULATION_ELIGIBLE');
});

test('zero, noncanonical, too large, nonlot quantities and nontick prices fail safe',()=>{
  const p=start(ctx(),'BUY');
  for(const patch of [{orderQuantityAtomic:'0'},{simulatedFillQuantityAtomic:'0'},
    {orderQuantityAtomic:'040000000'},{orderQuantityAtomic:'-1'},
    {simulatedFillQuantityAtomic:'50000000',orderQuantityAtomic:'40000000'},
    {simulatedFillQuantityAtomic:'123'},{priceAtomic:'6500001'},
    {orderQuantityAtomic:'999999999999999999999999999999999999999999999999999999999999999999999999999999'},
  ])assert.throws(()=>run(p,margin(),patch),Error,JSON.stringify(patch));
});

test('stale version, changed account/market/contract/chain/token and malformed ID all fail closed',()=>{
  const p=start(ctx(),'BUY');
  for(const patch of [{expectedVersion:0},{account:OTHER},{chainId:1},
    {market:'ETH-USD-PERP'},{configRevision:2},
    {verifyingContract:'0x4444444444444444444444444444444444444444'},
    {collateralToken:'0x4444444444444444444444444444444444444444'},
    {fillId:'bad'},{executionMode:'LIVE' as 'SIMULATION_ONLY'},
    {reduceOnly:undefined as unknown as boolean},
  ])assert.throws(()=>run(p,margin(),patch),Error,JSON.stringify(patch));
});

test('trusted config/oracle required and rejected before any candidate transition',()=>{
  const p=start(ctx(),'BUY');
  for(const c of [ctx({status:'DRAFT'}),ctx({revision:2},{configRevision:2}),
    ctx({}, {publishedAt:NOW-60}),ctx({}, {sourceId:'rogue'}),
    ctx({}, {markPrice:'7500000'}),ctx({}, {publishedAt:NOW+1})]){
    assert.throws(()=>run(p,margin(),{},c));
  }
});

test('requested fill must not exceed risk transition int256/uint256; full no-state-change guarantee',()=>{
  const p=start(ctx(),'BUY');
  const before=JSON.stringify(p);
  assert.throws(()=>run(p,margin(),{orderQuantityAtomic:'9999999999999999',simulatedFillQuantityAtomic:'9999999999999999'}));
  assert.equal(JSON.stringify(p),before);
});

test('infinite repeat of in-memory candidate does not mutate source or grant authority',()=>{
  const c=ctx(),p=Object.freeze(start(c,'BUY'));
  const m=Object.freeze(margin());
  const request=Object.freeze(req(p));
  const before=JSON.stringify([p,m,request]);
  const a=evaluateSimPreTrade(p,m,request,c),b=evaluateSimPreTrade(p,m,request,c);
  assert.deepEqual(a,b);
  assert.equal(JSON.stringify([p,m,request]),before);
  assert.equal(a.executionAuthorized,false);
  assert.equal(a.after?.executionAuthorized,false);
});
