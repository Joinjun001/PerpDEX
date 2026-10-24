import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {ACCOUNT_TABS} from './account-tabs-model.mjs';
import {initAccountTableScrollHints,shouldShowAccountTableHint} from './account-table-scroll-hint.mjs';

const html=readFileSync(fileURLToPath(new URL('./trade.html',import.meta.url)),'utf8');
const css=readFileSync(fileURLToPath(new URL('./trade.css',import.meta.url)),'utf8');

class E{
  constructor(id=''){
    this.id=id;this.hidden=false;this.tabIndex=-1;
    this.scrollWidth=900;this.clientWidth=330;this.attributes={};
  }
  setAttribute(k,v){this.attributes[k]=String(v);}
  removeAttribute(k){delete this.attributes[k];}
}
function fixture({mobile=true,selected='positions',tableVisible=true,overflow=true}={}){
  const nodes=new Map(),selectors=new Map(),callbacks={};
  let resized=0,removed=0;
  const media={
    matches:mobile,
    addEventListener:(type,fn)=>callbacks.media=fn,
    removeEventListener:(type,fn)=>{removed++;},
  };
  const view={
    matchMedia:query=>{
      assert.equal(query,'(max-width: 760px)');
      return media;
    },
    addEventListener:(name,fn)=>{callbacks[name]=fn;},
    removeEventListener:(name,fn)=>{removed++;},
    ResizeObserver:class {
      constructor(fn){callbacks.resizeObserver=fn;this.observed=[];}
      observe(element){this.observed.push(element);resized++;}
      disconnect(){removed++;}
    },
    MutationObserver:class {
      constructor(fn){callbacks.mutationObserver=fn;this.observed=[];}
      observe(el,options){this.observed.push({el,options});}
      disconnect(){removed++;}
    },
  };
  for(const {id} of ACCOUNT_TABS){
    const panel=new E('account-panel-'+id);
    panel.hidden=id!==selected;
    const table=new E('table-'+id);
    table.hidden=!tableVisible;
    const scroll=new E('scroll-'+id);
    scroll.scrollWidth=overflow?900:330;
    const hint=new E('account-table-hint-'+id);
    hint.hidden=true;
    nodes.set(panel.id,panel);
    nodes.set(hint.id,hint);
    selectors.set('#account-panel-'+id+' .account-table-scroll',scroll);
    selectors.set('#account-panel-'+id+' table',table);
  }
  const root={
    defaultView:view,
    getElementById:id=>nodes.get(id),
    querySelector:query=>selectors.get(query),
  };
  const row=id=>({
    panel:nodes.get('account-panel-'+id),
    table:selectors.get('#account-panel-'+id+' table'),
    scroll:selectors.get('#account-panel-'+id+' .account-table-scroll'),
    hint:nodes.get('account-table-hint-'+id),
  });
  return {root,media,view,row,callbacks,getObserved:()=>resized,getRemoved:()=>removed};
}
test('B1 pure rules reject desktop, disconnected tables, unselected panels and no overflow',()=>{
  const base={mobile:true,selected:true,visible:true,scrollWidth:900,clientWidth:330};
  assert.equal(shouldShowAccountTableHint(base),true);
  for(const fields of [
    {mobile:false},{selected:false},{visible:false},{scrollWidth:330},
    {scrollWidth:331},{clientWidth:0},{scrollWidth:Infinity},
    {clientWidth:NaN},{mobile:undefined},
  ])assert.equal(shouldShowAccountTableHint({...base,...fields}),false,JSON.stringify(fields));
  assert.equal(shouldShowAccountTableHint({...base,scrollWidth:331.5}),true);
});
test('B1 static disconnected tables are hidden: no hints, no inert keyboard focus',()=>{
  const f=fixture({tableVisible:false});
  const ctl=initAccountTableScrollHints(f.root);
  for(const {id} of ACCOUNT_TABS){
    const x=f.row(id);
    assert.equal(x.hint.hidden,true);
    assert.equal(x.scroll.tabIndex,-1);
    assert.equal(x.scroll.attributes['aria-describedby'],undefined);
  }
  assert.equal(f.getObserved(),10);
  assert.equal(typeof ctl.update,'function');
  ctl.dispose();
  assert.equal(f.getRemoved(),4);
});
test('B1 show hint and keyboard focus only for selected, visible, overflowing mobile table',()=>{
  const f=fixture(),ctl=initAccountTableScrollHints(f.root);
  const position=f.row('positions');
  assert.equal(position.hint.hidden,false);
  assert.equal(position.scroll.tabIndex,0);
  assert.equal(position.scroll.attributes['aria-describedby'],position.hint.id);
  for(const {id} of ACCOUNT_TABS.filter(x=>x.id!=='positions')){
    const x=f.row(id);
    assert.equal(x.hint.hidden,true);
    assert.equal(x.scroll.tabIndex,-1);
  }
  ctl.dispose();
});
test('B1 clearing overflow on resize hides previously visible hint and restores no tab stop',()=>{
  const f=fixture(),ctl=initAccountTableScrollHints(f.root);
  const x=f.row('positions');
  x.scroll.scrollWidth=x.scroll.clientWidth;
  f.callbacks.resizeObserver();
  assert.equal(x.hint.hidden,true);
  assert.equal(x.scroll.tabIndex,-1);
  assert.equal(x.scroll.attributes['aria-describedby'],undefined);
  ctl.dispose();
});
test('B1 desktop breakpoint and return to mobile reacts to media change',()=>{
  const f=fixture(),ctl=initAccountTableScrollHints(f.root);
  const x=f.row('positions');
  f.media.matches=false;
  f.callbacks.media();
  assert.equal(x.hint.hidden,true);
  f.media.matches=true;
  f.callbacks.media();
  assert.equal(x.hint.hidden,false);
  ctl.dispose();
});
test('B1 hidden table and selected tab transitions update without implying backend data',()=>{
  const f=fixture(),ctl=initAccountTableScrollHints(f.root);
  const pos=f.row('positions'),orders=f.row('open-orders');
  pos.table.hidden=true;
  f.callbacks.mutationObserver();
  assert.equal(pos.hint.hidden,true);
  pos.table.hidden=false;
  pos.panel.hidden=true;
  orders.panel.hidden=false;
  f.callbacks.mutationObserver();
  assert.equal(pos.hint.hidden,true);
  assert.equal(orders.hint.hidden,false);
  assert.equal(orders.scroll.tabIndex,0);
  ctl.dispose();
});
test('B1 missing specific DOM element refuses to attach misleading hint',()=>{
  const f=fixture();
  f.root.getElementById=id=>id==='account-table-hint-positions'?null:
    f.row(id.replace('account-panel-',''))?.panel;
  assert.throws(()=>initAccountTableScrollHints(f.root),/Incomplete account table overflow hint markup/);
});
test('B1 optional observers do not prevent safe startup, update and disposal',()=>{
  const f=fixture();
  f.root.defaultView={matchMedia:()=>({matches:true})};
  const ctl=initAccountTableScrollHints(f.root);
  assert.equal(f.row('positions').hint.hidden,false);
  f.row('positions').scroll.scrollWidth=330;
  ctl.update();
  assert.equal(f.row('positions').hint.hidden,true);
  assert.doesNotThrow(()=>ctl.dispose());
  f.row('positions').scroll.scrollWidth=900;
  ctl.update();
  assert.equal(f.row('positions').hint.hidden,true);
});
test('B1 HTML supplies five hidden hints and existing read-only empty tables',()=>{
  for(const {id} of ACCOUNT_TABS){
    assert.match(html,new RegExp('id="account-table-hint-'+id+'"[^>]*hidden'));
    assert.match(html,new RegExp('id="account-panel-'+id+'"'));
  }
  assert.equal((html.match(/class="account-table-hint" hidden/g)||[]).length,5);
  assert.equal((html.match(/<tbody><\/tbody>/g)||[]).length,5);
  assert.match(html,/지갑 · 백엔드 미연결/);
  assert.match(html,/connect-src 'none'/);
});
test('B1 accessible visible hint has explicit label and keyboard focus styling',()=>{
  assert.match(html,/표를 좌우로 스크롤해 확인하세요/);
  assert.match(css,/\.account-table-hint\[hidden\]\{display:none!important\}/);
  assert.match(css,/\.account-table-scroll:focus-visible/);
  const script=readFileSync(fileURLToPath(new URL('./account-table-scroll-hint.mjs',import.meta.url)),'utf8');
  assert.doesNotMatch(script,/fetch\(|eth_requestAccounts|eth_sendTransaction|WebSocket|XMLHttpRequest/);
  assert.match(script,/attributeFilter:\['hidden'\]/);
});
