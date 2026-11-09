import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {initMarketDepthTabs} from './market-depth-tabs.js';
import {initMobileMarketDepth} from './mobile-market-depth.js';

const read=name=>readFileSync(fileURLToPath(new URL('./'+name,import.meta.url)),'utf8');
const html=read('trade.html'),css=read('trade.css'),tabsSource=read('market-depth-tabs.js');

class FakeElement {
  constructor(id){this.id=id;this.hidden=false;this.tabIndex=0;this.dataset={};
    this.attrs={};this.listeners={};this.focusCount=0;this.textContent='';
    this.classes=new Set();this.classList={
      toggle:(key,enabled)=>enabled?this.classes.add(key):this.classes.delete(key),
      contains:key=>this.classes.has(key),
    };
  }
  setAttribute(k,v){this.attrs[k]=String(v);}
  getAttribute(k){return this.attrs[k]??null;}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  focus(){this.focusCount++;}
  fire(type,key){
    const event={key,prevented:false,preventDefault(){this.prevented=true;}};
    for(const fn of this.listeners[type]??[])fn(event);
    return event;
  }
}
function fixture(){
  const ids=['market-depth','market-depth-surface','market-depth-tablist',
    'market-depth-tab-book','market-depth-tab-trades','market-depth-book',
    'market-depth-trades','market-depth-toggle','market-depth-toggle-status'];
  const nodes=new Map(ids.map(id=>[id,new FakeElement(id)]));
  nodes.get('market-depth-tablist').hidden=true;
  nodes.get('market-depth-toggle').hidden=true;
  return {root:{getElementById:id=>nodes.get(id)},nodes,
    byId:id=>nodes.get(id)};
}

test('UX-HL-06-C1 no JavaScript leaves both sample panels accessible',()=>{
  const f=fixture();
  assert.equal(f.byId('market-depth-tablist').hidden,true);
  assert.equal(f.byId('market-depth-toggle').hidden,true);
  assert.equal(f.byId('market-depth-book').hidden,false);
  assert.equal(f.byId('market-depth-trades').hidden,false);
  assert.match(html,/id="market-depth-book"[^>]*role="region" aria-labelledby="orderbook-title"/);
  assert.match(html,/id="market-depth-trades"[^>]*role="region" aria-labelledby="recent-title"/);
  assert.match(html,/id="market-depth-tablist"[^>]*role="tablist"[^>]*hidden/);
  assert.match(html,/aria-controls="market-depth-book"/);
  assert.match(html,/aria-controls="market-depth-trades"/);
  assert.match(html,/MOCK_SAMPLE/);
  assert.match(html,/SYNTHETIC LIQUIDITY/);
  assert.match(html,/GENERATED EXAMPLES/);
  assert.match(html,/connect-src 'none'/);
});

test('UX-HL-06-C1 tab click synchronizes ARIA, focus order and panel visibility',()=>{
  const f=fixture(),control=initMarketDepthTabs(f.root);
  const book=f.byId('market-depth-tab-book'),trades=f.byId('market-depth-tab-trades');
  const bookPanel=f.byId('market-depth-book'),tradesPanel=f.byId('market-depth-trades');
  assert.equal(control.selected,'book');
  assert.equal(f.byId('market-depth-tablist').hidden,false);
  assert.equal(book.getAttribute('aria-selected'),'true');
  assert.equal(trades.getAttribute('aria-selected'),'false');
  assert.equal(bookPanel.getAttribute('role'),'tabpanel');
  assert.equal(bookPanel.getAttribute('aria-labelledby'),'market-depth-tab-book');
  assert.equal(tradesPanel.getAttribute('aria-labelledby'),'market-depth-tab-trades');
  assert.equal(bookPanel.hidden,false);
  assert.equal(tradesPanel.hidden,true);
  assert.equal(book.tabIndex,0);
  assert.equal(trades.tabIndex,-1);
  trades.fire('click');
  assert.equal(control.selected,'trades');
  assert.equal(trades.getAttribute('aria-selected'),'true');
  assert.equal(book.getAttribute('aria-selected'),'false');
  assert.equal(trades.tabIndex,0);
  assert.equal(book.tabIndex,-1);
  assert.equal(bookPanel.hidden,true);
  assert.equal(tradesPanel.hidden,false);
  assert.equal(trades.classList.contains('active'),true);
  book.fire('click');
  assert.equal(control.selected,'book');
  assert.equal(bookPanel.hidden,false);
  assert.equal(tradesPanel.hidden,true);
  assert.equal(book.focusCount,0,'clicks retain browser-native focus handling');
});

