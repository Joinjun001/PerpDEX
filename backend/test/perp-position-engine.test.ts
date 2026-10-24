import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {MAX_INT256,MAX_UINT256,MIN_INT256} from '../src/perp/fixed-point.ts';
import {
  createEmptyPosition,applyPerpPositionFill,markPerpPosition,PerpPositionError,
  type PerpPositionFill,type PerpPositionContext,type PerpPosition,
} from '../src/perp/position-engine.ts';
import type {PerpMarketConfig} from '../src/perp/market-config.ts';
import type {PerpPriceSnapshot} from '../src/perp/price-snapshot.ts';

const domain={chainId:11155111,verifyingContract:'0x1111111111111111111111111111111111111111'};
const account=privateKeyToAccount(generatePrivateKey()).address;
const other=privateKeyToAccount(generatePrivateKey()).address;
const TOKEN='0x3333333333333333333333333333333333333333';
const now=1800000000;
const source='local-test-trusted-config';
const baseConfig:PerpMarketConfig={
  chainId:domain.chainId,verifyingContract:domain.verifyingContract,
  market:'BTC-USD-PERP',baseAsset:'BTC',quoteAsset:'USD',collateralToken:TOKEN,
  sourceId:source,oracleSourceId:'test-oracle',revision:1,status:'APPROVED',
  validFrom:now-100,validUntil:now+1000,baseDecimals:8,priceDecimals:2,
  collateralDecimals:6,tickSize:'5',lotSize:'1',minQuantity:'1',
  maxQuantity:'1000000000000000000',maxOpenInterest:'2000000000000000000',
  initialMarginBps:1000,maintenanceMarginBps:500,maxLeverage:10,
  maxPriceDeviationBps:300,maxConfidenceBps:200,maxOracleAgeSeconds:30,
};
const baseSnapshot:PerpPriceSnapshot={chainId:domain.chainId,
  verifyingContract:domain.verifyingContract,market:baseConfig.market,
  configRevision:1,sourceId:'test-oracle',indexPrice:'6500000',markPrice:'6500000',
  publishedAt:now-1,sourceSequence:'1',confidenceBps:20};
function context(config:Partial<PerpMarketConfig>={},snapshot:Partial<PerpPriceSnapshot>={},args:Partial<PerpPositionContext>={}):PerpPositionContext{
  return {domain,config:{...baseConfig,...config},trustedSourceId:source,
    snapshot:{...baseSnapshot,...snapshot},nowSeconds:now,...args};
}
let id=1;
const unique=()=>`0x${(id++).toString(16).padStart(64,'0')}`;
function fill(position:PerpPosition,side:'BUY'|'SELL',price='6500000',qty='100000000',
  changes:Partial<PerpPositionFill>={}):PerpPositionFill{
  return {fillId:unique(),side,priceAtomic:price,quantityAtomic:qty,
    account:account,market:baseConfig.market,collateralToken:TOKEN,
    chainId:domain.chainId,verifyingContract:domain.verifyingContract,
    configRevision:1,expectedVersion:position.version,
    executionMode:'SIMULATION_ONLY',...changes};
}
const open=(c=context())=>createEmptyPosition(account,c);
function step(pos:PerpPosition,side:'BUY'|'SELL',price='6500000',qty='100000000',c=context()){
  return applyPerpPositionFill(pos,fill(pos,side,price,qty),c);
}

test('empty position has exact zero cost, PnL, version and no external effects',()=>{
  const p=open(),report=markPerpPosition(p,context());
  assert.ok(Object.isFrozen(p));
  assert.deepEqual({size:p.sizeSignedAtomic,cost:p.openCostNumerator,pnl:p.realizedPnlNumerator,version:p.version,last:p.lastFillId},
    {size:'0',cost:'0',pnl:'0',version:0,last:null});
  assert.equal(report.side,'FLAT');
  assert.equal(report.unrealizedPnlAtomic,'0');
  assert.equal(report.positionNotionalAtomic,'0');
});

test('open one BTC LONG at 65000; mark 66000 gives exactly +1000 USDC',()=>{
  const initial=open();const out=step(initial,'BUY');
  assert.equal(out.position.sizeSignedAtomic,'100000000');
  assert.equal(out.position.openCostNumerator,'650000000000000');
  assert.equal(out.position.realizedPnlNumerator,'0');
  assert.equal(out.openedQuantityAtomic,'100000000');
  assert.equal(out.closedQuantityAtomic,'0');
  assert.equal(out.mark.averageEntryPriceFloorAtomic,'6500000');
  const marked=markPerpPosition(out.position,context({}, {indexPrice:'6600000',markPrice:'6600000'}));
  assert.equal(marked.side,'LONG');
  assert.equal(marked.unrealizedPnlAtomic,'1000000000');
  assert.equal(marked.positionNotionalAtomic,'66000000000');
  assert.equal(initial.sizeSignedAtomic,'0'); // no mutation
});

