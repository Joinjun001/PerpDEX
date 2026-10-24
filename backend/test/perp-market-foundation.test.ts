import test from 'node:test';
import assert from 'node:assert/strict';
import {collateralNotional,decimalScale,int256,uint256,mulDivSigned,mulDivUnsigned,
  FixedPointError,MAX_UINT256,MIN_INT256,MAX_INT256} from '../src/perp/fixed-point.ts';
import {validatePerpMarketConfig,validatePerpOrderUnits,MarketConfigError,
  type PerpMarketConfig} from '../src/perp/market-config.ts';
import {validateMockPriceSnapshot,PriceSnapshotError,
  type PerpPriceSnapshot} from '../src/perp/price-snapshot.ts';

const DOMAIN={chainId:11155111,verifyingContract:'0x1111111111111111111111111111111111111111'};
const TRUSTED='local-test-policy-registry';
const NOW=1800000000;
function config(changes:Record<string,unknown>={}): PerpMarketConfig {
  return {market:'BTC-USD-PERP',baseAsset:'BTC',quoteAsset:'USD',
    collateralToken:'0x3333333333333333333333333333333333333333',
    chainId:DOMAIN.chainId,verifyingContract:DOMAIN.verifyingContract,
    sourceId:TRUSTED,oracleSourceId:'local-mock-oracle',revision:1,status:'APPROVED',
    validFrom:NOW-100,validUntil:NOW+1000,
    baseDecimals:8,priceDecimals:2,collateralDecimals:6,
    tickSize:'5',lotSize:'100',minQuantity:'100',maxQuantity:'1000000000000000',
    maxOpenInterest:'2000000000000000',initialMarginBps:1000,
    maintenanceMarginBps:500,maxLeverage:10,maxPriceDeviationBps:300,
    maxConfidenceBps:200,maxOracleAgeSeconds:30,...changes} as PerpMarketConfig;
}
function approved(changes:Record<string,unknown>={}){
  return validatePerpMarketConfig(config(changes),DOMAIN,TRUSTED,NOW);
}
function snapshot(changes:Record<string,unknown>={}):PerpPriceSnapshot{
  return {chainId:DOMAIN.chainId,verifyingContract:DOMAIN.verifyingContract,
    market:'BTC-USD-PERP',configRevision:1,sourceId:'local-mock-oracle',
    indexPrice:'6500000',markPrice:'6510000',publishedAt:NOW-1,sourceSequence:'10',
    confidenceBps:20,...changes} as PerpPriceSnapshot;
}

test('canonical unsigned/signed uint256 and int256 precision boundaries',()=>{
  assert.equal(uint256(MAX_UINT256.toString()),MAX_UINT256);
  assert.equal(int256(MIN_INT256.toString()),MIN_INT256);
  assert.equal(int256(MAX_INT256.toString()),MAX_INT256);
  for(const text of ['01','-1','+1',' 10','10.0','1e5','',1,'0x10',MAX_UINT256+1n]){
    assert.throws(()=>uint256(text),FixedPointError);
  }
  for(const text of ['-0','-01','+1',' 5','1.2',(MAX_INT256+1n).toString(),(MIN_INT256-1n).toString()]){
    assert.throws(()=>int256(text),FixedPointError);
  }
  assert.throws(()=>uint256('0','amount',true),FixedPointError);
});

test('exact unsigned mulDiv honors explicit DOWN/UP rounding',()=>{
  assert.equal(mulDivUnsigned(10n,7n,3n,'DOWN'),23n);
  assert.equal(mulDivUnsigned(10n,7n,3n,'UP'),24n);
  assert.equal(mulDivUnsigned(MAX_UINT256,1n,1n,'DOWN'),MAX_UINT256);
  assert.equal(mulDivUnsigned(MAX_UINT256,MAX_UINT256,MAX_UINT256,'DOWN'),MAX_UINT256);
  assert.equal(mulDivUnsigned(0n,10n,3n,'UP'),0n);
  for(const args of [[-1n,1n,1n],[1n,1n,0n],[MAX_UINT256+1n,1n,1n]]){
    assert.throws(()=>mulDivUnsigned(args[0],args[1],args[2],'DOWN'),FixedPointError);
  }
  assert.throws(()=>mulDivUnsigned(MAX_UINT256,2n,1n,'UP'),FixedPointError);
  assert.throws(()=>mulDivUnsigned(1n,1n,1n,'UNKNOWN' as 'DOWN'),FixedPointError);
});

