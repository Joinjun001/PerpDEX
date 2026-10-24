import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const dir=fileURLToPath(new URL('.',import.meta.url));
const home=readFileSync(join(dir,'index.html'),'utf8');
const trade=readFileSync(join(dir,'trade.html'),'utf8');

test('홈페이지는 소개와 로드맵만 제공하고 거래 폼을 포함하지 않는다',()=>{
  assert.match(home,/id="architecture"/);
  assert.match(home,/id="roadmap"/);
  assert.match(home,/href="\.\/trade\.html"/);
  assert.match(home,/Sepolia/);
  assert.doesNotMatch(home,/id="order-form"/);
  assert.doesNotMatch(home,/id="market-chart"/);
  assert.doesNotMatch(home,/src="\.\/main\.js"/);
});
test('거래 전용 화면에는 모의 차트·주문 입력이 있고 대형 소개 히어로는 없다',()=>{
  for(const id of ['market-picker','market-chart','order-form','asks','bids','recent-trades','portfolio']){
    assert.ok(trade.includes('id="'+id+'"'),id);
  }
  assert.match(trade,/SIMULATION PREVIEW/);
  assert.match(trade,/src="\.\/main\.js"/);
  assert.match(trade,/href="\.\/"/);
  assert.doesNotMatch(trade,/class="intro"/);
  assert.doesNotMatch(trade,/class="architecture-grid"/);
});
test('두 페이지의 CSS/JS/assets 경로 및 내부 페이지 이동이 올바르다',()=>{
  for(const [name,html] of [['index.html',home],['trade.html',trade]]){
    for(const match of html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)){
      assert.ok(existsSync(join(dir,match[1])),name+': '+match[1]);
    }
    assert.match(html,/<html lang="ko">/);
    assert.match(html,/connect-src 'none'/);
    assert.match(html,/지갑/);
  }
  assert.match(home,/href="\.\/trade\.html"/);
  assert.match(trade,/href="\.\/"/);
});
test('거래 JS DOM 바인딩은 전부 거래 페이지에 존재한다',()=>{
  const js=readFileSync(join(dir,'main.js'),'utf8');
  const ids=[...js.matchAll(/byId\('([^']+)'\)/g)].map(m=>m[1]);
  assert.ok(ids.length>20);
  for(const id of ids)assert.ok(trade.includes('id="'+id+'"'),'undefined trade element: '+id);
  assert.doesNotMatch(js,/\b(fetch|XMLHttpRequest|WebSocket)\s*\(/);
});
test('홈페이지 CSP는 JS 실행을 금지하고 외부 네트워크를 차단한다',()=>{
  assert.match(home,/script-src 'none'/);
  assert.match(home,/connect-src 'none'/);
  assert.doesNotMatch(home,/<script\b/);
  assert.match(trade,/script-src 'self'/);
});