test('open SHORT: adverse price increase loses and favorable drop earns',()=>{
  const short=step(open(),'SELL').position;
  assert.equal(short.sizeSignedAtomic,'-100000000');
  assert.equal(markPerpPosition(short,context({}, {markPrice:'6600000',indexPrice:'6600000'})).unrealizedPnlAtomic,'-1000000000');
  assert.equal(markPerpPosition(short,context({}, {markPrice:'6400000',indexPrice:'6400000'})).unrealizedPnlAtomic,'1000000000');
});

test('same-side adds are cost-weighted, independent from rounded displayed entry price',()=>{
  const one=step(open(),'BUY','6500000','100000000').position;
  const two=step(one,'BUY','6600000','200000000',context({}, {markPrice:'6600000',indexPrice:'6600000'}));
  assert.equal(two.position.sizeSignedAtomic,'300000000');
  assert.equal(two.position.openCostNumerator,(6500000n*100000000n+6600000n*200000000n).toString());
  assert.equal(two.mark.averageEntryPriceFloorAtomic,'6566666');
  assert.equal(two.mark.averageEntryPriceRemainder,'200000000');
  assert.equal(two.mark.unrealizedPnlAtomic,'1000000000');
});

test('partial LONG close realizes profit and retains exact unrounded remaining cost',()=>{
  const p=step(open(),'BUY').position;
  const partial=step(p,'SELL','6600000','40000000',context({}, {markPrice:'6600000',indexPrice:'6600000'}));
  assert.equal(partial.closedQuantityAtomic,'40000000');
  assert.equal(partial.openedQuantityAtomic,'0');
  assert.equal(partial.position.sizeSignedAtomic,'60000000');
  assert.equal(partial.position.openCostNumerator,'390000000000000');
  assert.equal(partial.realizedDeltaAtomic,'400000000');
  assert.equal(partial.mark.unrealizedPnlAtomic,'600000000');
  assert.equal(partial.mark.realizedPnlAtomic,'400000000');
});

test('full LONG close to FLAT adds last negative PnL and zeroes cost',()=>{
  const p=step(open(),'BUY').position;
  const partial=step(p,'SELL','6600000','40000000',context({}, {markPrice:'6600000',indexPrice:'6600000'}));
  const flat=step(partial.position,'SELL','6400000','60000000',context({}, {markPrice:'6400000',indexPrice:'6400000'}));
  assert.equal(flat.position.sizeSignedAtomic,'0');
  assert.equal(flat.position.openCostNumerator,'0');
  assert.equal(flat.closedQuantityAtomic,'60000000');
  assert.equal(flat.realizedDeltaAtomic,'-600000000');
  assert.equal(flat.mark.realizedPnlAtomic,'-200000000');
  assert.equal(flat.mark.unrealizedPnlAtomic,'0');
});

test('SHORT closes at favorable and unfavorable prices with opposite realized signs',()=>{
  const s=step(open(),'SELL').position;
  const partial=step(s,'BUY','6400000','40000000',context({}, {markPrice:'6400000',indexPrice:'6400000'}));
  assert.equal(partial.realizedDeltaAtomic,'400000000');
  assert.equal(partial.position.sizeSignedAtomic,'-60000000');
  const flat=step(partial.position,'BUY','6600000','60000000',context({}, {markPrice:'6600000',indexPrice:'6600000'}));
  assert.equal(flat.realizedDeltaAtomic,'-600000000');
  assert.equal(flat.mark.realizedPnlAtomic,'-200000000');
  assert.equal(flat.mark.side,'FLAT');
});

test('LONG reversal to SHORT closes old cost then opens only excess at fill price',()=>{
  const p=step(open(),'BUY').position;
  const reversal=step(p,'SELL','6600000','150000000',context({}, {markPrice:'6600000',indexPrice:'6600000'}));
  assert.equal(reversal.closedQuantityAtomic,'100000000');
  assert.equal(reversal.openedQuantityAtomic,'50000000');
  assert.equal(reversal.position.sizeSignedAtomic,'-50000000');
  assert.equal(reversal.position.openCostNumerator,'330000000000000');
  assert.equal(reversal.realizedDeltaAtomic,'1000000000');
  assert.equal(reversal.mark.unrealizedPnlAtomic,'0');
});

