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
  const labels=rows.map(row=>row.children.at(-1).textContent);
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
