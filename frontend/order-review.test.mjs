import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createDemoOrderReview,renderDemoOrderReview} from './order-review.mjs';

const html=readFileSync(fileURLToPath(new URL('./trade.html',import.meta.url)),'utf8');
const js=readFileSync(fileURLToPath(new URL('./main.js',import.meta.url)),'utf8');
const css=readFileSync(fileURLToPath(new URL('./trade.css',import.meta.url)),'utf8');

class FakeElement{
  constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.listeners={};
    this.textContent='';this.hidden=true;this.didFocus=false;this.className='';}
  setAttribute(name,value){this.attributes[name]=value;}
  addEventListener(name,handler){this.listeners[name]=handler;}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
  focus(){this.didFocus=true;}
  set innerHTML(value){throw new Error('unsafe innerHTML used: '+value);}
}
const dom={createElement:tag=>new FakeElement(tag)};
const input={market:'BTC',side:'BUY',orderType:'LIMIT',quantity:'0.05',leverage:'3',limitPrice:'60000.25'};

test('UX-HL-02-B1 structured review displays each critical field in a fixed order',()=>{
 const review=createDemoOrderReview(input);
 assert.equal(review.simulated,true);
 assert.equal(review.orderExecutable,false);
 assert.equal(Object.isFrozen(review),true);
 assert.equal(Object.isFrozen(review.rows),true);
 assert.deepEqual(review.rows.map(row=>row.label),[
  '방향','주문 유형','마켓','가격 출처','가격','수량','레버리지','가상 명목가치','참고 증거금',
 ]);
 assert.match(review.rows[0].value,/Long/);
 assert.match(review.rows[1].value,/Limit/);
 assert.equal(review.rows[3].value,'사용자 입력 Limit Price');
 assert.match(review.rows[4].value,/\$60,000\.25/);
 assert.match(review.notice,/서버 전송 0건/);
 assert.match(review.unavailable,/수수료/);
});
test('UX-HL-02-B1 Market/Short uses MOCK label and side independent numeric result',()=>{
 const a=createDemoOrderReview({...input,orderType:'MARKET',side:'SELL'});
 const b=createDemoOrderReview({...input,orderType:'MARKET',side:'BUY'});
 assert.equal(a.rows[0].value,'Short / Sell');
 assert.equal(a.rows[3].value,'MOCK Reference');
 assert.equal(a.rows[4].value,b.rows[4].value);
 assert.notEqual(a.rows[4].value,'$60,000.25');
});
test('UX-HL-02-B1 invalid side and invalid Market/Limit input never creates a review',()=>{
 for(const side of ['LONG','SHORT','',null,1]){
   assert.throws(()=>createDemoOrderReview({...input,side}),RangeError);
 }
 for(const changes of [
  {orderType:'STOP'},{limitPrice:'0'},{limitPrice:'1.333'},
  {quantity:'0'},{quantity:'101'},{leverage:0},{market:'FAKE'},
 ]){
   assert.throws(()=>createDemoOrderReview({...input,...changes}),RangeError);
 }
});
test('UX-HL-02-B1 renderer creates safe text nodes, fixed row count and accessible close',()=>{
 const panel=new FakeElement('div');
 let closed=0;
 const close=renderDemoOrderReview(panel,dom,createDemoOrderReview(input),{
   onClose:()=>{closed++;},
 });
 assert.equal(panel.hidden,false);
 assert.equal(panel.didFocus,true);
 assert.equal(panel.children.length,4);
 const [heading,details,notice]=panel.children;
 assert.equal(heading.children[0].tag,'strong');
 assert.equal(details.tag,'dl');
 assert.equal(details.children.length,9);
 assert.equal(details.children[0].children[0].tag,'dt');
 assert.equal(details.children[0].children[1].tag,'dd');
 assert.equal(close.tag,'button');
 assert.equal(close.type,'button');
 assert.equal(close.attributes['aria-label'],'모의 주문 검토 닫기');
 close.listeners.click();
 assert.equal(closed,1);
 assert.match(notice.textContent,/서버 전송 0건/);
});
test('UX-HL-02-B1 renderer never injects HTML from freeform contents',()=>{
 const panel=new FakeElement('div');
 const review=createDemoOrderReview(input);
 const copy={
  ...review,
  rows:[{label:'<img onerror=alert(1)>',value:'<script>alert(1)</script>'}],
 };
 renderDemoOrderReview(panel,dom,copy);
 const cell=panel.children[1].children[0].children[1];
 assert.equal(cell.textContent,'<script>alert(1)</script>');
 assert.equal(cell.tag,'dd');
});
test('UX-HL-02-B1 missing/malformed renderer arguments fail without DOM work',()=>{
 assert.throws(()=>renderDemoOrderReview(null,dom,{rows:[]}),TypeError);
 assert.throws(()=>renderDemoOrderReview(new FakeElement('div'),null,{rows:[]}),TypeError);
 assert.throws(()=>renderDemoOrderReview(new FakeElement('div'),dom,{rows:null}),TypeError);
});
test('UX-HL-02-B1 inline quantity error is accessible, status review is focusable and dismissible',()=>{
 assert.match(html,/id="quantity"[^>]+aria-describedby="quantity-error"/);
 assert.match(html,/id="quantity-error"[^>]+role="alert" hidden/);
 assert.match(html,/id="limit-price"[^>]+aria-describedby="limit-price-help limit-price-error"/);
 assert.match(html,/id="order-result"[^>]+role="status"[^>]+tabindex="-1"/);
 assert.match(js,/byId\('quantity'\)\.setAttribute\('aria-invalid'/);
 assert.match(js,/byId\('quantity-error'\)\.hidden=!badQuantity/);
 assert.match(js,/byId\('order-result'\)\.addEventListener\('keydown'/);
 assert.match(js,/event\.key==='Escape'/);
 assert.match(js,/dismissDemoReview/);
 assert.match(css,/\.preview-review-details/);
 assert.match(css,/\.preview-review-close:focus-visible/);
});
test('UX-HL-02-B1 demo blocks real execution; stale preview is reset on form changes',()=>{
 assert.match(js,/event\.preventDefault\(\)/);
 assert.match(js,/renderDemoOrderReview\(panel,document,review/);
 assert.match(js,/byId\('order-result'\)\.hidden=true/);
 assert.match(js,/view\.orderType=type/);
 assert.match(html,/LOCAL PREVIEW · NO EXECUTION/);
 assert.match(html,/connect-src 'none'/);
 for(const forbidden of ['fetch(', 'XMLHttpRequest','WebSocket','eth_sendTransaction']){
  assert.equal(js.includes(forbidden),false);
 }
});