test('SHORT reversal to LONG preserves realized profit and resets new entry basis',()=>{
  const short=step(open(),'SELL').position;
  const flipped=step(short,'BUY','6400000','150000000',context({}, {markPrice:'6400000',indexPrice:'6400000'}));
  assert.equal(flipped.position.sizeSignedAtomic,'50000000');
  assert.equal(flipped.position.openCostNumerator,'320000000000000');
  assert.equal(flipped.mark.realizedPnlAtomic,'1000000000');
  assert.equal(flipped.mark.averageEntryPriceFloorAtomic,'6400000');
});

test('exact partial close of non-integral average allocates all residual cost at final close',()=>{
  const c=context({baseDecimals:0,priceDecimals:0,collateralDecimals:0,
    tickSize:'1',lotSize:'1',minQuantity:'1',maxQuantity:'1000',maxOpenInterest:'2000'},
    {indexPrice:'101',markPrice:'101'});
  let p=open(c);
  p=step(p,'BUY','101','2',c).position;
  p=step(p,'BUY','102','1',context(c.config,{markPrice:'102',indexPrice:'102'})).position;
  assert.equal(p.openCostNumerator,'304');
  assert.equal(p.sizeSignedAtomic,'3');
  assert.equal(markPerpPosition(p,context(c.config,{markPrice:'103',indexPrice:'103'})).averageEntryPriceRemainder,'1');
  const first=step(p,'SELL','104','2',context(c.config,{markPrice:'104',indexPrice:'104'}));
  assert.equal(first.position.sizeSignedAtomic,'1');
  assert.equal(first.position.openCostNumerator,'102');
  assert.equal(first.realizedDeltaAtomic,'6');
  const last=step(first.position,'SELL','104','1',context(c.config,{markPrice:'104',indexPrice:'104'}));
  assert.equal(last.realizedDeltaAtomic,'2');
  assert.equal(last.mark.realizedPnlAtomic,'8');
  assert.equal(last.position.openCostNumerator,'0');
});

test('cumulative signed collateral PnL preserves dust across many tiny closes',()=>{
  const c=context({baseDecimals:2,priceDecimals:2,collateralDecimals:0,
    tickSize:'1',lotSize:'1',maxQuantity:'10000',maxOpenInterest:'10000'},
    {indexPrice:'100',markPrice:'100'});
  let p=step(open(c),'BUY','100','10000',c).position;
  let summed=0n;
  for(let i=0;i<100;i++){
    const delta=step(p,'SELL','101','100',context(c.config,{indexPrice:'101',markPrice:'101'}));
    summed+=BigInt(delta.realizedDeltaAtomic);
    p=delta.position;
  }
  assert.equal(summed,1n); // exact 10000 product-unit profit /10000 quote denominator
  assert.equal(p.realizedPnlNumerator,'10000');
  assert.equal(p.openCostNumerator,'0');
});

test('flat positions can reopen without resetting cumulative realized PnL',()=>{
  const p=step(open(),'BUY').position;
  const flat=step(p,'SELL','6600000','100000000',context({}, {markPrice:'6600000',indexPrice:'6600000'})).position;
  const reopened=step(flat,'SELL','6500000').position;
  assert.equal(reopened.realizedPnlNumerator,'10000000000000');
  assert.equal(reopened.sizeSignedAtomic,'-100000000');
  assert.equal(reopened.openCostNumerator,'650000000000000');
});

test('local stale version and immediately duplicated fill ID are rejected',()=>{
  const first=open();const event=fill(first,'BUY');
  const accepted=applyPerpPositionFill(first,event,context());
  assert.throws(()=>applyPerpPositionFill(accepted.position,event,context()),PerpPositionError);
  assert.throws(()=>applyPerpPositionFill(accepted.position,{...event,fillId:unique()},context()),PerpPositionError);
  assert.equal(first.version,0);
  assert.equal(accepted.position.version,1);
});

test('policy or oracle cannot be substituted across chain, revision, market or collateral',()=>{
  const p=open();const event=fill(p,'BUY');
  const invalidCtx=[context({status:'DRAFT'}),context({validUntil:now-1}),
    context({chainId:1}),context({revision:2}),
    context({}, {sourceId:'forged'}),context({}, {market:'ETH-USD-PERP'}),
    context({}, {publishedAt:now-31}),context({}, {publishedAt:now+1}),
    context({}, {markPrice:'7500000'}),context({}, {},{trustedSourceId:'untrusted'}),
    context({}, {},{domain:{chainId:1,verifyingContract:domain.verifyingContract}}),
  ];
  for(const c of invalidCtx)assert.throws(()=>applyPerpPositionFill(p,event,c));
  assert.equal(p.sizeSignedAtomic,'0');
});

