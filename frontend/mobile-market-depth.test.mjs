import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {initMobileMarketDepth} from './mobile-market-depth.js';

const read=name=>readFileSync(fileURLToPath(new URL('./'+name,import.meta.url)),'utf8');
const html=read('trade.html'),css=read('trade.css'),script=read('mobile-market-depth.js');
class Element{
  constructor(){
    this.hidden=false;this.dataset={};this.attributes={};
    this.textContent='';this.listeners={};
  }
  setAttribute(key,value){this.attributes[key]=value;}
  getAttribute(key){return this.attributes[key];}
  addEventListener(name,fn){this.listeners[name]=fn;}
  click(){this.listeners.click?.();}
}
function fixture(){
  const names=['market-depth','market-depth-toggle','market-depth-toggle-status',
    'market-depth-surface'];
  const nodes=new Map(names.map(n=>[n,new Element()]));
  nodes.get('market-depth-toggle').hidden=true;
  return {nodes,root:{getElementById:id=>nodes.get(id)},
    element:id=>nodes.get(id)};
}
test('UX-HL-01-D1 initial DOM is progressive-enhancement-safe',()=>{
  assert.match(html,/id="market-depth"/);
  assert.match(html,/id="market-depth-toggle"[^>]*type="button"[^>]*hidden/);
  assert.match(html,/aria-controls="market-depth-surface"/);
  assert.match(html,/aria-expanded="true"/);
  assert.match(html,/id="market-depth-surface"[^>]*class="panel market-depth-surface"/);
  assert.match(html,/id="market-depth-book"[^>]*class="panel orderbook-panel"/);
  assert.match(html,/id="market-depth-trades"[^>]*class="panel trade-log-panel"/);
  assert.match(html,/src="\.\/mobile-market-depth\.js"/);
  assert.doesNotMatch(html,/data-mobile-collapsed="true"/);
});
test('UX-HL-01-D1 boot collapses mobile depth only after button is wired',()=>{
  const f=fixture(),button=f.element('market-depth-toggle');
  assert.equal(button.hidden,true);
  assert.equal(f.element('market-depth').dataset.mobileCollapsed,undefined);
  const controller=initMobileMarketDepth(f.root);
  assert.equal(controller.expanded,false);
  assert.equal(button.hidden,false);
  assert.equal(button.getAttribute('aria-expanded'),'false');
  assert.equal(f.element('market-depth').dataset.mobileCollapsed,'true');
  assert.equal(f.element('market-depth-toggle-status').textContent,'펼치기');
  assert.equal(typeof button.listeners.click,'function');
});
test('UX-HL-01-D1 repeated click and programmatic state updates remain consistent',()=>{
  const f=fixture(),button=f.element('market-depth-toggle');
  const controller=initMobileMarketDepth(f.root);
  button.click();
  assert.equal(controller.expanded,true);
  assert.equal(button.getAttribute('aria-expanded'),'true');
  assert.equal(f.element('market-depth').dataset.mobileCollapsed,'false');
  assert.equal(f.element('market-depth-toggle-status').textContent,'접기');
  button.click();
  assert.equal(controller.expanded,false);
  assert.equal(button.getAttribute('aria-expanded'),'false');
  controller.setExpanded(true);
  assert.equal(controller.expanded,true);
  controller.setExpanded(false);
  assert.equal(controller.expanded,false);
});
test('UX-HL-01-D1 missing markup aborts before exposing inert control',()=>{
  for(const missing of ['market-depth','market-depth-toggle','market-depth-toggle-status',
    'market-depth-surface']){
    const f=fixture();
    f.nodes.delete(missing);
    assert.throws(()=>initMobileMarketDepth(f.root),/Incomplete mobile market-depth markup/);
    if(missing!=='market-depth-toggle')
      assert.equal(f.element('market-depth-toggle').hidden,true);
  }
});
test('UX-HL-01-D1 responsive CSS hides only at mobile breakpoint, never desktop',()=>{
  const appended=css.slice(css.indexOf('/* UX-HL-01-D1:'));
  assert.ok(appended.startsWith('/* UX-HL-01-D1'));
  assert.match(appended,/\.trade-shell \.market-depth-toggle\{display:none\}/);
  assert.match(appended,/@media\(max-width:760px\)/);
  assert.match(appended,/\.market-depth-toggle:not\(\[hidden\]\)/);
  assert.match(appended,/min-height:44px/);
  assert.match(appended,/grid-column:1 \/ -1/);
  assert.match(appended,/\.market-column\[data-mobile-collapsed="true"\]>\.market-depth-surface/);
  assert.match(appended,/display:none!important/);
  const outsideMobile=appended.slice(0,appended.indexOf('@media(max-width:760px)'));
  assert.doesNotMatch(outsideMobile,/\.market-depth-surface/);
  assert.match(css,/grid-template-areas:"chart" "ticket" "book"/);
});
test('UX-HL-01-D1 demo remains offline, accessible and keeps market and order UI',()=>{
  for(const id of ['market-chart','order-form','market-picker','orderbook-title',
    'recent-title','account-tab-positions']){
    assert.ok(html.includes('id="'+id+'"'),id);
  }
  assert.match(html,/SYNTHETIC LIQUIDITY/);
  assert.match(html,/GENERATED EXAMPLES/);
  assert.match(html,/connect-src 'none'/);
  assert.doesNotMatch(script,/fetch\(|XMLHttpRequest|WebSocket|eth_requestAccounts|eth_sendTransaction/);
  assert.match(script,/if\(typeof document!=='undefined'\)initMobileMarketDepth\(document\)/);
});
