import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const read=name=>readFileSync(fileURLToPath(new URL('./'+name,import.meta.url)),'utf8');
const html=read('trade.html'),css=read('trade.css'),main=read('main.js');

test('UX-HL-06-D1 정보 순서는 Side→Type→Quantity→Limit→Leverage→MOCK estimate→CTA→Review→Risk',()=>{
  const ticket=html.match(/<aside class="panel order-panel"[\s\S]*?<\/aside>/)?.[0];
  assert.ok(ticket);
  const ids=[
    'buy-tab','market-type','quantity','limit-price','leverage',
    'reference-price','notional','margin','preview-order','order-result',
    'available-margin','reserved-margin','position-margin','reduce-only',
  ];
  const positions=ids.map(id=>ticket.indexOf('id="'+id+'"'));
  assert.ok(positions.every(v=>v!==-1),'all original event-target IDs must remain');
  assert.ok(positions.every((v,i)=>i===0||v>positions[i-1]),
    'reading/keyboard order must match visual section order: '+positions);
  assert.ok(ticket.indexOf('id="order-result"')<ticket.indexOf('</form>'),
    'focused review should follow CTA before secondary account/risk section');
  assert.ok(ticket.indexOf('id="order-result"')>ticket.indexOf('id="preview-order"'));
  assert.ok(ticket.indexOf('id="available-margin"')>ticket.indexOf('id="preview-order"'));
});

test('UX-HL-06-D1 출처/작동 범위는 가시 텍스트와 접근성 이름에 나타난다',()=>{
  assert.match(html,/class="ticket-status-strip" role="note" aria-label="주문 미리보기 데이터 출처"/);
  assert.match(html,/REFERENCE · MOCK_SAMPLE/);
  assert.match(html,/<h2 id="ticket-title">Order Preview<\/h2>/);
  assert.match(html,/ACCOUNT · UNAVAILABLE/);
  assert.match(html,/PREVIEW ESTIMATE/);
  assert.match(html,/MOCK_SAMPLE · 참고용/);
  assert.match(html,/id="preview-price-label"[^>]*>Reference price \(MOCK\)/);
  assert.match(html,/id="account-margin-title"[^>]*>Account Margin/);
  assert.match(html,/data-source="UNAVAILABLE"/);
  assert.match(html,/ACCOUNT DATA · UNAVAILABLE/);
  assert.match(html,/모의 주문 검토만 생성합니다. 실제 주문·지갑 서명·자금 이체 없음/);
  assert.match(html,/Fee \/ Funding<\/span><strong class="text-muted">Not configured/);
  assert.match(html,/id="reduce-only"[^>]*disabled/);
  assert.match(html,/지갑 및 인증된 계정·증거금 조회 API가 미연결 상태/);
  assert.match(html,/위의 Indicative margin은 입력 기반 MOCK 미리보기/);
  assert.match(html,/LOCAL PREVIEW · NO EXECUTION/);
  assert.match(html,/connect-src 'none'/);
  assert.match(html,/form-action 'none'/);
});

test('UX-HL-06-D1 초기 미리보기는 무JS 상태에서 비활성·대시이며 지갑 연결/거래 옵션을 활성화하지 않는다',()=>{
  for(const id of ['reference-price','notional','margin']){
    assert.match(html,new RegExp('id="'+id+'">—<\\/strong>'));
  }
  assert.match(html,/id="preview-order"[^>]*type="submit" disabled/);
  assert.match(html,/id="limit-price-field"[^>]*hidden/);
  assert.match(html,/id="limit-price"[^>]*disabled/);
  assert.match(html,/id="reduce-only"[^>]*disabled/);
  assert.match(html,/class="wallet-btn"[^>]*disabled/);
  assert.match(main,/previewOrderEstimate\(/);
  assert.match(main,/byId\('preview-order'\)\.focus\(\)/);
  assert.doesNotMatch(main,/\b(?:fetch|XMLHttpRequest|WebSocket|eth_sendTransaction|eth_requestAccounts)\s*\(/);
});

test('UX-HL-06-D1 우측 레일은 수치의 유연한 줄바꿈/CTA·모바일 터치 가독성을 포함한다',()=>{
  assert.match(css,/\.ticket-status-strip\{/);
  assert.match(css,/\.ticket-section-label\{/);
  assert.match(css,/\.ticket-estimate-heading\{/);
  assert.match(css,/\.ticket-secondary-status\{/);
  assert.match(css,/\.terminal-grid>\.order-panel \.summary-box strong\{[^}]*overflow-wrap:anywhere/);
  assert.match(css,/\.terminal-grid>\.order-panel \.submit-order\{[^}]*min-height:48px/);
  assert.match(css,/@media\(max-width:760px\)\{[\s\S]*?\.terminal-grid>\.order-panel \.quick-amounts button\{min-height:44px\}/);
  assert.match(css,/@media\(max-width:360px\)\{[\s\S]*?\.ticket-status-strip/);
  assert.match(css,/\.terminal-grid>\.order-panel \.order-result\{[\s\S]*?scroll-margin-top:12px/);
});
