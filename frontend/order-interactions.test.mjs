import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

/**
 * Real frontend/main.js event handlers executed against a deliberately narrow
 * in-memory DOM contract. NO browser layout, paint, keyboard default behavior,
 * real network, wallet, or platform accessibility APIs are exercised.
 */
const html=readFileSync(fileURLToPath(new URL('./trade.html',import.meta.url)),'utf8');
let moduleCounter=0;
class FakeElement{
  constructor(tag,id=''){
    this.tag=tag;this.id=id;this.children=[];this.listeners={};
    this.dataset={};this.attributes={};this.hidden=false;this.disabled=false;
    this.className='';this.value='';this.textContent='';this.didFocus=false;
    this.style={setProperty:(name,value)=>{this.style[name]=value;}};
    const entries=new Set();
    this.classList={
      toggle:(name,force)=>{
        const active=force===undefined?!entries.has(name):!!force;
        if(active)entries.add(name);else entries.delete(name);
        return active;
      },
      contains:name=>entries.has(name),
      remove:name=>entries.delete(name),
    };
  }
  setAttribute(name,value){this.attributes[name]=String(value);}
  getAttribute(name){return this.attributes[name]??null;}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  replaceChildren(...children){this.children=children;}
  append(...children){this.children.push(...children);}
  focus(){this.didFocus=true;}
  dispatch(name,extras={}){
    const event={type:name,key:extras.key,defaultPrevented:false,
      preventDefault(){this.defaultPrevented=true;}};
    for(const listener of (this.listeners[name]??[]))listener(event);
    return event;
  }
  set innerHTML(_value){throw Error('HTML injection detected');}
}
function buildFixture(){
  const nodes=new Map(),markets=[],quick=[];
  const tags=/<([a-zA-Z][\w:-]*)\b[^>]*>/g;
  for(const match of html.matchAll(tags)){
    const markup=match[0],id=markup.match(/\bid="([^"]+)"/)?.[1];
    const market=markup.match(/\bdata-market="([^"]+)"/)?.[1];
    const qty=markup.match(/\bdata-qty="([^"]+)"/)?.[1];
    if(!id&&!market&&!qty)continue;
    const el=new FakeElement(match[1],id??'');
    el.className=markup.match(/\bclass="([^"]+)"/)?.[1]??'';
    if(markup.match(/\bvalue="([^"]*)"/))el.value=markup.match(/\bvalue="([^"]*)"/)[1];
    el.hidden=/\s+hidden(?:\s|>)/.test(markup);
    el.disabled=/\s+disabled(?:\s|>)/.test(markup);
    if(market){el.dataset.market=market;markets.push(el);}
    if(qty){el.dataset.qty=qty;quick.push(el);}
    if(id){
      assert.equal(nodes.has(id),false,'duplicate id: '+id);
      nodes.set(id,el);
    }
  }
  const document={
    getElementById:id=>{
      const el=nodes.get(id);
      if(!el)throw Error('main.js references unknown id '+id);
      return el;
    },
    querySelectorAll:selector=>{
      if(selector==='[data-market]')return markets;
      if(selector==='[data-qty]')return quick;
      throw Error('Unexpected selector '+selector);
    },
    createElement:tag=>new FakeElement(tag),
    createTextNode:text=>({textContent:String(text)}),
  };
  return {document,nodes,markets,quick,
    id:name=>document.getElementById(name),
    market:name=>markets.find(el=>el.dataset.market===name),
    qty:name=>quick.find(el=>el.dataset.qty===name),
  };
}
async function boot(){
  const fixture=buildFixture();
  globalThis.document=fixture.document;
  await import('./main.js?qa-b2-'+(++moduleCounter));
  return fixture;
}
test('B2-A main.js actually initializes MOCK chart, orderbook, ticket and blocked real execution',async()=>{
  const app=await boot(),id=app.id;
  assert.equal(app.markets.length,3);
  assert.equal(id('market-stats-symbol').textContent,'BTC-USD-PERP');
  assert.match(id('chart-line').getAttribute('d'),/^M/);
  assert.equal(id('asks').children.length,7);
  assert.equal(id('bids').children.length,7);
  assert.equal(id('recent-trades').children.length,9);
  assert.equal(id('preview-order').disabled,false);
  assert.equal(id('limit-price-field').hidden,true);
  assert.equal(id('limit-price').disabled,true);
  assert.equal(id('order-result').hidden,true);
});
test('UX-HL-01-I1 market picker, metric and chart use the same computed mock sample change',async()=>{
  const app=await boot(),id=app.id;
  const {sampleChart,describeSampleChart}=await import('./preview-model.mjs');
  for(const market of ['BTC','ETH','SOL']){
    app.market(market).dispatch('click');
    const summary=describeSampleChart(market,sampleChart(market,64));
    const abs=Math.abs(summary.changePercent).toFixed(2)+'%';
    const metric=(summary.changePercent>=0?'+':'−')+abs;
    const chart=(summary.changePercent>=0?'↗ +':'↘ −')+abs;
    const picker=id('market-change-'+market);
    assert.equal(id('market-stats-change').textContent,metric);
    assert.equal(id('chart-change').textContent,chart);
    assert.equal(picker.textContent,metric);
    assert.equal(picker.className,'market-change '+(summary.changePercent>=0?'positive':'negative'));
  }
  assert.match(id('chart-sample-description').textContent,/샘플 첫 값 대비 마지막 변화/);
});
test('B2-A Market/Limit and Long/Short simulated button clicks update ARIA and quote source',async()=>{
  const app=await boot(),id=app.id;
  id('limit-type').dispatch('click');
  assert.equal(id('limit-price-field').hidden,false);
  assert.equal(id('limit-price').disabled,false);
  assert.equal(id('limit-type').getAttribute('aria-pressed'),'true');
  assert.equal(id('market-type').getAttribute('aria-pressed'),'false');
  assert.equal(id('preview-price-label').textContent,'Limit Price (user input)');
  id('sell-tab').dispatch('click');
  assert.equal(id('sell-tab').getAttribute('aria-pressed'),'true');
  assert.equal(id('buy-tab').getAttribute('aria-pressed'),'false');
  id('limit-price').value='100.50';id('limit-price').dispatch('input');
  assert.equal(id('reference-price').textContent,'$100.50');
  assert.equal(id('preview-order').disabled,false);
  id('market-type').dispatch('click');
  assert.equal(id('limit-price-field').hidden,true);
  assert.equal(id('limit-price').disabled,true);
  assert.equal(id('reference-price').textContent,'$65,240.50');
  assert.equal(id('sell-tab').getAttribute('aria-pressed'),'true');
});
test('B2-A user input validation changes aria-invalid, error visibility and submit availability',async()=>{
  const app=await boot(),id=app.id;
  id('limit-type').dispatch('click');
  id('limit-price').value='1e3';id('limit-price').dispatch('input');
  assert.equal(id('limit-price').getAttribute('aria-invalid'),'true');
  assert.equal(id('limit-price-error').hidden,false);
  assert.equal(id('preview-order').disabled,true);
  assert.equal(id('notional').textContent,'—');
  id('limit-price').value='100.25';id('limit-price').dispatch('input');
  assert.equal(id('limit-price').getAttribute('aria-invalid'),'false');
  assert.equal(id('limit-price-error').hidden,true);
  assert.equal(id('preview-order').disabled,false);
  id('quantity').value='0';id('quantity').dispatch('input');
  assert.equal(id('quantity').getAttribute('aria-invalid'),'true');
  assert.equal(id('quantity-error').hidden,false);
  assert.equal(id('preview-order').disabled,true);
  id('quantity').value='0.02';id('quantity').dispatch('input');
  assert.equal(id('quantity').getAttribute('aria-invalid'),'false');
  assert.equal(id('quantity-error').hidden,true);
  assert.equal(id('preview-order').disabled,false);
  id('market-type').dispatch('click');
  assert.equal(id('limit-price-error').hidden,true);
});
test('UX-HL-02-C1 malformed numeric coercion cannot enable preview or produce a review',async()=>{
  const app=await boot(),id=app.id;
  for(const mode of ['MARKET','LIMIT']){
    if(mode==='LIMIT')id('limit-type').dispatch('click');
    for(const malformed of ['0x1','0b1',' 0.05 ', '1_0']){
      id('quantity').value=malformed;
      id('quantity').dispatch('input');
      assert.equal(id('quantity').getAttribute('aria-invalid'),'true',mode+' '+malformed);
      assert.equal(id('quantity-error').hidden,false);
      assert.equal(id('preview-order').disabled,true);
      const event=id('order-form').dispatch('submit');
      assert.equal(event.defaultPrevented,true);
      assert.equal(id('order-result').hidden,true);
      assert.equal(id('quantity').didFocus,true);
    }
    id('quantity').value='1e-4';
    id('quantity').dispatch('input');
    assert.equal(id('quantity').getAttribute('aria-invalid'),'false');
    assert.equal(id('quantity-error').hidden,true);
    assert.equal(id('preview-order').disabled,false);
    id('order-form').dispatch('submit');
    assert.equal(id('order-result').hidden,false);
    id('order-result').dispatch('keydown',{key:'Escape'});
  }
});
test('UX-HL-02-D1 corrupted leverage input cannot enable or submit either order type',async()=>{
  const app=await boot(),id=app.id;
  for(const mode of ['MARKET','LIMIT']){
    if(mode==='LIMIT')id('limit-type').dispatch('click');
    for(const raw of ['0x3','3e0',' 3 ', '03']){
      id('leverage').value=raw;
      id('leverage').dispatch('input');
      assert.equal(id('leverage').getAttribute('aria-invalid'),'true',mode+' '+raw);
      assert.equal(id('leverage-error').hidden,false);
      assert.equal(id('leverage-output').textContent,'—');
      assert.equal(id('preview-order').disabled,true);
      const event=id('order-form').dispatch('submit');
      assert.equal(event.defaultPrevented,true);
      assert.equal(id('order-result').hidden,true);
      assert.equal(id('leverage').didFocus,true);
    }
    id('leverage').value='3';
    id('leverage').dispatch('input');
    assert.equal(id('leverage').getAttribute('aria-invalid'),'false');
    assert.equal(id('leverage-error').hidden,true);
    assert.equal(id('preview-order').disabled,false);
    id('order-form').dispatch('submit');
    assert.equal(id('order-result').hidden,false);
    id('order-result').dispatch('keydown',{key:'Escape'});
  }
});
test('B2-A actual form submit only renders review; Escape and close return focus',async()=>{
  const app=await boot(),id=app.id;
  id('limit-type').dispatch('click');
  id('limit-price').value='60000.25';id('limit-price').dispatch('input');
  const submitted=id('order-form').dispatch('submit');
  assert.equal(submitted.defaultPrevented,true);
  assert.equal(id('order-result').hidden,false);
  assert.equal(id('order-result').didFocus,true);
  const heading=id('order-result').children[0];
  assert.match(heading.children[0].textContent,/모의 주문 검토/);
  assert.equal(id('order-result').children[1].children.length,9);
  assert.match(id('order-result').children[2].textContent,/서버 전송 0건/);
  const esc=id('order-result').dispatch('keydown',{key:'Escape'});
  assert.equal(esc.defaultPrevented,true);
  assert.equal(id('order-result').hidden,true);
  assert.equal(id('preview-order').didFocus,true);
  id('order-form').dispatch('submit');
  assert.equal(id('order-result').hidden,false);
  const close=id('order-result').children[0].children[1];
  assert.equal(close.tag,'button');
  close.dispatch('click');
  assert.equal(id('order-result').hidden,true);
});
test('UX-HL-02-E1 clicking current market preserves edited Limit price and valid review',async()=>{
  const app=await boot(),id=app.id;
  id('limit-type').dispatch('click');
  id('limit-price').value='60000.25';
  id('limit-price').dispatch('input');
  id('quantity').value='0.2';
  id('quantity').dispatch('input');
  id('leverage').value='5';
  id('leverage').dispatch('input');
  id('order-form').dispatch('submit');
  assert.equal(id('order-result').hidden,false);
  const before={
    price:id('limit-price').value,
    priceText:id('reference-price').textContent,
    quantity:id('quantity').value,
    leverage:id('leverage').value,
    chart:id('chart-line').getAttribute('d'),
    rows:id('order-result').children[1],
  };
  app.market('BTC').dispatch('click');
  assert.equal(id('limit-price').value,before.price);
  assert.equal(id('reference-price').textContent,before.priceText);
  assert.equal(id('quantity').value,before.quantity);
  assert.equal(id('leverage').value,before.leverage);
  assert.equal(id('chart-line').getAttribute('d'),before.chart);
  assert.equal(id('order-result').hidden,false);
  assert.equal(id('order-result').children[1],before.rows);
  app.market('ETH').dispatch('click');
  assert.equal(id('market-stats-symbol').textContent,'ETH-USD-PERP');
  assert.equal(id('limit-price').value,'3405.20');
  assert.equal(id('order-result').hidden,true);
});
test('UX-HL-02-E1 clicking current market preserves a draft with invalid Limit price',async()=>{
  const app=await boot(),id=app.id;
  id('limit-type').dispatch('click');
  id('limit-price').value='invalid';
  id('limit-price').dispatch('input');
  assert.equal(id('limit-price-error').hidden,false);
  assert.equal(id('preview-order').disabled,true);
  app.market('BTC').dispatch('click');
  assert.equal(id('limit-price').value,'invalid');
  assert.equal(id('limit-price-error').hidden,false);
  assert.equal(id('preview-order').disabled,true);
});
test('UX-HL-02-F1 positive sub-cent simulated cost appears as less than one cent in ticket and review',async()=>{
  const app=await boot(),id=app.id;
  id('limit-type').dispatch('click');
  id('quantity').value='0.0001';id('quantity').dispatch('input');
  id('limit-price').value='0.01';id('limit-price').dispatch('input');
  id('leverage').value='10';id('leverage').dispatch('input');
  assert.equal(id('preview-order').disabled,false);
  assert.equal(id('reference-price').textContent,'$0.01');
  assert.equal(id('notional').textContent,'<$0.01');
  assert.equal(id('margin').textContent,'<$0.01');
  id('order-form').dispatch('submit');
  assert.equal(id('order-result').hidden,false);
  const rows=id('order-result').children[1].children;
  assert.equal(rows.at(-2).children[1].textContent,'<$0.01');
  assert.equal(rows.at(-1).children[1].textContent,'<$0.01');
  assert.equal(id('order-result').children[2].textContent.includes('서버 전송 0건'),true);
});
test('UX-HL-02-G1 clicking already selected side/type retains valid review; actual change invalidates it',async()=>{
  const app=await boot(),id=app.id;
  id('order-form').dispatch('submit');
  assert.equal(id('order-result').hidden,false);
  const review=id('order-result').children[1];
  id('buy-tab').dispatch('click');
  id('market-type').dispatch('click');
  assert.equal(id('order-result').hidden,false);
  assert.equal(id('order-result').children[1],review);
  assert.equal(id('buy-tab').getAttribute('aria-pressed'),'true');
  assert.equal(id('market-type').getAttribute('aria-pressed'),'true');
  id('sell-tab').dispatch('click');
  assert.equal(id('order-result').hidden,true);
  assert.equal(id('sell-tab').getAttribute('aria-pressed'),'true');
  id('order-form').dispatch('submit');
  assert.equal(id('order-result').hidden,false);
  id('limit-type').dispatch('click');
  assert.equal(id('order-result').hidden,true);
  assert.equal(id('limit-type').getAttribute('aria-pressed'),'true');
});

