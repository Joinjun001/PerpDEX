import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {ACCOUNT_TABS} from './account-tabs-model.mjs';
import {createAccountQueryCoordinator} from './account-query-contract.mjs';
import {
 renderAccountTabSnapshot,renderAccountTabsFromCoordinator,
} from './account-tabs-renderer.mjs';

const ACCOUNT='0x1111111111111111111111111111111111111111';
const CHAIN=11155111;
const ctx={account:ACCOUNT,chainId:CHAIN,source:'LOCAL_DB'};
const dataRow=(tab,id='r1')=>{
 const common={id,account:ACCOUNT,chainId:CHAIN,market:'BTC-USD-PERP'};
 if(tab==='positions')return {...common,side:'LONG',sizeAtomic:'100',marginAtomic:'40'};
 if(tab==='open-orders')return {...common,side:'BUY',status:'OPEN',
  quantityAtomic:'10',filledQuantityAtomic:'2',remainingQuantityAtomic:'8'};
 if(tab==='order-history')return {...common,side:'BUY',status:'CANCELED',
  quantityAtomic:'10',filledQuantityAtomic:'2'};
 if(tab==='trade-history')return {...common,side:'BUY',
  fillPriceAtomic:'65000000',fillQuantityAtomic:'1'};
 if(tab==='funding-history')return {...common,paymentSignedAtomic:'-25'};
 throw Error('unknown test tab');
};
const response=(token,records=[],revision=1)=>({
 chainId:token.chainId,account:token.account,source:token.source,
 tab:token.tab,requestId:token.requestId,records,revision,
});
class Element {
 constructor(tag='div'){
  this.tag=tag;this.children=[];this.hidden=false;this.dataset={};
  this.textContent='';this._writes=[];
 }
 replaceChildren(...items){this.children=items;this._writes.push('replaceChildren');}
 appendChild(item){
  this.children.push(...(item.tag==='fragment'?item.children:[item]));
 }
 set innerHTML(_){throw Error('Unsafe HTML parser invoked');}
 get innerHTML(){throw Error('Do not read serialized untrusted HTML');}
}
function fixture(){
 const nodes=new Map();
 for(const {id} of ACCOUNT_TABS){
  nodes.set('[data-account-title="'+id+'"]',new Element('strong'));
  nodes.set('[data-account-description="'+id+'"]',new Element('p'));
  nodes.set('[data-account-view="'+id+'"]',new Element('div'));
  nodes.set('#account-panel-'+id+' tbody',new Element('tbody'));
  nodes.set('#account-panel-'+id+' table',new Element('table'));
 }
 return {
  root:{
   querySelector:(selector)=>nodes.get(selector),
   createElement:(tag)=>new Element(tag),
   createDocumentFragment:()=>new Element('fragment'),
  },
  read(tab,key){
   return nodes.get(key==='body'?'#account-panel-'+tab+' tbody':
    key==='table'?'#account-panel-'+tab+' table':
    '[data-account-'+key+'="'+tab+'"]');
  },
 };
}
test('B2-B2-A static renderer starts disconnected and refuses unverified ready data',()=>{
 const f=fixture();
 const malicious={state:'ready',records:[dataRow('positions')]};
 const state=renderAccountTabSnapshot(f.root,'positions',malicious);
 assert.equal(state,'disconnected');
 assert.equal(f.read('positions','body').children.length,0);
 assert.equal(f.read('positions','table').hidden,true);
 assert.match(f.read('positions','title').textContent,/지갑이 연결되지/);
 assert.equal(f.read('positions','view').dataset.accountState,'disconnected');
});
test('B2-B2-A distinct loading/empty/error states retain empty tables',()=>{
 const f=fixture();
 for(const state of ['loading','empty','error']){
  const displayed=renderAccountTabSnapshot(f.root,'positions',{state},
   {allowValidatedRecords:true});
  assert.equal(displayed,state);
  assert.equal(f.read('positions','body').children.length,0);
  assert.equal(f.read('positions','table').hidden,true);
  assert.equal(f.read('positions','view').hidden,false);
  assert.equal(f.read('positions','view').dataset.accountState,state);
 }
 assert.match(f.read('positions','title').textContent,/가져오지 못했습니다/);
});
test('B2-B2-A accepted coordinator snapshots render only fixed known columns',()=>{
 const f=fixture(),gate=createAccountQueryCoordinator();
 gate.connect(ctx);
 for(const {id} of ACCOUNT_TABS){
  const token=gate.begin(id);
  assert.equal(gate.accept(token,response(token,[dataRow(id)])),true);
 }
 const states=renderAccountTabsFromCoordinator(f.root,gate,{allowValidatedRecords:true});
 for(const {id} of ACCOUNT_TABS){
  assert.equal(states[id],'ready');
  const tbody=f.read(id,'body');
  assert.equal(tbody.children.length,1);
  assert.equal(f.read(id,'table').hidden,false);
  assert.equal(f.read(id,'view').hidden,true);
  const row=tbody.children[0];
  assert.ok(row.children.length>=5);
  assert.equal(row.children[0].textContent,'BTC-USD-PERP');
  assert.ok(row.children.every(c=>c.tag==='td'));
 }
 assert.equal(f.read('positions','body').children[0].children[2].textContent,
  '100 (atomic)');
 assert.equal(f.read('positions','body').children[0].children[3].textContent,'—');
 assert.equal(f.read('funding-history','body').children[0].children[3].textContent,
  '-25 (atomic)');
});
test('B2-B2-A no HTML parsing or server-supplied column list can control output',()=>{
 const f=fixture();
 const injection='<img src=x onerror=alert(1)>';
 const record={...dataRow('positions'),market:injection,
  dangerouslySetInnerHTML:injection,extra:'<script>alert(1)</script>'};
 const displayed=renderAccountTabSnapshot(f.root,'positions',
  {state:'ready',records:[record]},{allowValidatedRecords:true});
 assert.equal(displayed,'ready');
 const line=f.read('positions','body').children[0];
 assert.equal(line.children[0].textContent,injection);
 assert.equal(line.children.length,9);
 assert.equal(f.read('positions','view').hidden,true);
});
test('B2-B2-A missing/empty ready records fail closed without stale rows',()=>{
 const f=fixture(),row=dataRow('positions');
 renderAccountTabSnapshot(f.root,'positions',{state:'ready',records:[row]},
  {allowValidatedRecords:true});
 const state=renderAccountTabSnapshot(f.root,'positions',
  {state:'ready',records:[]},{allowValidatedRecords:true});
 assert.equal(state,'error');
 assert.equal(f.read('positions','body').children.length,0);
 assert.equal(f.read('positions','table').hidden,true);
 assert.equal(f.read('positions','view').dataset.accountState,'error');
});
test('UX-HL-03-C1 malformed ready records fail closed as an error state, not a render crash',()=>{
 const f=fixture(),good=dataRow('positions');
 const cases=[null,42,'broken'];
 for(const bad of cases){
   assert.equal(renderAccountTabSnapshot(f.root,'positions',
     {state:'ready',records:[good]},{allowValidatedRecords:true}),'ready');
   assert.equal(renderAccountTabSnapshot(f.root,'positions',
     {state:'ready',records:[bad]},{allowValidatedRecords:true}),'error');
   assert.equal(f.read('positions','body').children.length,0,'stale account rows cleared');
   assert.equal(f.read('positions','table').hidden,true);
   assert.equal(f.read('positions','view').hidden,false);
   assert.equal(f.read('positions','view').dataset.accountState,'error');
   assert.match(f.read('positions','title').textContent,/가져오지 못했습니다/);
 }
});

