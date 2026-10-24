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
  const quantity = typeof value === 'string' && value.trim() !== '' ? Number(value) : Number(value);
  return Number.isFinite(quantity) && quantity >= 0.0001 && quantity <= 100;
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