test('UX-HL-02-G1 reselecting active Limit/Short preserves invalid price draft and valid review',async()=>{
  const app=await boot(),id=app.id;
  id('sell-tab').dispatch('click');
  id('limit-type').dispatch('click');
  id('limit-price').value='invalid';
  id('limit-price').dispatch('input');
  assert.equal(id('limit-price-error').hidden,false);
  assert.equal(id('preview-order').disabled,true);
  id('sell-tab').dispatch('click');
  id('limit-type').dispatch('click');
  assert.equal(id('limit-price').value,'invalid');
  assert.equal(id('limit-price-error').hidden,false);
  assert.equal(id('preview-order').disabled,true);
  id('limit-price').value='60000.25';
  id('limit-price').dispatch('input');
  id('order-form').dispatch('submit');
  assert.equal(id('order-result').hidden,false);
  const rows=id('order-result').children[1];
  id('sell-tab').dispatch('click');
  id('limit-type').dispatch('click');
  assert.equal(id('order-result').hidden,false);
  assert.equal(id('order-result').children[1],rows);
  assert.equal(id('limit-price').value,'60000.25');
  id('buy-tab').dispatch('click');
  assert.equal(id('order-result').hidden,true);
  id('order-form').dispatch('submit');
  assert.equal(id('order-result').hidden,false);
  id('market-type').dispatch('click');
  assert.equal(id('order-result').hidden,true);
});
test('UX-HL-02-H1 clicking an unchanged quick quantity retains an existing review',async()=>{
  const app=await boot(),id=app.id;
  id('order-form').dispatch('submit');
  assert.equal(id('order-result').hidden,false);
  const review=id('order-result').children[1];
  assert.equal(id('quantity').value,'0.05');
  app.qty('0.05').dispatch('click');
  assert.equal(id('quantity').value,'0.05');
  assert.equal(id('order-result').hidden,false);
  assert.equal(id('order-result').children[1],review);
  assert.equal(id('preview-order').disabled,false);
  app.qty('0.1').dispatch('click');
  assert.equal(id('quantity').value,'0.1');
  assert.equal(id('order-result').hidden,true);
});

