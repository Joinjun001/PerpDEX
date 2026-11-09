import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {MARKETS,FORMAT_USD} from './preview-model.mjs';

const read=name=>readFileSync(fileURLToPath(new URL('./'+name,import.meta.url)),'utf8');
const html=read('trade.html'),css=read('trade.css'),js=read('main.js');

test('UX-HL-06-C2: 매수·매도 영역과 spread/reference는 출처를 명시하고 동적 ID 계약을 유지한다',()=>{
  const book=html.match(/<section id="market-depth-book"[\s\S]*?<\/section>/)?.[0];
  assert.ok(book,'book markup is missing');
  assert.match(book,/class="book-side-label ask-label" aria-hidden="true"/);
  assert.match(book,/ASKS · 매도/);
  assert.match(book,/class="book-side-label bid-label" aria-hidden="true"/);
  assert.match(book,/BIDS · 매수/);
  assert.equal((book.match(/MOCK_SAMPLE · 7 levels/g)||[]).length,2);
  assert.match(book,/class="book-mid-reference"/);
  assert.match(book,/REFERENCE · MOCK/);
  assert.match(book,/id="book-mid"/);
  assert.match(book,/class="book-mid-spread"/);
  assert.match(book,/SPREAD <output id="book-spread"[^>]*>—<\/output> <small>MOCK<\/small>/);
  assert.match(book,/합성 최우선 매도 − 매수/);
  assert.match(book,/모의 호가 · 실제 거래 상대방 없음/);
  assert.match(book,/id="asks"[^>]*role="list"/);
  assert.match(book,/id="bids"[^>]*role="list"/);
  assert.doesNotMatch(book,/24h|Last trade:|Live |Available Balance/);
});

test('UX-HL-06-C2: 가격·수량·누적량은 동일한 3열 수치 그리드를 사용한다',()=>{
  assert.match(css,/--depth-cols:minmax\(0,1\.35fr\) minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(css,/\.market-depth-surface \.book-header,\s*\.trade-shell \.market-depth-surface \.book-row\s*\{\s*grid-template-columns:var\(--depth-cols\)/);
  assert.match(css,/font-variant-numeric:tabular-nums/);
  assert.match(css,/font-feature-settings:"tnum" 1/);
  assert.match(css,/\.market-depth-surface \.book-row\{[^}]*font-size:11\.5px/);
  assert.match(css,/\.market-depth-surface \.book-row>span:not\(:first-child\)\{color:#d8e4ed\}/);
  assert.match(css,/\.market-depth-surface \.book-row::before\{[\s\S]*?linear-gradient/);
  assert.match(css,/\.market-depth-surface \.book-row.bid::before\{[^}]*linear-gradient/);
  assert.match(css,/\.market-depth-surface \.book-side-label/);
  assert.match(css,/\.market-depth-surface \.trade-log-panel \.trade-row/);
});

test('UX-HL-06-C2: 고정 합성 기준가와 스프레드는 실제 모델의 계산·ARIA 값을 그대로 사용한다',()=>{
  assert.match(js,/const displayedSpread=FORMAT_USD\.format\(2\*m\.depthStep\)/);
  assert.match(js,/byId\('book-spread'\)\.textContent=displayedSpread/);
  assert.match(js,/byId\('book-spread'\)\.setAttribute\('aria-label',/);
  for(const symbol of Object.keys(MARKETS)){
    const m=MARKETS[symbol];
    const bid=m.price-m.depthStep,ask=m.price+m.depthStep;
    const spread=ask-bid;
    assert.ok(Math.abs(spread-2*m.depthStep)<0.0000001);
    assert.ok(Number.isFinite(spread)&&spread>0);
  }
  assert.doesNotMatch(js,/\b(?:fetch|XMLHttpRequest|WebSocket|eth_sendTransaction)\s*\(/);
});

test('UX-HL-06-C2: 1330/760/360 CSS 분기와 접기·탭 숨김 처리 유지',()=>{
  assert.match(css,/@media\(max-width:1330px\)\{\s*\.trade-shell \.market-depth-surface/);
  assert.match(css,/@media\(max-width:760px\)\{\s*\.trade-shell \.market-depth-surface/);
  assert.match(css,/@media\(max-width:360px\)\{\s*\.trade-shell \.market-depth-surface/);
  assert.match(css,/\.market-depth-surface>\.orderbook-panel\[hidden\]/);
  assert.match(css,/\.market-depth-surface>\.trade-log-panel\[hidden\]/);
  assert.match(css,/\.market-column\[data-mobile-collapsed="true"\]>\.market-depth-surface/);
  assert.match(css,/\.market-depth-tab:focus-visible\{/);
  assert.match(html,/aria-controls="market-depth-surface"/);
  assert.match(html,/aria-controls="market-depth-book"/);
  assert.match(html,/aria-controls="market-depth-trades"/);
});

test('UX-HL-06-C2: 밝아진 열 머리글과 텍스트는 기본 다크 패널 대비 구분된다',()=>{
  const color=hex=>hex.match(/[0-9a-f]{2}/gi).map(value=>parseInt(value,16)/255)
    .map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
  const lum=h=>color(h).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0);
  const contrast=(fg,bg)=>{const a=lum(fg),b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
  assert.ok(contrast('a6bccd','182734')>=4.5,'header labels should remain readable');
  assert.ok(contrast('d8e4ed','17222d')>=4.5,'numeric totals should remain readable');
  assert.ok(contrast('aebfcc','1c313a')>=4.5,'spread description should remain readable');
});
