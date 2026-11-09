import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {MARKETS,sampleChart} from './preview-model.mjs';
import {sampleCandles,sampleCandlePaths,SAMPLE_GROUP_SIZES} from './sample-candles.mjs';

const read = name=>readFileSync(fileURLToPath(new URL('./'+name,import.meta.url)),'utf8');

test('UX-HL-06-B: 고정 64개 가격 샘플에서만 4/8개 묶음 OHLC를 산출한다',()=>{
  for(const market of Object.keys(MARKETS)){
    const points=sampleChart(market,64);
    const before=points.slice();
    for(const groupSize of SAMPLE_GROUP_SIZES){
      const bars=sampleCandles(points,groupSize);
      assert.equal(bars.length,64/groupSize);
      assert.equal(Object.isFrozen(bars),true);
      bars.forEach((bar,i)=>{
        const span=points.slice(i*groupSize,(i+1)*groupSize);
        assert.deepEqual([bar.firstSample,bar.lastSample],[i*groupSize+1,(i+1)*groupSize]);
        assert.equal(bar.open,span[0]);
        assert.equal(bar.close,span.at(-1));
        assert.equal(bar.high,Math.max(...span));
        assert.equal(bar.low,Math.min(...span));
        assert.equal(Object.isFrozen(bar),true);
      });
      assert.equal(bars[0].open,points[0]);
      assert.equal(bars.at(-1).close,MARKETS[market].price);
      assert.equal(Math.min(...bars.map(c=>c.low)),Math.min(...points));
      assert.equal(Math.max(...bars.map(c=>c.high)),Math.max(...points));
    }
    assert.deepEqual(points,before,'source fixture must be unchanged');
  }
});
test('UX-HL-06-B: invalid input and unsupported grouping are rejected',()=>{
  for(const [points,size] of [
    [null,4],[{},4],[[],4],[[1,2,3],4],[[1,2,3,0],4],
    [[1,2,3,'4'],4],[[1,2,3,NaN],4],[[1,2,3,Infinity],4],
    [[1,2,3,-1],4],[[1,2,3,4],3],[[1,2,3,4],true],
    [[1,2,3,4,5],4],
  ])assert.throws(()=>sampleCandles(points,size),RangeError);
});
test('UX-HL-06-B: SVG candle paths are deterministic and finite',()=>{
  for(const market of Object.keys(MARKETS)){
    const points=sampleChart(market,64);
    for(const size of [4,8]){
      const candles=sampleCandles(points,size);
      const config={low:Math.min(...points),high:Math.max(...points)};
      const paths=sampleCandlePaths(candles,config);
      assert.ok(paths.upWicks||paths.downWicks);
      assert.ok(paths.upBodies||paths.downBodies);
      assert.equal((paths.upWicks.match(/M/g)||[]).length+(paths.downWicks.match(/M/g)||[]).length,candles.length);
      assert.ok(paths.bodyWidth>0&&paths.bodyWidth<=28);
      assert.ok(Number.isFinite(paths.lastY)&&paths.lastY>=35&&paths.lastY<=260);
      for(const k of ['upWicks','downWicks','upBodies','downBodies'])
        assert.doesNotMatch(paths[k],/NaN|Infinity|undefined/);
      assert.deepEqual(sampleCandlePaths(candles,config),paths);
    }
  }
  assert.throws(()=>sampleCandlePaths([],{}),RangeError);
  assert.throws(()=>sampleCandlePaths([{open:1,high:2,low:0,close:1}],{low:1,high:2}),RangeError);
  assert.throws(()=>sampleCandlePaths([{open:1,high:2,low:1,close:1}],{low:2,high:1}),RangeError);
});
test('UX-HL-06-B: 차트 시각 조작과 실시간 데이터/사용 불가 기능은 별도 표기된다',()=>{
  const html=read('trade.html'),css=read('trade.css'),js=read('main.js');
  for(const id of ['chart-line-mode','chart-candle-mode','chart-group-4','chart-group-8',
    'chart-line-layer','chart-candle-layer','chart-mode-description',
    'chart-candle-up-wicks','chart-candle-down-wicks','chart-candle-up-bodies','chart-candle-down-bodies']){
    assert.ok(html.includes('id="'+id+'"'),id);
  }
  assert.match(html,/Sample OHLC/);
  assert.match(html,/실제 시각·캔들 데이터 미연결/);
  assert.match(html,/실제 거래량·지표 데이터 미연결/);
  assert.match(html,/Volume \/ Indicators<\/button>/);
  assert.match(html,/시각·거래량 미연결<\/small>/);
  assert.match(html,/id="chart-line-mode"[^>]*aria-pressed="true"/);
  assert.match(html,/id="chart-candle-mode"[^>]*aria-pressed="false"/);
  assert.match(html,/id="chart-candle-layer" display="none"/);
  assert.match(css,/\.chart-unavailable-note\{/);
  assert.match(js,/renderSampleCandleLayer\(points,summary\)/);
  assert.doesNotMatch(js,/\b(?:fetch|WebSocket|XMLHttpRequest|eth_sendTransaction)\s*\(/);
});