test('UX-HL-02-H1 active preset does not replace invalid draft unless quantity changes',async()=>{
  const app=await boot(),id=app.id;
  id('quantity').value='0.01';
  id('quantity').dispatch('input');
  id('order-form').dispatch('submit');
  assert.equal(id('order-result').hidden,false);
  const review=id('order-result').children[1];
  app.qty('0.01').dispatch('click');
  assert.equal(id('order-result').hidden,false);
  assert.equal(id('order-result').children[1],review);
  // A valid click that changes the quantity still invalidates the stale review.
  app.qty('0.25').dispatch('click');
  assert.equal(id('quantity').value,'0.25');
  assert.equal(id('order-result').hidden,true);
});
test('UX-HL-02-K1 manual numeric-equivalent quantity editing preserves an existing demo review',async()=>{
  const app=await boot(),id=app.id;
  id('order-form').dispatch('submit');
  assert.equal(id('order-result').hidden,false);
  const review=id('order-result').children[1];
  const notional=id('notional').textContent;
  for(const equivalent of ['0.050','5e-2','.05','0.05']){
    id('quantity').value=equivalent;
    id('quantity').dispatch('input');
    assert.equal(id('order-result').hidden,false,'equivalent quantity must keep review: '+equivalent);
    assert.equal(id('order-result').children[1],review,'review must not be regenerated');
    assert.equal(id('notional').textContent,notional);
    assert.equal(id('quantity').getAttribute('aria-invalid'),'false');
  }
  id('quantity').value='0.06';
  id('quantity').dispatch('input');
  assert.equal(id('order-result').hidden,true,'actual quantity change invalidates review');
  id('quantity').value='0.05';
  id('quantity').dispatch('input');
  assert.equal(id('order-result').hidden,true,'returning to previous amount must not resurrect stale review');
});

