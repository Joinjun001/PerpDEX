import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {ACCOUNT_TABS,ACCOUNT_STATES,accountTabIndexForKey,accountViewFor} from './account-tabs-model.mjs';
import {initAccountTabs} from './account-tabs.js';

const markup=readFileSync(fileURLToPath(new URL('./trade.html',import.meta.url)),'utf8');
const css=readFileSync(fileURLToPath(new URL('./trade.css',import.meta.url)),'utf8');
class FakeElement {
  constructor(){this.attributes={};this.tabIndex=0;this.hidden=false;
    this.dataset={};this.listeners={};this.focused=false;
    this.classList={toggle:(key,on)=>{this.classes.set(key,on);}};
    this.classes=new Map();}
  setAttribute(name,value){this.attributes[name]=value;}
  getAttribute(name){return this.attributes[name];}
  addEventListener(name,callback){this.listeners[name]=callback;}
  focus(){this.focused=true;}
  getBoundingClientRect(){return {left:0,right:400};}
  replaceChildren(...children){this.children=[...children];}
  fire(name,event={}){this.listeners[name]?.(event);}
}
function fixture(){
  const byId=new Map(),selectors=new Map();
  for(const {id} of ACCOUNT_TABS){
    for(const prefix of ['account-tab-','account-panel-'])byId.set(prefix+id,new FakeElement());
    for(const field of ['data-account-title','data-account-description','data-account-view']){
      selectors.set('['+field+'="'+id+'"]',new FakeElement());
    }
    selectors.set('#account-panel-'+id+' tbody',new FakeElement());
    selectors.set('#account-panel-'+id+' table',new FakeElement());
    const wrapper=new FakeElement();
    wrapper.clientWidth=300;
    wrapper.scrollWidth=700;
    wrapper.tabIndex=-1;
    wrapper.removeAttribute=()=>{};
    selectors.set('#account-panel-'+id+' .account-table-scroll',wrapper);
    const hint=new FakeElement();
    hint.id='account-table-hint-'+id;
    hint.hidden=true;
    byId.set(hint.id,hint);
  }
  const scroller=new FakeElement();
  scroller.clientWidth=400;scroller.scrollWidth=400;scroller.scrollLeft=0;
  selectors.set('.account-tab-scroll',scroller);
  return {root:{
    getElementById:(id)=>byId.get(id),
    querySelector:(selector)=>selectors.get(selector),
  },byId,selectors};
}
test('UX-HL-01-B: 5 unique ARIA tabs and associated panel headings exist',()=>{
  assert.equal(ACCOUNT_TABS.length,5);
  assert.equal(new Set(ACCOUNT_TABS.map(t=>t.id)).size,5);
  assert.match(markup,/role="tablist" aria-label="계정 거래 현황"/);
  for(const {id,label} of ACCOUNT_TABS){
    assert.match(markup,new RegExp('id="account-tab-'+id+'"[^>]*role="tab"[^>]*>'+label+'</button>'));
    assert.match(markup,new RegExp('id="account-panel-'+id+'"[^>]*role="tabpanel"[^>]*aria-labelledby="account-tab-'+id+'"'));
    assert.match(markup,new RegExp('data-account-title="'+id+'"'));
    assert.match(markup,new RegExp('data-account-description="'+id+'"'));
  }
  assert.equal((markup.match(/role="tab"/g)||[]).length,5);
  assert.equal((markup.match(/role="tabpanel"/g)||[]).length,5);
  assert.equal((markup.match(/aria-selected="true"/g)||[]).length,1);
  assert.equal((markup.match(/id="account-tab-[^"]+"[^>]*tabindex="-1"/g)||[]).length,4);
  assert.equal((markup.match(/role="tabpanel"[^>]*hidden/g)||[]).length,4);
});
test('UX-HL-01-B: tab content contains real column definitions, never fabricated rows',()=>{
  const headings=[
    'Unrealized PnL','Liq. Price','Original','Filled','Remaining',
    'Fill Price','Funding Rate','Payment','Status',
  ];
  for(const label of headings)assert.ok(markup.includes('<th scope="col">'+label+'</th>'),label);
  assert.equal((markup.match(/<tbody><\/tbody>/g)||[]).length,5);
  assert.doesNotMatch(markup,/data-account-state="empty"|data-account-state="error"/);
  assert.match(markup,/ACCOUNT DATA UNAVAILABLE/);
});
test('UX-HL-01-B: arrow keys wrap, Home/End select endpoints, unrelated keys pass through',()=>{
  assert.equal(accountTabIndexForKey('ArrowRight',4),0);
  assert.equal(accountTabIndexForKey('ArrowLeft',0),4);
  assert.equal(accountTabIndexForKey('Home',3),0);
  assert.equal(accountTabIndexForKey('End',1),4);
  assert.equal(accountTabIndexForKey('Tab',2),null);
  assert.equal(accountTabIndexForKey('Enter',2),null);
  assert.throws(()=>accountTabIndexForKey('ArrowRight',-1),RangeError);
  assert.throws(()=>accountTabIndexForKey('Home',5),RangeError);
});
test('UX-HL-01-B: account state distinctions never imply data without a connected query',()=>{
  assert.deepEqual(ACCOUNT_STATES,['disconnected','loading','empty','error']);
  for(const {id} of ACCOUNT_TABS){
    const disconnected=accountViewFor(id,'disconnected');
    const loading=accountViewFor(id,'loading');
    const empty=accountViewFor(id,'empty');
    const error=accountViewFor(id,'error');
    assert.match(disconnected.title,/지갑이 연결되지 않았습니다/);
    assert.match(loading.title,/불러오는 중/);
    assert.match(empty.description,/조회가 성공/);
    assert.match(error.description,/요청이 실패/);
    assert.equal(new Set([disconnected.title,loading.title,empty.title,error.title]).size,4);
    for(const value of [disconnected,loading,empty,error])assert.deepEqual(value.records,[]);
  }
  assert.throws(()=>accountViewFor('unknown','disconnected'),RangeError);
  assert.throws(()=>accountViewFor('positions','unauthorized'),RangeError);
});
test('UX-HL-01-B: roving-tabindex click and keyboard actions focus only active panel',()=>{
  const {root,byId,selectors}=fixture();
  const controller=initAccountTabs(root);
  const getTab=id=>byId.get('account-tab-'+id);
  const getPanel=id=>byId.get('account-panel-'+id);
  assert.equal(controller.selectedTab,'positions');
  for(const [i,{id}] of ACCOUNT_TABS.entries()){
    assert.equal(getTab(id).attributes['aria-selected'],String(i===0));
    assert.equal(getTab(id).tabIndex,i===0?0:-1);
    assert.equal(getPanel(id).hidden,i!==0);
    assert.equal(selectors.get('[data-account-view="'+id+'"]').dataset.accountState,'disconnected');
    assert.match(selectors.get('[data-account-title="'+id+'"]').textContent,/지갑/);
  }
  getTab('trade-history').fire('click');
  assert.equal(controller.selectedTab,'trade-history');
  assert.equal(getTab('trade-history').tabIndex,0);
  assert.equal(getPanel('positions').hidden,true);
  let prevented=0;
  getTab('trade-history').fire('keydown',{key:'ArrowRight',preventDefault:()=>{prevented++;}});
  assert.equal(controller.selectedTab,'funding-history');
  assert.equal(getTab('funding-history').focused,true);
  getTab('funding-history').fire('keydown',{key:'ArrowRight',preventDefault:()=>{prevented++;}});
  assert.equal(controller.selectedTab,'positions');
  getTab('positions').fire('keydown',{key:'End',preventDefault:()=>{prevented++;}});
  assert.equal(controller.selectedTab,'funding-history');
  getTab('funding-history').fire('keydown',{key:'Home',preventDefault:()=>{prevented++;}});
  assert.equal(controller.selectedTab,'positions');
  getTab('positions').fire('keydown',{key:'Tab',preventDefault:()=>{prevented++;}});
  assert.equal(controller.selectedTab,'positions');
  assert.equal(prevented,4);
});
test('UX-HL-01-B: responsive account region is scrollable and inactive panel hidden',()=>{
  assert.match(css,/\.account-tab-scroll[\s\S]*?overflow-x:auto/);
  assert.match(css,/\.account-tab-panel\[hidden\]\{display:none!important\}/);
  assert.match(css,/\.account-table-scroll[\s\S]*?overflow-x:auto/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(markup,/id="portfolio"/);
  assert.match(markup,/src="\.\/account-tabs\.js"/);
  assert.match(markup,/connect-src 'none'/);
});
