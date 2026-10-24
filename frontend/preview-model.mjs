/**
 * Static UX preview model. Values below are synthetic fixtures, not market data.
 * This module has no network, wallet, contract, database or order-execution API.
 */
export const MARKETS = Object.freeze({
  BTC: Object.freeze({symbol:'BTC',icon:'₿',price:65240.50,change:2.41,depthStep:15.5,decimals:2,seed:19}),
  ETH: Object.freeze({symbol:'ETH',icon:'◆',price:3405.20,change:1.18,depthStep:1.7,decimals:2,seed:47}),
  SOL: Object.freeze({symbol:'SOL',icon:'◎',price:148.75,change:-0.82,depthStep:0.12,decimals:2,seed:85}),
});
export const FORMAT_USD = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
export const FORMAT_QTY = new Intl.NumberFormat('en-US',{minimumFractionDigits:3,maximumFractionDigits:4});
export function validPreviewQuantity(value){
  // Accept only native numeric input strings or finite number primitives.
  // Number() on arbitrary values silently accepts booleans, hex, arrays,
  // valueOf() objects and whitespace, none of which represent user quantity.
  if(typeof value!=='number'&&
     (typeof value!=='string'||! /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(value))){
    return false;
  }
  const quantity=Number(value);
  return Number.isFinite(quantity)&&quantity>=0.0001&&quantity<=100;
}
export function previewEstimate(market,quantity,leverage){
  if(!MARKETS[market])throw new RangeError('Unknown simulation market');
  if(!validPreviewQuantity(quantity))throw new RangeError('Demo quantity must be between 0.0001 and 100');
  const lev=Number(leverage);
  if(!Number.isInteger(lev)||lev<1||lev>10)throw new RangeError('Invalid demo leverage');
  const price=MARKETS[market].price;
  const notional=Number(quantity)*price;
  const indicativeMargin=notional/lev;
  if(!Number.isFinite(indicativeMargin))throw new RangeError('Invalid estimate');
  return Object.freeze({market,quantity:Number(quantity),leverage:lev,price,notional,indicativeMargin,
    simulated:true,orderExecutable:false,feesConfigured:false});
}
/**
 * UX-HL-02-A presentation-only preview. No matching/tick/risk policy is implied.
 */
export function validPreviewLimitPrice(value){
  if(typeof value!=='string'||!/^(?:0|[1-9][0-9]*)(?:[.][0-9]{1,2})?$/.test(value))
    return false;
  const price=Number(value);
  return Number.isFinite(price)&&price>=0.01&&price<=1000000000;
}
export function previewOrderEstimate({market,orderType='MARKET',quantity,leverage,limitPrice}){
  if(orderType!=='MARKET'&&orderType!=='LIMIT')
    throw new RangeError('Unsupported demo order type');
  const sample=previewEstimate(market,quantity,leverage);
  if(orderType==='LIMIT'&&!validPreviewLimitPrice(limitPrice))
    throw new RangeError('Enter a positive Limit Price in USD (up to 2 decimals)');
  const price=orderType==='LIMIT'?Number(limitPrice):sample.price;
  const notional=sample.quantity*price;
  const indicativeMargin=notional/sample.leverage;
  if(!Number.isFinite(notional)||!Number.isFinite(indicativeMargin))
    throw new RangeError('Invalid simulated order estimate');
  return Object.freeze({
    ...sample,orderType,referencePrice:sample.price,price,
    priceSource:orderType==='LIMIT'?'USER_LIMIT':'MOCK_REFERENCE',
    notional,indicativeMargin,executionGuaranteed:false,
  });
}
/**
 * Accessible sample summary, derived only from synthetic chart points.
 * It never asserts real times, live OHLC, exchange range or price-feed data.
 */
export function describeSampleChart(market,points){
  if(!Object.hasOwn(MARKETS,market)||!Array.isArray(points)||
     points.length<4||points.length>1000||
     points.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<=0)){
    throw new RangeError('Invalid synthetic sample summary');
  }
  const low=Math.min(...points),high=Math.max(...points);
  const last=points.at(-1);
  return Object.freeze({
    market,count:points.length,low,high,last,
    accessibilityText:
      market+'-USD-PERP 고정 생성 샘플 '+points.length+'개. '+
      '샘플 최저 '+FORMAT_USD.format(low)+', 최고 '+FORMAT_USD.format(high)+
      ', 마지막 '+FORMAT_USD.format(last)+'. '+
      '실제 시간축이나 실시간 시세, 거래 또는 오라클 가격이 아닙니다.',
  });
}
export function sampleChart(market,count=64){
  const item=MARKETS[market];
  if(!item)throw new RangeError('Unknown market');
  if(!Number.isInteger(count)||count<4||count>1000)throw new RangeError('Invalid sample count');
  const trend=item.change<0?-1:1;
  return Array.from({length:count},(_,i)=>{
    const time=i/(count-1);
    const wave=(Math.sin(i*.56+item.seed)*.23+Math.sin(i*.21+item.seed)*.5+
      Math.sin(i*1.13+item.seed)*.13)*.007;
    const trendValue=trend*(time-1)*.014;
    return item.price*(1+trendValue+wave*(1-time));
  });
}