test('signed mulDiv preserves PnL signs, truncation and exact overflow boundaries',()=>{
  assert.equal(mulDivSigned(-10n,1n,3n,'TOWARD_ZERO'),-3n);
  assert.equal(mulDivSigned(-10n,1n,3n,'AWAY_FROM_ZERO'),-4n);
  assert.equal(mulDivSigned(10n,-1n,3n,'AWAY_FROM_ZERO'),-4n);
  assert.equal(mulDivSigned(-10n,-1n,3n,'TOWARD_ZERO'),3n);
  assert.equal(mulDivSigned(MIN_INT256,1n,1n,'TOWARD_ZERO'),MIN_INT256);
  assert.throws(()=>mulDivSigned(MIN_INT256,-1n,1n,'TOWARD_ZERO'),FixedPointError);
  assert.throws(()=>mulDivSigned(MAX_INT256,2n,1n,'TOWARD_ZERO'),FixedPointError);
  assert.throws(()=>mulDivSigned(1n,1n,0n,'TOWARD_ZERO'),FixedPointError);
  assert.throws(()=>mulDivSigned(1n,1n,1n,'DOWN' as 'TOWARD_ZERO'),FixedPointError);
});

test('notional calculation uses explicit base/price/collateral scales, no Number conversions',()=>{
  const units={baseDecimals:8,priceDecimals:2,collateralDecimals:6};
  assert.equal(collateralNotional('100000000','6500000',units,'DOWN'),'65000000000');
  assert.equal(collateralNotional('100000000','6500000',units,'UP'),'65000000000');
  assert.equal(collateralNotional('10000','1',units,'DOWN'),'1');
  const huge='900719925474099300000000';
  const precise=collateralNotional(huge,'99999999',units,'UP');
  assert.equal(BigInt(precise),(BigInt(huge)*99999999n*1000000n+9999999999n)/(100000000n*100n));
  assert.equal(decimalScale(0),1n);
  assert.equal(decimalScale(36),10n**36n);
  assert.throws(()=>decimalScale(37),FixedPointError);
  assert.throws(()=>decimalScale(2.5),FixedPointError);
  assert.throws(()=>collateralNotional('1','1',{baseDecimals:18,priceDecimals:18,collateralDecimals:6},'DOWN'),FixedPointError);
  assert.throws(()=>collateralNotional(MAX_UINT256.toString(),MAX_UINT256.toString(),
    {baseDecimals:0,priceDecimals:0,collateralDecimals:0},'UP'),FixedPointError);
  assert.throws(()=>collateralNotional('1','1',units,'NO' as 'DOWN'),FixedPointError);
});

test('trusted explicitly approved market config validates complete units and scope',()=>{
  const c=approved();
  assert.equal(c.market,'BTC-USD-PERP');assert.equal(c.initialMarginBps,1000);
  assert.equal(c.collateralDecimals,6);
  assert.equal(approved({maxLeverage:5}).maxLeverage,5); // stricter cap than max allowed by IM
  assert.throws(()=>approved({maxLeverage:11}),MarketConfigError); // 11x violates 10% IM
  assert.ok(Object.isFrozen(c));
  validatePerpOrderUnits(c,'6500000','100000000');
});

test('market config cannot be approved by a self-declared or expired source',()=>{
  const invalid:Array<Record<string,unknown>>=[
    {status:'DRAFT'},{status:'REVOKED'},{status:undefined},
    {sourceId:'untrusted'},{sourceId:''},{revision:0},
    {validFrom:NOW+1},{validUntil:NOW},{validUntil:NOW-5},
    {chainId:1},{verifyingContract:'0x4444444444444444444444444444444444444444'},
    {oracleSourceId:''},{oracleSourceId:'../../../../../secrets'},
    {market:'ETH-USD-PERP'},{baseAsset:'ETH'},{baseAsset:'USD'},{quoteAsset:'USD$'},
    {collateralToken:'0x0000000000000000000000000000000000000000'},
    {collateralToken:'not-an-address'},
  ];
  for(const change of invalid){
    assert.throws(()=>approved(change),JSON.stringify(change));
  }
  assert.throws(()=>validatePerpMarketConfig(config(),DOMAIN,'untrusted-registry',NOW),MarketConfigError);
  assert.throws(()=>validatePerpMarketConfig(config(),{...DOMAIN,chainId:1},TRUSTED,NOW),MarketConfigError);
  assert.throws(()=>validatePerpMarketConfig(null,DOMAIN,TRUSTED,NOW),MarketConfigError);
});

