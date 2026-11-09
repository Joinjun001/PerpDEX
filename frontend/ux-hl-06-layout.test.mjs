import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const read = name => readFileSync(fileURLToPath(new URL('./' + name, import.meta.url)), 'utf8');
const html = read('trade.html');
const css = read('trade.css');
const main = read('main.js');

test('UX-HL-06-A: 계정 패널은 독립 주문 패널과 같은 거래 그리드 안에 배치된다', () => {
  assert.match(html, /class="dashboard-grid terminal-grid"[\s\S]*?class="chart-column"[\s\S]*?class="market-column"[\s\S]*?class="panel order-panel"[\s\S]*?<\/aside>\s*<section class="bottom-grid" id="portfolio"/);
  assert.match(html, /id="portfolio"[\s\S]*?<\/section>\s*<\/div>\s*<\/main>/);
  assert.equal((html.match(/id="portfolio"/g) || []).length, 1);
  assert.match(css, /grid-template-areas:"chart book ticket" "account account ticket"/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) minmax\(218px,19%\) minmax\(280px,21%\)/);
  assert.match(css, /\.terminal-grid>\.bottom-grid\{[^}]*grid-area:account/);
});

test('UX-HL-06-A: 모바일에서 차트·주문·호가·계정 순서를 보존하고 수평 폭을 제한한다', () => {
  assert.match(css, /@media\(max-width:1070px\)[\s\S]*?grid-template-areas:"chart ticket" "book ticket" "account account"/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?grid-template-areas:"chart" "ticket" "book" "account"/);
  assert.match(css, /@media\(max-width:650px\)[\s\S]*?\.topbar \.main-nav\{[\s\S]*?display:flex;order:3;width:100%/);
  assert.match(css, /\.terminal-grid>\.bottom-grid\{[\s\S]*?min-width:0/);
});

test('UX-HL-06-A: 헤더 내비게이션과 출처 표시는 미구현 기능을 활성화하지 않는다', () => {
  assert.match(html, /href="\.\/trade.html" class="nav-active" aria-current="page"/);
  assert.match(html, /href="#portfolio">Portfolio<\/a>/);
  assert.match(html, /rel="noopener noreferrer" class="nav-docs"/);
  assert.match(html, /MARKETS <span>MOCK_SAMPLE<\/span>/);
  assert.match(html, /MOCK_SAMPLE · 실제 시세 미연결/);
  assert.match(html, /SIMULATION PREVIEW/);
  assert.match(html, /class="wallet-btn" type="button" disabled/);
  assert.match(html, /ACCOUNT DATA · UNAVAILABLE/);
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(main, /\b(?:fetch|XMLHttpRequest|WebSocket|eth_sendTransaction)\s*\(/);
});
