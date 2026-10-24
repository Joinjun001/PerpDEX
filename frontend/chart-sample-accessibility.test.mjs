import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {MARKETS,FORMAT_USD,sampleChart,describeSampleChart} from './preview-model.mjs';

const read=name=>readFileSync(fileURLToPath(new URL('./'+name,import.meta.url)),'utf8');
const html=read('trade.html'),js=read('main.js'),css=read('trade.css');

test('E1 every market summary is derived only from its existing synthetic samples',()=>{
  for(const market of Object.keys(MARKETS)){
    const series=sampleChart(market,64);
    const result=describeSampleChart(market,series);
    assert.equal(result.market,market);
    assert.equal(result.count,64);
    assert.equal(result.low,Math.min(...series));
    assert.equal(result.high,Math.max(...series));
    assert.equal(result.last,series.at(-1));
    assert.equal(result.last,MARKETS[market].price);
    assert.equal(Object.isFrozen(result),true);
    assert.match(result.accessibilityText,new RegExp(market+'-USD-PERP'));
    for(const value of [result.low,result.high,result.last])
      assert.ok(result.accessibilityText.includes(FORMAT_USD.format(value)));
    assert.match(result.accessibilityText,/실제 시간축이나 실시간 시세/);
  }
});
test('UX-HL-01-I1 synthetic change is derived from first and last sample, not fixture metadata',()=>{
  for(const market of Object.keys(MARKETS)){
    const points=sampleChart(market,64);
    const summary=describeSampleChart(market,points);
    const expected=(points.at(-1)/points[0]-1)*100;
    assert.ok(Math.abs(summary.changePercent-expected)<1e-10);
    assert.match(summary.accessibilityText,/샘플 첫 값 대비 마지막 변화/);
    assert.ok(Math.abs(summary.changePercent-MARKETS[market].change)>0.01,
      'known metadata/sample mismatch should be represented honestly');
  }
});
test('E1 accessible summary stays accurate with custom synthetic sample counts',()=>{
  const pts=sampleChart('SOL',8);
  const result=describeSampleChart('SOL',pts);
  assert.equal(result.count,8);
  assert.ok(result.low<=result.last);
  assert.ok(result.high>=result.last);
  assert.match(result.accessibilityText,/샘플 8개/);
});
test('UX-HL-01-H1: descriptive summary rejects prototype keys and coerced objects',()=>{
 const points=[100,101,102,103];
 for(const market of ['constructor','__proto__','toString',{toString:()=> 'BTC'},['BTC']]){
  assert.throws(()=>describeSampleChart(market,points),RangeError);
 }
});
test('E1 reject unsupported markets, malformed data, nonfinite and negative values',()=>{
  for(const [market,points] of [
    ['DOGE',[1,2,3,4]],['BTC',null],['BTC',{}],['BTC',[1,2,3]],
    ['BTC',[1,2,3,0]],['BTC',[1,2,3,-1]],['BTC',[1,2,3,Infinity]],
    ['BTC',[1,2,3,NaN]],['BTC',[1,2,3,'4']],
    ['BTC',Array.from({length:1001},()=>1)],
  ])assert.throws(()=>describeSampleChart(market,points),RangeError);
});
test('E1 chart explicitly identifies fake sample indices instead of clock ticks',()=>{
  for(const index of ['01','13','26','39','52','64'])
    assert.match(html,new RegExp('<span>#'+index+'</span>'));
  assert.match(html,/class="chart-axis" aria-label="가상 샘플 순서, 실제 시간 아님"/);
  assert.doesNotMatch(html,/<div class="chart-axis">[\s\S]*?08:00/);
  assert.match(html,/MOCK LOW/);
  assert.match(html,/MOCK HIGH/);
  for(const id of ['chart-sample-low','chart-sample-high','chart-sample-description'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(html,/id="market-chart"[^>]*aria-describedby="chart-sample-description"/);
  assert.match(html,/class="chart-sample-description" aria-live="polite"/);
  assert.match(css,/\.chart-sample-description\{/);
});
test('E1 market switching updates visible mock range and screen-reader description',()=>{
  assert.match(js,/const summary=describeSampleChart\(view\.market,points\)/);
  assert.match(js,/byId\('chart-sample-low'\)\.textContent=FORMAT_USD\.format\(summary.low\)/);
  assert.match(js,/byId\('chart-sample-high'\)\.textContent=FORMAT_USD\.format\(summary.high\)/);
  assert.match(js,/byId\('chart-sample-description'\)\.textContent=summary.accessibilityText/);
  assert.match(js,/renderChart\(\);\s*renderBook\(\);\s*renderTrades\(\)/);
  assert.match(html,/가격 데이터: 고정 데모 샘플/);
  assert.match(html,/connect-src 'none'/);
  assert.doesNotMatch(js,/fetch\(|WebSocket|XMLHttpRequest|eth_requestAccounts|eth_sendTransaction/);
});