test('UX-HL-03-C1 throwing record accessor never crashes account UI or leaks rows',()=>{
 const f=fixture();
 const record={...dataRow('open-orders')};
 Object.defineProperty(record,'side',{get(){throw Error('invalid external record');}});
 const state=renderAccountTabSnapshot(f.root,'open-orders',
   {state:'ready',records:[dataRow('open-orders'),record]},{allowValidatedRecords:true});
 assert.equal(state,'error');
 assert.equal(f.read('open-orders','body').children.length,0);
 assert.equal(f.read('open-orders','table').hidden,true);
 assert.equal(f.read('open-orders','view').hidden,false);
 assert.equal(f.read('open-orders','view').dataset.accountState,'error');
 // Later trusted snapshots can still render after a malformed one.
 assert.equal(renderAccountTabSnapshot(f.root,'open-orders',
   {state:'ready',records:[dataRow('open-orders')]},{allowValidatedRecords:true}),'ready');
 assert.equal(f.read('open-orders','body').children.length,1);
});
test('B2-B2-A stale response, newer failure and disconnect clear previous rows',()=>{
 const f=fixture(),gate=createAccountQueryCoordinator();
 gate.connect(ctx);
 const first=gate.begin('open-orders');
 assert.equal(gate.accept(first,response(first,[dataRow('open-orders')],2)),true);
 renderAccountTabsFromCoordinator(f.root,gate,{allowValidatedRecords:true});
 assert.equal(f.read('open-orders','body').children.length,1);
 const older=gate.begin('open-orders'),latest=gate.begin('open-orders');
 assert.equal(gate.accept(older,response(older,[dataRow('open-orders','old')],3)),false);
 renderAccountTabsFromCoordinator(f.root,gate,{allowValidatedRecords:true});
 assert.equal(f.read('open-orders','view').dataset.accountState,'loading');
 assert.equal(f.read('open-orders','body').children.length,0);
 assert.equal(gate.fail(latest),true);
 renderAccountTabsFromCoordinator(f.root,gate,{allowValidatedRecords:true});
 assert.equal(f.read('open-orders','view').dataset.accountState,'error');
 gate.disconnect();
 renderAccountTabsFromCoordinator(f.root,gate,{allowValidatedRecords:true});
 assert.equal(f.read('open-orders','view').dataset.accountState,'disconnected');
 assert.equal(f.read('open-orders','body').children.length,0);
});
test('B2-B2-A invalid duplicate or wrong-chain responses must never appear',()=>{
 const f=fixture(),gate=createAccountQueryCoordinator();
 gate.connect(ctx);
 const token=gate.begin('trade-history');
 assert.equal(gate.accept(token,response(token,[dataRow('trade-history','A'),
  dataRow('trade-history','A')])),false);
 renderAccountTabsFromCoordinator(f.root,gate,{allowValidatedRecords:true});
 assert.equal(f.read('trade-history','view').dataset.accountState,'error');
 assert.equal(f.read('trade-history','body').children.length,0);
 const next=gate.begin('trade-history');
 assert.equal(gate.accept(next,response(next,[{...dataRow('trade-history'),
  chainId:1}])),false);
 renderAccountTabsFromCoordinator(f.root,gate,{allowValidatedRecords:true});
 assert.equal(f.read('trade-history','body').children.length,0);
});
test('UX-HL-03-E1 unreadable ready state fails closed and removes stale account rows',()=>{
 const f=fixture();
 assert.equal(renderAccountTabSnapshot(f.root,'positions',
   {state:'ready',records:[dataRow('positions')]},{allowValidatedRecords:true}),'ready');
 const broken={get state(){throw Error('snapshot state unavailable');}};
 assert.equal(renderAccountTabSnapshot(f.root,'positions',broken,
   {allowValidatedRecords:true}),'error');
 assert.equal(f.read('positions','body').children.length,0);
 assert.equal(f.read('positions','table').hidden,true);
 assert.equal(f.read('positions','view').dataset.accountState,'error');
 assert.match(f.read('positions','title').textContent,/가져오지 못했습니다/);
});
test('UX-HL-03-E1 unreadable record collection clears stale rows and can recover',()=>{
 const f=fixture();
 assert.equal(renderAccountTabSnapshot(f.root,'open-orders',
   {state:'ready',records:[dataRow('open-orders')]},{allowValidatedRecords:true}),'ready');
 const broken={state:'ready',get records(){throw Error('record collection unavailable');}};
 assert.equal(renderAccountTabSnapshot(f.root,'open-orders',broken,
   {allowValidatedRecords:true}),'error');
 assert.equal(f.read('open-orders','body').children.length,0);
 assert.equal(f.read('open-orders','table').hidden,true);
 assert.equal(f.read('open-orders','view').dataset.accountState,'error');
 assert.equal(renderAccountTabSnapshot(f.root,'open-orders',
   {state:'ready',records:[dataRow('open-orders')]},{allowValidatedRecords:true}),'ready');
 assert.equal(f.read('open-orders','body').children.length,1);
});
test('UX-HL-03-D1 coordinator read failure clears all previously visible account rows',()=>{
 const f=fixture(),gate=createAccountQueryCoordinator();
 gate.connect(ctx);
 for(const {id} of ACCOUNT_TABS){
  const token=gate.begin(id);
  assert.equal(gate.accept(token,response(token,[dataRow(id)])),true);
 }
 renderAccountTabsFromCoordinator(f.root,gate,{allowValidatedRecords:true});
 for(const {id} of ACCOUNT_TABS)assert.equal(f.read(id,'body').children.length,1);
 const unstable={get(tab){
  if(tab==='trade-history')throw Error('account provider session lost');
  return gate.get(tab);
 }};
 const results=renderAccountTabsFromCoordinator(f.root,unstable,{allowValidatedRecords:true});
 for(const {id} of ACCOUNT_TABS){
  assert.equal(results[id],'error',id);
  assert.equal(f.read(id,'body').children.length,0,id+' stale rows deleted');
  assert.equal(f.read(id,'table').hidden,true);
  assert.equal(f.read(id,'view').dataset.accountState,'error');
  assert.match(f.read(id,'title').textContent,/가져오지 못했습니다/);
 }
});

