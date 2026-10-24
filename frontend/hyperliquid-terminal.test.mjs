import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const read=name=>readFileSync(fileURLToPath(new URL('./'+name,import.meta.url)),'utf8');
const html=read('trade.html');
const css=read('trade.css');
const js=read('main.js');
test('UX-HL-01-A: terminal has chart, orderbook/trades, and ticket in three independent columns',()=>{
  const positions=['class="dashboard-grid terminal-grid"','class="chart-column"','class="market-column"','class="panel order-panel"'];
  const idx=positions.map(x=>html.indexOf(x));
  assert.ok(idx.every(x=>x>0),String(idx));
  assert.ok(idx.every((x,i)=>!i||x>idx[i-1]));
  assert.match(html,/class="chart-column"[\s\S]*?class="panel chart-panel"[\s\S]*?class="market-column"/);
  assert.match(html,/class="market-column"[\s\S]*?class="panel orderbook-panel"[\s\S]*?class="panel trade-log-panel"[\s\S]*?class="panel order-panel"/);
  assert.equal((html.match(/class="dashboard-grid terminal-grid"/g)||[]).length,1);
  assert.doesNotMatch(html,/class="market-detail-grid"/);
});
test('UX-HL-01-A: market header labels simulated values and unavailable real metrics',()=>{
  assert.match(html,/class="market-metrics"/);
  assert.match(html,/id="market-stats-symbol"/);
  for(const id of ['market-stats-reference','market-stats-change'])assert.match(html,new RegExp('id="'+id+'"'));
  for(const label of ['Mark Price','Oracle Price','Funding','Open Interest']){
    const escaped=label.replace(/[.*+?^$()|[\]{}]/g,'\\$&');
    assert.match(html,new RegExp('>'+escaped+'<'));
  }
  assert.equal((html.match(/class="metric-unavailable"/g)||[]).length,4);
  assert.equal((html.match(/미연결<\/small>/g)||[]).length,4);
  assert.match(html,/Reference <span>MOCK<\/span>/);
  assert.match(html,/Sample change <span>MOCK<\/span>/);
});
test('UX-HL-01-A: market-switch handler updates stats without network or wallet requests',()=>{
  for(const id of ['market-stats-symbol','market-stats-reference','market-stats-change']){
    assert.match(js,new RegExp("byId\\('"+id+"'\\)"));
  }
  assert.match(js,/sampleChange\.className=change>=0\?'positive':'negative'/);
  assert.match(js,/describeSampleChart\(view\.market,sampleChart\(view\.market,64\)\)\.changePercent/);
  assert.match(js,/renderChart\(\);\s*renderBook\(\);\s*renderTrades\(\);\s*renderTicket\(\)/);
  assert.doesNotMatch(js,/\b(?:fetch|XMLHttpRequest|WebSocket|eth_sendTransaction)\s*\(/);
});
test('UX-HL-01-A: desktop three-column and laptop/tablet/mobile grids exist',()=>{
  assert.match(css,/\.trade-shell \.terminal-grid\s*\{[\s\S]*?grid-template-columns:minmax\(0,1fr\) minmax\(230px,270px\) minmax\(290px,315px\)/);
  assert.match(css,/@media\(max-width:1070px\)/);
  assert.match(css,/grid-template-areas:"chart ticket" "book ticket"/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/grid-template-areas:"chart" "ticket" "book"/);
  assert.match(css,/@media\(max-width:480px\)/);
});
test('UX-HL-01-A: previous preview controls and accessible market state remain present',()=>{
  for(const id of ['order-form','preview-order','buy-tab','sell-tab','leverage','quantity','market-picker','market-chart','asks','bids','recent-trades']){
    assert.ok(html.includes('id="'+id+'"'),id);
  }
  assert.match(html,/data-market="BTC" aria-pressed="true"/);
  assert.match(html,/data-market="ETH" aria-pressed="false"/);
  assert.match(html,/class="demo-banner"/);
  assert.match(html,/SIMULATION PREVIEW/);
  assert.match(html,/TRADING TERMINAL/);
  assert.match(html,/connect-src 'none'/);
  assert.match(html,/SAMPLE<\/span>/);
});
test('UX-HL-01-A: landing is separate and orderbook recent trades are labeled simulated',()=>{
  const landing=read('index.html');
  assert.doesNotMatch(landing,/market-metrics|terminal-grid|id="order-form"/);
  assert.match(landing,/href="\.\/trade\.html"/);
  assert.match(html,/SYNTHETIC LIQUIDITY/);
  assert.match(html,/GENERATED EXAMPLES/);
  assert.match(html,/MOCK<\/span>/);
  assert.match(html,/No price feeds connected/);
});