test('config rejects inconsistent tick/lot/limits or invented risk defaults',()=>{
  const changes:Array<Record<string,unknown>>=[
    {baseDecimals:37},{priceDecimals:-1},{collateralDecimals:1.3},
    {tickSize:'0'},{tickSize:'01'},{lotSize:'0'},{lotSize:'01'},
    {minQuantity:'50'},{maxQuantity:'101'},{minQuantity:'20000000000000000'},
    {maxOpenInterest:'100'},
    {initialMarginBps:0},{initialMarginBps:10001},
    {maintenanceMarginBps:1000},{maintenanceMarginBps:0},
    {maxLeverage:0},{maxLeverage:11},{maxLeverage:1001},
    {maxPriceDeviationBps:10001},{maxConfidenceBps:-1},
    {maxOracleAgeSeconds:0},{maxOracleAgeSeconds:3601},
  ];
  for(const change of changes)assert.throws(()=>approved(change),JSON.stringify(change));
});

test('order price tick, position lot, size and uint256 constraints fail closed',()=>{
  const c=approved();
  for(const [price,qty] of [['6500001','100'],['6500000','101'],['6500000','0'],
    ['0','100'],['6500000','99'],['6500000','1000000000000100'],['-1','100'],['1e5','100']]){
    assert.throws(()=>validatePerpOrderUnits(c,price,qty),`${price}/${qty}`);
  }
  assert.doesNotThrow(()=>validatePerpOrderUnits(c,'5','100'));
});

test('a valid trusted oracle snapshot accepts mark/index with bounded confidence and freshness',()=>{
  const p=validateMockPriceSnapshot(snapshot(),approved(),DOMAIN,NOW);
  assert.ok(Object.isFrozen(p));assert.equal(p.indexPrice,'6500000');
  assert.equal(p.markPrice,'6510000');
  const next=validateMockPriceSnapshot(snapshot({sourceSequence:'11',publishedAt:NOW}),approved(),DOMAIN,NOW,p);
  assert.equal(next.sourceSequence,'11');
});

test('snapshot rejects stale or future timestamps and insufficient confidence',()=>{
  const variants:Array<Record<string,unknown>>=[
    {publishedAt:NOW+1},{publishedAt:NOW-31},{publishedAt:0},
    {confidenceBps:201},{confidenceBps:-1},{confidenceBps:2.4},
    {sourceSequence:'0'},{sourceSequence:'01'},{sourceSequence:'-1'},
    {indexPrice:'0'},{markPrice:'0'},{markPrice:'01'},
    {indexPrice:MAX_UINT256+1n},
  ];
  for(const change of variants) assert.throws(()=>validateMockPriceSnapshot(snapshot(change),approved(),DOMAIN,NOW));
  assert.doesNotThrow(()=>validateMockPriceSnapshot(snapshot({publishedAt:NOW-30}),approved(),DOMAIN,NOW));
});

test('oracle refuses wrong market, source, config revision, chain and excessive mark deviation',()=>{
  for(const change of [{chainId:1},{market:'ETH-USD-PERP'},
    {verifyingContract:'0x4444444444444444444444444444444444444444'},
    {sourceId:'fake-oracle'},{configRevision:2},
    {markPrice:'7500000'},{markPrice:'5000000'}]){
    assert.throws(()=>validateMockPriceSnapshot(snapshot(change),approved(),DOMAIN,NOW),JSON.stringify(change));
  }
  assert.throws(()=>validateMockPriceSnapshot(snapshot(),approved(),{...DOMAIN,chainId:1},NOW),PriceSnapshotError);
});

test('oracle sequence rollback, same ID, timestamp reorg, or cross-market previous are invalid',()=>{
  const c=approved(),first=validateMockPriceSnapshot(snapshot(),c,DOMAIN,NOW);
  for(const change of [{sourceSequence:'10'},{sourceSequence:'9'},
    {sourceSequence:'11',publishedAt:NOW-2}]){
    assert.throws(()=>validateMockPriceSnapshot(snapshot(change),c,DOMAIN,NOW,first));
  }
  assert.throws(()=>validateMockPriceSnapshot(snapshot({sourceSequence:'11'}),c,DOMAIN,NOW,
    {...first,market:'OTHER-PERP'}),PriceSnapshotError);
});

test('no on-chain or HTTP effects; precision calculation is deterministic for repeated local inputs',()=>{
  const c=approved();const p=validateMockPriceSnapshot(snapshot(),c,DOMAIN,NOW);
  const result=collateralNotional('100000000',p.markPrice,c,'UP');
  assert.equal(result,'65100000000');
  assert.equal(collateralNotional('100000000',p.markPrice,c,'UP'),result);
});