test('UX-HL-06-C1 Arrow/Home/End/Enter/Space keyboard navigation and Tab passthrough',()=>{
  const f=fixture(),ctrl=initMarketDepthTabs(f.root);
  const book=f.byId('market-depth-tab-book'),trades=f.byId('market-depth-tab-trades');
  let e=book.fire('keydown','ArrowRight');
  assert.equal(e.prevented,true);
  assert.equal(ctrl.selected,'trades');
  assert.equal(trades.focusCount,1);
  e=trades.fire('keydown','ArrowRight');
  assert.equal(ctrl.selected,'book','arrow key wraps');
  e=book.fire('keydown','ArrowLeft');
  assert.equal(ctrl.selected,'trades','reverse arrow wraps');
  trades.fire('keydown','Home');
  assert.equal(ctrl.selected,'book');
  book.fire('keydown','End');
  assert.equal(ctrl.selected,'trades');
  trades.fire('keydown','Enter');
  assert.equal(ctrl.selected,'trades');
  book.fire('keydown',' ');
  assert.equal(ctrl.selected,'book');
  const before=book.focusCount;
  e=book.fire('keydown','Tab');
  assert.equal(e.prevented,false);
  assert.equal(book.focusCount,before);
  assert.equal(ctrl.selected,'book');
  assert.throws(()=>ctrl.select('funding'),RangeError);
});

test('UX-HL-06-C1 missing panel/tab fails closed before enabling tablist',()=>{
  for(const missing of ['market-depth-tablist','market-depth-tab-book',
    'market-depth-tab-trades','market-depth-book','market-depth-trades']){
    const f=fixture();
    f.nodes.delete(missing);
    assert.throws(()=>initMarketDepthTabs(f.root),/Incomplete market depth tab markup/);
    if(missing!=='market-depth-tablist')
      assert.equal(f.byId('market-depth-tablist').hidden,true);
  }
});

test('UX-HL-06-C1 mobile disclosure preserves selected tab across collapse/expand',()=>{
  const f=fixture();
  const tabs=initMarketDepthTabs(f.root);
  const disclosure=initMobileMarketDepth(f.root);
  assert.equal(disclosure.expanded,false);
  assert.equal(f.byId('market-depth').dataset.mobileCollapsed,'true');
  disclosure.setExpanded(true);
  tabs.select('trades');
  assert.equal(f.byId('market-depth-trades').hidden,false);
  disclosure.setExpanded(false);
  assert.equal(tabs.selected,'trades');
  disclosure.setExpanded(true);
  assert.equal(tabs.selected,'trades');
  assert.equal(f.byId('market-depth-book').hidden,true);
  assert.equal(f.byId('market-depth-trades').hidden,false);
  assert.equal(f.byId('market-depth-toggle').getAttribute('aria-expanded'),'true');
});

test('UX-HL-06-C1 responsive and hidden semantics retain a single shared middle-rail surface',()=>{
  assert.match(css,/\.trade-shell \.market-depth-surface\{/);
  assert.match(css,/\.trade-shell \.market-depth-tabs\[hidden\]/);
  assert.match(css,/\.trade-shell \.market-depth-surface>\.orderbook-panel\[hidden\]/);
  assert.match(css,/\.trade-shell \.market-depth-surface>\.trade-log-panel\[hidden\]/);
  assert.match(css,/@media\(max-width:760px\)[\s\S]*?\.market-column\[data-mobile-collapsed="true"\]>\.market-depth-surface/);
  assert.match(html,/id="market-depth-surface" class="panel market-depth-surface"/);
  assert.match(html,/src="\.\/market-depth-tabs\.js"/);
  assert.doesNotMatch(tabsSource,/\b(?:fetch|XMLHttpRequest|WebSocket|eth_sendTransaction)\s*\(/);
});