test('cross-account/collateral/market/domain, wrong price, tick and amount are rejected',()=>{
  const p=open();
  const bad=[
    {account:other},{market:'ETH-USD-PERP'},
    {collateralToken:'0x4444444444444444444444444444444444444444'},
    {chainId:1},{verifyingContract:'0x4444444444444444444444444444444444444444'},
    {configRevision:2},{priceAtomic:'0'},{priceAtomic:'0x13'},
    {priceAtomic:'6500001'},{priceAtomic:'7500000'},
    {quantityAtomic:'0'},{quantityAtomic:'-1'},
    {quantityAtomic:(1n<<256n).toString()},
    {quantityAtomic:'2000000000000000001'},
    {side:'NONE' as 'BUY'},{executionMode:'LIVE' as 'SIMULATION_ONLY'},
    {fillId:'bad'},{fillId:'0x'+'f'.repeat(64).toUpperCase()},
  ];
  for(const patch of bad){
    assert.throws(()=>applyPerpPositionFill(p,fill(p,'BUY','6500000','100000000',patch),context()),
      JSON.stringify(patch));
  }
});

test('tampered cost, signed size, realized PnL or version fails closed',()=>{
  const good=step(open(),'BUY').position;
  const bad:Partial<PerpPosition>[]=[
    {sizeSignedAtomic:'0'},{openCostNumerator:'0'},
    {openCostNumerator:'-1'},{sizeSignedAtomic:'01'},
    {realizedPnlNumerator:'-0'},{realizedPnlNumerator:(MAX_INT256+1n).toString()},
    {version:-1},{version:0},{lastFillId:null},{configRevision:2},
    {account:other},
  ];
  for(const patch of bad){
    assert.throws(()=>applyPerpPositionFill({...good,...patch},fill(good,'SELL'),context()),
      JSON.stringify(patch));
  }
});

test('position and cost arithmetic rejects oversize unsigned products and signed overflow',()=>{
  const c=context({maxOpenInterest:MAX_UINT256.toString(),maxQuantity:MAX_UINT256.toString(),
    lotSize:'1',minQuantity:'1',tickSize:'1'},
    {indexPrice:'1',markPrice:'1'});
  const p=open(c);
  const first=fill(p,'BUY','1',MAX_INT256.toString());
  const accepted=applyPerpPositionFill(p,first,c).position;
  assert.throws(()=>applyPerpPositionFill(accepted,fill(accepted,'BUY','1','1'),c),PerpPositionError);
  assert.throws(()=>applyPerpPositionFill(p,fill(p,'BUY','2',MAX_INT256.toString()),c),PerpPositionError);
  const hugeShort=fill(p,'SELL','1',MAX_INT256.toString());
  const s=applyPerpPositionFill(p,hugeShort,c).position;
  assert.throws(()=>applyPerpPositionFill(s,fill(s,'SELL','1','2'),c),PerpPositionError);
  assert.equal(accepted.openCostNumerator,MAX_INT256.toString());
});

test('realized int256 limits, max quote result, and wrong mark versions are checked',()=>{
  const p=step(open(),'BUY').position;
  assert.throws(()=>markPerpPosition({...p,realizedPnlNumerator:(MIN_INT256-1n).toString()},context()));
  assert.throws(()=>markPerpPosition(p,context({}, {configRevision:2})));
  const stressCtx=context({baseDecimals:0,priceDecimals:0,collateralDecimals:36,
    lotSize:'1',maxOpenInterest:MAX_UINT256.toString(),maxQuantity:MAX_UINT256.toString(),
    tickSize:'1'}, {markPrice:'1',indexPrice:'1'});
  assert.throws(()=>step(open(stressCtx),'BUY','1','1000000000000000000000000000000000000000000',stressCtx),PerpPositionError);
});

test('test ensures non-consecutive duplicate fill IDs require durable M4-T2 ledger',()=>{
  // Pure state only remembers lastFillId and version; it must never be advertised
  // as a persistent exactly-once guard across arbitrarily many fills/processes.
  const p=open();const one=fill(p,'BUY');
  const a=applyPerpPositionFill(p,one,context()).position;
  const b=applyPerpPositionFill(a,fill(a,'BUY'),context()).position;
  assert.notEqual(b.lastFillId,one.fillId);
  // A caller can submit an old fillId with a NEW expectedVersion, so durable unique
  // fillId claims and atomic DB replay reconciliation are mandatory in M4-T2.
  const forged={...one,expectedVersion:b.version};
  const unsafe=applyPerpPositionFill(b,forged,context());
  assert.equal(unsafe.position.version,b.version+1);
  assert.equal(unsafe.position.sizeSignedAtomic,'300000000');
});