test('UX-HL-03-D1 without validated-record permission provider errors stay disconnected',()=>{
 const f=fixture();
 const unreadable={get(){throw Error('no trusted account session');}};
 const statuses=renderAccountTabsFromCoordinator(f.root,unreadable);
 for(const {id} of ACCOUNT_TABS){
  assert.equal(statuses[id],'disconnected',id);
  assert.equal(f.read(id,'body').children.length,0);
  assert.equal(f.read(id,'table').hidden,true);
  assert.equal(f.read(id,'view').dataset.accountState,'disconnected');
 }
});
test('B2-B2-A visible UI never enables authenticated adapter or real account data',()=>{
 const html=readFileSync(fileURLToPath(new URL('./trade.html',import.meta.url)),'utf8');
 const tabs=readFileSync(fileURLToPath(new URL('./account-tabs.js',import.meta.url)),'utf8');
 const css=readFileSync(fileURLToPath(new URL('./trade.css',import.meta.url)),'utf8');
 assert.match(tabs,/renderAccountTabSnapshot\(root,ACCOUNT_TABS\[i\]\.id,\{state:'disconnected'\}\)/);
 assert.doesNotMatch(tabs,/allowValidatedRecords:true|connect\(|fetch\(|eth_requestAccounts/);
 assert.match(html,/connect-src 'none'/);
 assert.match(css,/\.account-empty\[hidden\][\s\S]*?display:none!important/);
 assert.equal((html.match(/<tbody><\/tbody>/g)||[]).length,5);
});
test('B2-B2-A all field projection lengths match actual HTML column counts',()=>{
 const html=readFileSync(fileURLToPath(new URL('./trade.html',import.meta.url)),'utf8');
 const f=fixture();
 const gate=createAccountQueryCoordinator();gate.connect(ctx);
 for(const {id} of ACCOUNT_TABS){
  const token=gate.begin(id);
  gate.accept(token,response(token,[dataRow(id)]));
 }
 renderAccountTabsFromCoordinator(f.root,gate,{allowValidatedRecords:true});
 for(const {id} of ACCOUNT_TABS){
  const tableBlock=html.match(new RegExp('id="account-panel-'+id+'"([\\s\\S]*?)<\\/table>'));
  assert.ok(tableBlock,'missing table '+id);
  const headers=[...tableBlock[1].matchAll(/<th scope="col">/g)].length;
  assert.equal(f.read(id,'body').children[0].children.length,headers,id);
 }
});