test('UX-HL-02-K1 invalid manual quantity input hides review even when previous reviewed amount matched',async()=>{
  const app=await boot(),id=app.id;
  id('limit-type').dispatch('click');
  id('order-form').dispatch('submit');
  assert.equal(id('order-result').hidden,false);
  id('quantity').value='0.0500';
  id('quantity').dispatch('input');
  assert.equal(id('order-result').hidden,false);
  id('quantity').value='0.05bad';
  id('quantity').dispatch('input');
  assert.equal(id('order-result').hidden,true);
  assert.equal(id('preview-order').disabled,true);
  assert.equal(id('quantity').getAttribute('aria-invalid'),'true');
  id('quantity').value='0.05';
  id('quantity').dispatch('input');
  assert.equal(id('order-result').hidden,true);
});
test('UX-HL-02-J1 numeric-equivalent quick quantity keeps demo review and original input representation',async()=>{
  const app=await boot(),id=app.id;
  const quantity=id('quantity');
  quantity.value='0.050';
  quantity.dispatch('input');
  id('order-form').dispatch('submit');
  assert.equal(id('order-result').hidden,false);
  const review=id('order-result').children[1];
  app.qty('0.05').dispatch('click');
  assert.equal(quantity.value,'0.050','same numeric quantity should not reformat the user draft');
  assert.equal(id('order-result').hidden,false,'same amount must keep review visible');
  assert.equal(id('order-result').children[1],review,'identical review DOM must be preserved');
  app.qty('0.1').dispatch('click');
  assert.equal(quantity.value,'0.1');
  assert.equal(id('order-result').hidden,true,'different amount must invalidate review');
});
test('UX-HL-02-J1 quick selection uses valid numeric equality for scientific and decimal forms',async()=>{
  const app=await boot(),id=app.id;
  const qty=id('quantity');
  for(const [value,selected] of [['0.050','0.05'],['5e-2','0.05'],['0.0100','0.01'],['0.07',null],[' 0.05',null],['0.05bad',null]]){
    qty.value=value;
    qty.dispatch('input');
    for(const amount of ['0.01','0.05','0.1','0.25']){
      const btn=app.qty(amount),active=amount===selected;
      assert.equal(btn.getAttribute('aria-pressed'),String(active),value+' aria pressed '+amount);
      assert.equal(btn.classList.contains('active'),active,value+' visual active '+amount);
    }
  }
});
test('UX-HL-02-I1 quick quantity buttons expose selected state through aria-pressed',async()=>{
  const app=await boot(),id=app.id;
  const buttons=['0.01','0.05','0.1','0.25'];
  const expectPressed=selected=>{
    for(const amount of buttons){
      assert.equal(app.qty(amount).getAttribute('aria-pressed'),String(amount===selected),
        'quick qty '+amount+' when selected '+selected);
      assert.equal(app.qty(amount).classList.contains('active'),amount===selected);
    }
  };
  expectPressed('0.05');
  app.qty('0.25').dispatch('click');
  expectPressed('0.25');
  id('quantity').value='0.07';
  id('quantity').dispatch('input');
  expectPressed(null);
  id('quantity').value='0.01';
  id('quantity').dispatch('input');
  expectPressed('0.01');
  app.qty('0.01').dispatch('click');
  expectPressed('0.01');
});
test('B2-A changes in symbol, side, quantity, leverage, limit and type hide stale preview',async()=>{
  const app=await boot(),id=app.id;
  const show=()=>{
    id('order-form').dispatch('submit');
    assert.equal(id('order-result').hidden,false);
  };
  show();app.market('ETH').dispatch('click');
  assert.equal(id('market-stats-symbol').textContent,'ETH-USD-PERP');
  assert.equal(id('order-result').hidden,true);
  assert.equal(id('limit-price').value,'3405.20');
  show();id('sell-tab').dispatch('click');
  assert.equal(id('order-result').hidden,true);
  show();id('limit-type').dispatch('click');
  assert.equal(id('order-result').hidden,true);
  show();id('limit-price').value='200.00';id('limit-price').dispatch('input');
  assert.equal(id('order-result').hidden,true);
  show();id('quantity').value='0.1';id('quantity').dispatch('input');
  assert.equal(id('order-result').hidden,true);
  show();id('leverage').value='5';id('leverage').dispatch('input');
  assert.equal(id('order-result').hidden,true);
  show();app.qty('0.01').dispatch('click');
  assert.equal(id('order-result').hidden,true);
  assert.equal(id('quantity').value,'0.01');
});
test('B2-A invalid keyboard form submit focuses field with inline error, never a stale review',async()=>{
  const app=await boot(),id=app.id;
  id('quantity').value='0';
  const submitQuantity=id('order-form').dispatch('submit');
  assert.equal(submitQuantity.defaultPrevented,true);
  assert.equal(id('quantity').didFocus,true);
  assert.equal(id('quantity-error').hidden,false);
  assert.equal(id('preview-order').disabled,true);
  assert.equal(id('order-result').hidden,true);
  id('quantity').value='0.05';id('quantity').dispatch('input');
  id('limit-type').dispatch('click');
  id('limit-price').value='-2';id('limit-price').dispatch('input');
  const invalidLimit=id('order-form').dispatch('submit');
  assert.equal(invalidLimit.defaultPrevented,true);
  assert.equal(id('limit-price').didFocus,true);
  assert.equal(id('limit-price-error').hidden,false);
  assert.equal(id('preview-order').disabled,true);
  assert.equal(id('order-result').hidden,true);
});
test('UX-HL-01-E1 market switch refreshes visible sample range and text chart description',async()=>{
  const app=await boot(),id=app.id;
  const btcLow=id('chart-sample-low').textContent;
  const btcHigh=id('chart-sample-high').textContent;
  assert.match(id('chart-sample-description').textContent,/BTC-USD-PERP/);
  assert.match(id('chart-sample-description').textContent,/64개/);
  assert.notEqual(btcLow,'—');
  assert.notEqual(btcHigh,'—');
  app.market('ETH').dispatch('click');
  assert.notEqual(id('chart-sample-low').textContent,btcLow);
  assert.notEqual(id('chart-sample-high').textContent,btcHigh);
  assert.match(id('chart-sample-description').textContent,/ETH-USD-PERP/);
  assert.doesNotMatch(id('chart-sample-description').textContent,/BTC-USD-PERP/);
  app.market('SOL').dispatch('click');
  assert.match(id('chart-sample-description').textContent,/SOL-USD-PERP/);
  assert.match(id('chart-sample-description').textContent,/실제 시간축이나 실시간 시세/);
});
test('UX-HL-01-F1 generated trades use sample IDs, never fabricated clock timestamps',async()=>{
  const app=await boot(),id=app.id;
  const rows=id('recent-trades').children;
  assert.equal(rows.length,9);
  const labels=rows.map(row=>row.children[2].textContent);
  assert.deepEqual(labels,Array.from({length:9},(_,i)=>'#'+String(i+1).padStart(2,'0')));
  assert.equal(labels.some(v=>/^\d{1,2}:\d{2}$/.test(v)),false);
});
test('UX-HL-01-F1 changing BTC ETH SOL regenerates trade examples but keeps sample positions',async()=>{
  const app=await boot(),id=app.id;
  const rowData=()=>id('recent-trades').children.map(row=>({
    price:row.children[0].textContent,
    qty:row.children[1].textContent,
    sample:row.children[2].textContent,
  }));
  const expected=Array.from({length:9},(_,i)=>'#'+String(i+1).padStart(2,'0'));
  const before=rowData();
  for(const symbol of ['ETH','SOL','BTC']){
    app.market(symbol).dispatch('click');
    const rows=rowData();
    assert.equal(rows.length,9);
    assert.deepEqual(rows.map(r=>r.sample),expected);
    assert.ok(rows.every(r=>/^\d[\d,]*\.\d{2}$/.test(r.price)));
  }
  assert.deepEqual(rowData(),before);
});
test('UX-HL-01-F1 sample sequence and caveat shown without claiming real trade time',()=>{
  const html=readFileSync(fileURLToPath(new URL('./trade.html',import.meta.url)),'utf8');
  const code=readFileSync(fileURLToPath(new URL('./main.js',import.meta.url)),'utf8');
  const tradesStart=html.indexOf('id="market-depth-trades"');
  const tradesEnd=html.indexOf('</section>',tradesStart);
  const section=html.slice(tradesStart,tradesEnd);
  assert.match(section,/GENERATED EXAMPLES/);
  assert.match(section,/Sample #/);
  assert.match(section,/실제 체결 시각·블록체인 기록 아님/);
  assert.doesNotMatch(section,/<span>Time<\/span>/);
  assert.doesNotMatch(code,/18:.*String\(50-i\*4\)/);
  assert.match(code,/String\(i\+1\)\.padStart\(2,'0'\)/);
});
test('UX-HL-01-G1 orderbook totals accumulate from best price, not row index times size',async()=>{
  const app=await boot(),id=app.id;
  const num=cell=>Number(cell.textContent.replaceAll(',',''));
  for(const market of ['BTC','ETH','SOL']){
    if(market!=='BTC')app.market(market).dispatch('click');
    for(const side of ['asks','bids']){
      const rows=id(side).children;
      assert.equal(rows.length,7);
      const prices=rows.map(row=>num(row.children[0]));
      const sizes=rows.map(row=>num(row.children[1]));
      const totals=rows.map(row=>num(row.children[2]));
      for(let i=1;i<prices.length;i++){
        assert.ok(prices[i-1]>prices[i],market+' '+side+' descending displayed prices');
      }
      for(let i=0;i<rows.length;i++){
        const expected=(side==='asks'?sizes.slice(i):sizes.slice(0,i+1))
          .reduce((sum,value)=>sum+value,0);
        assert.ok(Math.abs(totals[i]-expected)<0.00015,
          market+' '+side+' level '+i+' expected '+expected+' got '+totals[i]);
        assert.ok(totals[i]+0.00015>=sizes[i]);
      }
      if(side==='asks')assert.ok(Math.abs(totals.at(-1)-sizes.at(-1))<0.00015);
      else assert.ok(Math.abs(totals[0]-sizes[0])<0.00015);
    }
  }
});
test('UX-HL-01-K1 synthetic book rows have explicit non-live side, price, size and cumulative labels',async()=>{
  const app=await boot(),id=app.id;
  for(const market of ['BTC','ETH','SOL']){
    app.market(market).dispatch('click');
    for(const [containerId,side] of [['asks','매도'],['bids','매수']]){
      const list=id(containerId);
      assert.equal(list.getAttribute('role'),'list');
      assert.match(list.getAttribute('aria-label')??'',new RegExp(market+'.*합성.*'+side));
      assert.equal(list.children.length,7);
      for(const [i,row] of list.children.entries()){
        assert.equal(row.getAttribute('role'),'listitem');
        const label=row.getAttribute('aria-label')??'';
        assert.match(label,new RegExp('모의 '+side+'호가'));
        assert.match(label,new RegExp(' '+String(i+1)+'\\.'));
        assert.ok(label.includes('가격 '+row.children[0].textContent+' USD'),label);
        assert.ok(label.includes('수량 '+row.children[1].textContent+' '+market),label);
        assert.ok(label.includes('누적 '+row.children[2].textContent+' '+market),label);
        assert.match(label,/실제 주문장 아님/);
        assert.ok(row.children.every(cell=>cell.getAttribute('aria-hidden')==='true'));
      }
    }
  }
});
test('UX-HL-01-K1 pre-JS markup identifies distinct mock book lists',()=>{
  assert.match(html,/id="asks"[^>]*role="list"[^>]*aria-label="BTC 합성 매도호가 목록/);
  assert.match(html,/id="bids"[^>]*role="list"[^>]*aria-label="BTC 합성 매수호가 목록/);
  assert.match(html,/SYNTHETIC LIQUIDITY/);
});
test('UX-HL-01-L1 mock recent trades have accessible market, direction, price, size and sample sequence',async()=>{
  const app=await boot(),id=app.id;
  for(const market of ['BTC','ETH','SOL']){
    app.market(market).dispatch('click');
    const list=id('recent-trades');
    assert.equal(list.getAttribute('role'),'list');
    assert.match(list.getAttribute('aria-label')??'',new RegExp(market+'.*합성.*체결.*실제 체결 기록 아님'));
    assert.equal(list.children.length,9);
    for(const [i,row] of list.children.entries()){
      assert.equal(row.getAttribute('role'),'listitem');
      const direction=row.children[0].className==='positive'?'매수':'매도';
      const label=row.getAttribute('aria-label')??'';
      assert.ok(label.includes('모의 '+direction+' 방향'),label);
      assert.ok(label.includes('샘플 '+row.children[2].textContent),label);
      assert.ok(label.includes('가격 '+row.children[0].textContent+' USD'),label);
      assert.ok(label.includes('수량 '+row.children[1].textContent+' '+market),label);
      assert.ok(label.includes('실제 체결 기록 아님'),label);
      assert.ok(row.children.every(cell=>cell.getAttribute('aria-hidden')==='true'));
      assert.equal(row.children[2].textContent,'#'+String(i+1).padStart(2,'0'));
    }
  }
});
test('UX-HL-01-L1 recent trade container has non-live accessible list fallback',()=>{
  assert.match(html,/id="recent-trades"[^>]*role="list"[^>]*aria-label="BTC 합성 최근 체결 예시 목록/);
  assert.match(html,/실제 체결 시각·블록체인 기록 아님/);
});
test('UX-HL-01-P1 synthetic chart stroke, point and area gradient reflect calculated sample trend',async()=>{
  const app=await boot(),id=app.id;
  const {sampleChart,describeSampleChart}=await import('./preview-model.mjs');
  for(const market of ['BTC','ETH','SOL','BTC']){
    app.market(market).dispatch('click');
    const change=describeSampleChart(market,sampleChart(market,64)).changePercent;
    const expected=change>=0?'#43e1b4':'#ff6c7b';
    assert.equal(id('chart-line').getAttribute('stroke'),expected,market+' trend line');
    assert.equal(id('chart-point').getAttribute('fill'),expected,market+' terminal point');
    assert.equal(id('chart-gradient-start').getAttribute('stop-color'),expected,market+' gradient');
    assert.equal(id('chart-gradient-end').getAttribute('stop-color'),expected,market+' gradient end');
    assert.ok(id('chart-change').className.includes(change>=0?'positive':'negative'));
  }
});
test('UX-HL-01-P1 no-script BTC chart has identifiable editable stops and bullish defaults',()=>{
  assert.match(html,/id="chart-gradient-start"[^>]*stop-color="#43e1b4"/);
  assert.match(html,/id="chart-gradient-end"[^>]*stop-color="#43e1b4"/);
  assert.match(html,/id="chart-line"[^>]*stroke="#43e1b4"/);
  assert.match(html,/id="chart-point"[^>]*fill="#43e1b4"/);
});
test('UX-HL-01-O1 visible mock spread matches best displayed ask minus best displayed bid',async()=>{
  const app=await boot(),id=app.id;
  const {FORMAT_USD}=await import('./preview-model.mjs');
  for(const market of ['BTC','ETH','SOL']){
    app.market(market).dispatch('click');
    const bestAsk=Number(id('asks').children.at(-1).children[0].textContent.replaceAll(',',''));
    const bestBid=Number(id('bids').children[0].children[0].textContent.replaceAll(',',''));
    assert.ok(bestAsk>bestBid,market+' has a positive synthetic spread');
    assert.equal(id('book-spread').textContent,FORMAT_USD.format(bestAsk-bestBid));
    assert.match(id('book-spread').getAttribute('aria-label')??'',new RegExp(market+'.*합성.*스프레드.*실제 호가 아님'));
  }
});

test('UX-HL-01-O1 static spread defaults to unavailable until synthetic levels render',()=>{
  const book=html.match(/<section id="market-depth-book"[\s\S]*?<\/section>/)?.[0]??'';
  assert.match(book,/id="book-spread"[^>]*>—<\/output>/);
  assert.match(book,/>SPREAD/);
  assert.match(book,/>MOCK<\/small>/);
  assert.doesNotMatch(book,/SPREAD <b>DEMO<\/b>/);
});
test('UX-HL-01-N1 mock book and trade visible quantity headers follow selected unit',async()=>{
  const app=await boot(),id=app.id;
  for(const market of ['BTC','ETH','SOL']){
    app.market(market).dispatch('click');
    assert.equal(id('book-size-label').textContent,'Size ('+market+')');
    assert.equal(id('book-total-label').textContent,'Total ('+market+')');
    assert.equal(id('trade-size-label').textContent,'Size ('+market+')');
    assert.match(id('asks').getAttribute('aria-label')??'',new RegExp(market));
    assert.match(id('recent-trades').getAttribute('aria-label')??'',new RegExp(market));
  }
});

test('UX-HL-01-N1 initial non-JS trade markup declares BTC units for every visible size header',()=>{
  const book=html.match(/<section id="market-depth-book"[\s\S]*?<\/section>/)?.[0]??'';
  const trades=html.match(/<section id="market-depth-trades"[\s\S]*?<\/section>/)?.[0]??'';
  assert.match(book,/id="book-size-label"[^>]*>Size \(BTC\)<\/span>/);
  assert.match(book,/id="book-total-label"[^>]*>Total \(BTC\)<\/span>/);
  assert.match(trades,/id="trade-size-label"[^>]*>Size \(BTC\)<\/span>/);
  assert.match(book,/>Price \(USD\)<\/span>/);
  assert.match(trades,/>Price \(USD\)<\/span>/);
});
test('UX-HL-01-M1 recent-trade direction is visible in text, not inferred only from red/green',async()=>{
  const app=await boot(),id=app.id;
  for(const market of ['BTC','ETH','SOL']){
    app.market(market).dispatch('click');
    const rows=id('recent-trades').children;
    assert.equal(rows.length,9);
    const sides=new Set();
    for(const row of rows){
      assert.equal(row.children.length,4);
      const cell=row.children[3];
      assert.ok(cell.textContent==='Buy'||cell.textContent==='Sell');
      const expected=row.children[0].className==='positive'?'Buy':'Sell';
      assert.equal(cell.textContent,expected,'direction must agree with existing synthetic sample');
      const korean=expected==='Buy'?'매수':'매도';
      assert.ok(row.getAttribute('aria-label').includes('모의 '+korean+' 방향'));
      assert.equal(cell.getAttribute('aria-hidden'),'true');
      assert.match(cell.className,expected==='Buy'?/positive/:/negative/);
      sides.add(cell.textContent);
    }
    assert.deepEqual([...sides].sort(),['Buy','Sell']);
  }
});
test('UX-HL-01-M1 mock recent-trade header and narrow-grid CSS visibly support side field',()=>{
  const section=html.match(/<section id="market-depth-trades"[\s\S]*?<\/section>/)?.[0]??'';
  assert.match(section,/<span>Side<\/span>/);
  const css=readFileSync(fileURLToPath(new URL('./trade.css',import.meta.url)),'utf8');
  assert.match(css,/\.trade-shell \.trade-log-panel \.trade-row/);
  assert.match(css,/\.trade-shell \.trade-log-panel \.book-header/);
  assert.match(css,/grid-template-columns:[^;]*minmax\(0,1fr\)/);
});
test('UX-HL-01-J1 synthetic depth bars scale with cumulative displayed book totals',async()=>{
  const app=await boot(),id=app.id;
  const amount=cell=>Number(cell.textContent.replaceAll(',',''));
  for(const market of ['BTC','ETH','SOL']){
    app.market(market).dispatch('click');
    for(const side of ['asks','bids']){
      const rows=id(side).children;
      assert.equal(rows.length,7);
      const totals=rows.map(row=>amount(row.children[2]));
      const maxTotal=Math.max(...totals);
      const widths=rows.map(row=>Number(row.style['--depth']?.replace('%','')));
      for(let i=0;i<rows.length;i++){
        assert.ok(Number.isFinite(widths[i]),market+' '+side+' depth at '+i+' is numeric');
        assert.ok(widths[i]>0&&widths[i]<=100,market+' '+side+' depth bounded');
        const expected=totals[i]/maxTotal*100;
        assert.ok(Math.abs(widths[i]-expected)<0.20,
          market+' '+side+' row '+i+' has '+widths[i]+'%, but total requires '+expected+'%');
        if(i>0){
          if(side==='asks')assert.ok(widths[i]<widths[i-1],market+' ask cumulative depth decreases toward best');
          else assert.ok(widths[i]>widths[i-1],market+' bid cumulative depth increases from best');
        }
      }
      assert.ok(Math.abs(Math.max(...widths)-100)<0.02);
    }
  }
});
test('B2-A no network or wallet connection side effects in simulated event execution',async()=>{
  const app=await boot(),id=app.id;
  id('limit-type').dispatch('click');
  app.market('SOL').dispatch('click');
  id('quantity').value='0.2';id('quantity').dispatch('input');
  id('order-form').dispatch('submit');
  assert.equal(id('order-result').hidden,false);
  assert.match(id('order-result').children[2].textContent,/실제 주문 아님/);
  const script=readFileSync(fileURLToPath(new URL('./main.js',import.meta.url)),'utf8');
  assert.doesNotMatch(script,/\bfetch\s*\(|\bWebSocket\s*\(|eth_sendTransaction|eth_requestAccounts/);
});
