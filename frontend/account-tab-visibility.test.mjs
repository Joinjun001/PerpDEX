import test from 'node:test';
import assert from 'node:assert/strict';
import {initAccountTabs} from './account-tabs.js';
import {ACCOUNT_TABS} from './account-tabs-model.mjs';

class FakeElement{
  constructor(){
    this.attributes={};this.listeners={};this.dataset={};this.hidden=false;
    this.textContent='';this.tabIndex=0;this.focused=false;
    this.classList={toggle:()=>{}};
  }
  setAttribute(name,value){this.attributes[name]=String(value);}
  addEventListener(event,listener){this.listeners[event]=listener;}
  replaceChildren(...children){this.children=children;}
  focus(options){this.focused=true;this.focusOptions=options;}
  fire(event,detail={}){
    let prevented=false;
    this.listeners[event]({
      ...detail,preventDefault:()=>{prevented=true;},
    });
    return prevented;
  }
}
function createFixture(width=210){
  const widths=[112,140,152,140,160];
  const offsets=widths.map((_,i)=>widths.slice(0,i).reduce((a,b)=>a+b,0));
  const total=widths.reduce((a,b)=>a+b,0);
  const scroller=new FakeElement();
  scroller.scrollWidth=total;scroller.clientWidth=width;scroller.scrollLeft=0;
  scroller.getBoundingClientRect=()=>({left:0,right:width});
  const nodes=new Map(),selectors=new Map();
  selectors.set('.account-tab-scroll',scroller);
  for(const [i,{id}] of ACCOUNT_TABS.entries()){
    const tab=new FakeElement(),panel=new FakeElement();
    tab.getBoundingClientRect=()=>({
      left:offsets[i]-scroller.scrollLeft,
      right:offsets[i]+widths[i]-scroller.scrollLeft,
    });
    nodes.set('account-tab-'+id,tab);
    nodes.set('account-panel-'+id,panel);
    for(const field of ['data-account-title','data-account-description','data-account-view']){
      selectors.set('['+field+'="'+id+'"]',new FakeElement());
    }
    selectors.set('#account-panel-'+id+' tbody',new FakeElement());
    selectors.set('#account-panel-'+id+' table',new FakeElement());
  }
  const root={
    getElementById:id=>nodes.get(id),
    querySelector:selector=>selectors.get(selector),
  };
  const getTab=id=>nodes.get('account-tab-'+id);
  const visible=id=>{
    const r=getTab(id).getBoundingClientRect();
    return r.left>=0 && r.right<=width;
  };
  return {root,nodes,scroller,getTab,visible,total,width};
}
test('UX-HL-03-A1: initial active Positions visible, other tabs not activated',()=>{
  const f=createFixture(),view=initAccountTabs(f.root);
  assert.equal(view.selectedTab,'positions');
  assert.equal(f.scroller.scrollLeft,0);
  assert.equal(f.visible('positions'),true);
  assert.equal(f.getTab('positions').attributes['aria-selected'],'true');
  assert.equal(f.getTab('open-orders').attributes['aria-selected'],'false');
});
test('UX-HL-03-A1: click an offscreen Funding History reveals right clipped edge',()=>{
  const f=createFixture(),view=initAccountTabs(f.root);
  assert.equal(f.visible('funding-history'),false);
  f.getTab('funding-history').fire('click');
  assert.equal(view.selectedTab,'funding-history');
  assert.equal(f.visible('funding-history'),true);
  assert.equal(f.scroller.scrollLeft,f.total-f.width);
  assert.equal(f.getTab('funding-history').attributes['aria-selected'],'true');
  assert.equal(f.getTab('positions').tabIndex,-1);
  assert.equal(f.nodes.get('account-panel-positions').hidden,true);
});
test('UX-HL-03-A1: Home/End and arrows wrap while preserving focus and visibility',()=>{
  const f=createFixture(),view=initAccountTabs(f.root);
  const key=(id,value)=>{
    const tab=f.getTab(id);
    assert.equal(tab.fire('keydown',{key:value}),true);
    assert.equal(f.visible(view.selectedTab),true,view.selectedTab);
    assert.equal(f.getTab(view.selectedTab).focused,true);
    assert.deepEqual(f.getTab(view.selectedTab).focusOptions,{preventScroll:true});
  };
  key('positions','End');
  assert.equal(view.selectedTab,'funding-history');
  key('funding-history','Home');
  assert.equal(view.selectedTab,'positions');
  assert.equal(f.scroller.scrollLeft,0);
  key('positions','ArrowLeft');
  assert.equal(view.selectedTab,'funding-history');
  key('funding-history','ArrowRight');
  assert.equal(view.selectedTab,'positions');
});
test('UX-HL-03-A1: next offscreen and previous clipped tabs trigger minimal scrolling',()=>{
  const f=createFixture(),view=initAccountTabs(f.root);
  view.activate(1);
  assert.equal(view.selectedTab,'open-orders');
  assert.equal(f.visible('open-orders'),true);
  const right=f.scroller.scrollLeft;
  assert.ok(right>0 && right<f.total-f.width);
  view.activate(2);
  assert.ok(f.scroller.scrollLeft>right);
  assert.equal(f.visible('order-history'),true);
  view.activate(1);
  assert.equal(f.visible('open-orders'),true);
  view.activate(0);
  assert.equal(f.scroller.scrollLeft,0);
  assert.equal(f.visible('positions'),true);
});
test('UX-HL-03-A1: desktop without overflow never alters horizontal scroll',()=>{
  const f=createFixture(900),view=initAccountTabs(f.root);
  f.scroller.scrollLeft=0;
  view.activate(4,true);
  assert.equal(f.scroller.scrollLeft,0);
  assert.equal(f.getTab('funding-history').focused,true);
  assert.equal(view.selectedTab,'funding-history');
});
test('UX-HL-03-A1: unrelated keys and malformed selection preserve active account tab',()=>{
  const f=createFixture(),view=initAccountTabs(f.root);
  const before=f.scroller.scrollLeft;
  assert.equal(f.getTab('positions').fire('keydown',{key:'Tab'}),false);
  assert.equal(view.selectedTab,'positions');
  assert.equal(f.scroller.scrollLeft,before);
  assert.throws(()=>view.activate(ACCOUNT_TABS.length),RangeError);
  assert.equal(view.selectedTab,'positions');
});
test('UX-HL-03-A1: missing scrollbar markup fails before wiring inert navigation',()=>{
  const f=createFixture(),original=f.root.querySelector;
  f.root.querySelector=selector=>selector==='.account-tab-scroll'?null:original(selector);
  assert.throws(()=>initAccountTabs(f.root),/Account tab scroll container missing/);
});
test('UX-HL-03-A1: no forged account records, network, or browser-page vertical scrolling',()=>{
  const f=createFixture(),view=initAccountTabs(f.root);
  view.activate(4,true);
  for(const {id} of ACCOUNT_TABS){
    assert.equal(f.nodes.get('account-panel-'+id).hidden,id!==view.selectedTab);
  }
  assert.equal(f.nodes.get('account-panel-funding-history').hidden,false);
  assert.equal(f.getTab('funding-history').focusOptions.preventScroll,true);
});
