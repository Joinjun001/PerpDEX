import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {MARKETS,previewEstimate,validPreviewLimitPrice,previewOrderEstimate} from './preview-model.mjs';

const read=(name)=>readFileSync(fileURLToPath(new URL('./'+name,import.meta.url)),'utf8');
const html=read('trade.html');
const js=read('main.js');
const css=read('trade.css');
const base={market:'BTC',quantity:'0.05',leverage:3};
const calc=(overrides={})=>previewOrderEstimate({...base,...overrides});

test('UX-HL-02-A market defaults to mock reference and preserves legacy quantity/leverage estimate',()=>{
 for(const market of Object.keys(MARKETS)){
   const original=previewEstimate(market,'0.05',3);
   const result=calc({market});
   assert.equal(result.orderType,'MARKET');
   assert.equal(result.priceSource,'MOCK_REFERENCE');
   assert.equal(result.price,MARKETS[market].price);
   assert.equal(result.referencePrice,MARKETS[market].price);
   assert.equal(result.notional,original.notional);
   assert.equal(result.indicativeMargin,original.indicativeMargin);
   assert.equal(result.orderExecutable,false);
   assert.equal(result.executionGuaranteed,false);
   assert.equal(result.feesConfigured,false);
   assert.equal(Object.isFrozen(result),true);
 }
});
test('UX-HL-02-A limit price affects notional and demo margin, not underlying sample price',()=>{
 const order=calc({orderType:'LIMIT',limitPrice:'60000.25'});
 assert.equal(order.price,60000.25);
 assert.equal(order.referencePrice,65240.50);
 assert.ok(Math.abs(order.notional-3000.0125)<1e-8);
 assert.ok(Math.abs(order.indicativeMargin-1000.0041666666667)<1e-10);
 assert.equal(order.priceSource,'USER_LIMIT');
 assert.equal(order.executionGuaranteed,false);
 assert.equal(order.simulated,true);
});
test('UX-HL-02-A bidirectional side only changes preview action, not price math',()=>{
 const a=calc({orderType:'LIMIT',limitPrice:'20000.00'});
 const b=calc({orderType:'LIMIT',limitPrice:'20000.00'});
 assert.deepEqual(a,b);
 assert.equal(a.notional,1000);
});
test('UX-HL-02-A rejects malformed/non-positive/unsafe limit prices without coercion',()=>{
 for(const price of ['', ' ', '0','-0.1','-1','0.001','1.234','123.456','01','00.1',
   '1e4','Infinity','NaN','1,000','1 USD','0x10','1000000000.01',
   '9999999999','.',null,undefined,100,0,[],{},'2e999']){
   assert.equal(validPreviewLimitPrice(price),false,String(price));
   assert.throws(()=>calc({orderType:'LIMIT',limitPrice:price}),RangeError);
 }
});
test('UX-HL-02-A permits boundaries and canonical 1 or 2 decimal places',()=>{
 for(const price of ['0.01','0.1','1','100','65240.50','1000000000']){
   assert.equal(validPreviewLimitPrice(price),true,price);
   assert.equal(calc({orderType:'LIMIT',limitPrice:price}).price,Number(price));
 }
 assert.throws(()=>calc({orderType:'STOP',limitPrice:'100'}),RangeError);
});
test('UX-HL-02-A invalid qty/leverage/market still fail for either order mode',()=>{
 for(const orderType of ['MARKET','LIMIT']){
   const limitPrice='100.20';
   for(const quantity of ['', '0','-0.1','1e999','101',null]){
     assert.throws(()=>calc({orderType,quantity,limitPrice}),RangeError);
   }
   for(const leverage of [0,11,'xx',2.5]){
     assert.throws(()=>calc({orderType,leverage,limitPrice}),RangeError);
   }
   assert.throws(()=>calc({orderType,market:'FAKE',limitPrice}),RangeError);
 }
});
test('UX-HL-02-C1: both Market and Limit preview reject malformed quantity coercion',()=>{
 for(const orderType of ['MARKET','LIMIT']){
  for(const quantity of ['0x1',true,[1],{valueOf:()=>1},' 0.1 ']){
   assert.throws(()=>calc({orderType,quantity,limitPrice:'60000'}),RangeError);
  }
 }
});
test('UX-HL-02-A order UI offers accessible type selector and hidden-by-default Limit input',()=>{
 for(const id of ['market-type','limit-type','limit-price-field','limit-price','limit-price-help','limit-price-error','preview-price-label']){
   assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/id="market-type"[^>]+aria-pressed="true"/);
 assert.match(html,/id="limit-type"[^>]+aria-pressed="false"/);
 assert.match(html,/id="limit-price-field"[^>]*hidden/);
 assert.match(html,/id="limit-price"[^>]*inputmode="decimal"[^>]*disabled/);
 assert.match(html,/id="limit-price-error"[^>]*role="alert"[^>]*hidden/);
 assert.match(html,/role="group" aria-label="모의 주문 유형"/);
 assert.match(html,/connect-src 'none'/);
 assert.match(css,/\.limit-price-field\[hidden\]/);
});
test('UX-HL-02-A type changes and market changes recalculate preview without network',()=>{
 assert.match(js,/orderType:'MARKET'/);
 assert.match(js,/view\.orderType=type/);
 assert.match(js,/byId\('limit-price'\)\.value=m\.price\.toFixed\(2\)/);
 assert.match(js,/byId\('limit-price'\)\.disabled=!isLimit/);
 assert.match(js,/byId\('limit-price-field'\)\.hidden=!isLimit/);
 assert.match(js,/byId\('preview-order'\)/);
 assert.match(js,/previewOrderEstimate\(/);
 assert.match(js,/validPreviewLimitPrice\(/);
 assert.match(js,/byId\('preview-price-label'\)/);
 assert.match(js,/byId\('order-result'\)\.hidden=true/);
 assert.doesNotMatch(js,/\bfetch\(|XMLHttpRequest|WebSocket|eth_sendTransaction/);
});
test('UX-HL-02-A landing/account tabs and preview-only submission remain separate',()=>{
 assert.match(html,/id="account-tab-positions"/);
 assert.match(html,/id="order-form"/);
 assert.match(html,/SIMULATION PREVIEW/);
 assert.match(js,/event\.preventDefault\(\)/);
 assert.match(read('order-review.mjs'),/서버 전송 0건/);
 assert.doesNotMatch(read('index.html'),/id="order-form"/);
});
