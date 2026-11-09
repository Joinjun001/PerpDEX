import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {previewOrderEstimate} from './preview-model.mjs';

const read=name=>readFileSync(fileURLToPath(new URL('./'+name,import.meta.url)),'utf8');
const html=read('trade.html'),css=read('trade.css');
const js=read('main.js'),model=read('preview-model.mjs'),review=read('order-review.mjs');
const ticket=html.match(/<aside class="panel order-panel"[\s\S]*?<\/aside>/)?.[0]??'';
const risk=ticket.match(/<section class="risk-metrics-status"[\s\S]*?<\/section>/)?.[0]??'';

test('UX-HL-06-D2: 가격 출처는 초기 MOCK 상태와 Limit 사용자 입력 상태로 분리될 수 있다',()=>{
  assert.match(ticket,/id="ticket-price-source" data-source="MOCK_SAMPLE" aria-live="polite">REFERENCE · MOCK_SAMPLE/);
  assert.match(ticket,/id="preview-estimate-source">MOCK_SAMPLE · 참고용/);
  assert.match(js,/view\.limitPriceEdited\?'USER_INPUT':'MOCK_DEFAULT'/);
  assert.match(js,/source\.dataset\.source=priceSource/);
  assert.match(js,/LIMIT PRICE · MOCK_DEFAULT/);
  assert.match(js,/LIMIT PRICE · USER_INPUT/);
  assert.match(js,/byId\('preview-estimate-source'\)\.textContent=priceSource\+' · 참고용'/);
  assert.match(js,/byId\('preview-price-label'\)\.textContent=isLimit\?'Limit Price \(user input\)':'Reference price \(MOCK\)'/);
  assert.match(ticket,/초기 값은 MOCK_SAMPLE 기준 가격의 자동 입력값이며, 수정 후 USER_INPUT으로 표시합니다/);
});
test('UX-HL-06-D2: 세 가지 계정 증거금과 세 가지 위험 지표는 숫자가 아닌 미연결 상태를 표시한다',()=>{
  for(const [id,label] of [
    ['available-margin','Available Margin'],['reserved-margin','Reserved Margin'],
    ['position-margin','Position Margin']
  ]){
    const value=ticket.match(new RegExp('<dt>'+label+'</dt><dd id="'+id+'"[^>]*>([^<]*)<small>'))?.[1];
    assert.equal(value.trim(),'—',id);
  }
  assert.match(risk,/data-source="UNAVAILABLE"/);
  assert.match(risk,/aria-labelledby="risk-metrics-title" aria-describedby="risk-metrics-help"/);
  assert.match(risk,/id="risk-metrics-title">Execution &amp; Risk/);
  assert.match(risk,/class="risk-metrics-source">UNAVAILABLE/);
  for(const [id,label,state] of [
    ['fee-estimate-unavailable','Trading Fee','미설정'],
    ['funding-payment-unavailable','Funding Payment','미연결'],
    ['liquidation-price-unavailable','Liquidation Price','미산출'],
  ]){
    assert.match(risk,new RegExp('<dt>'+label+'</dt><dd id="'+id+'">— <small>'+state+'</small></dd>'));
  }
  assert.match(risk,/값이 표시되지 않는 것은 0을 의미하지 않습니다/);
  assert.doesNotMatch(risk,/(?:\$|USD )\d|0\.00|0%/,'unsupported risk values cannot be fabricated');
});
test('UX-HL-06-D2: 단순 Indicative Margin 설명은 실제 초기/유지증거금 및 계정가용액과 구분된다',()=>{
  const note=ticket.match(/<p id="preview-margin-note"[\s\S]*?<\/p>/)?.[0]??'';
  assert.match(note,/모의 명목가치 ÷ 모의 레버리지의 단순 참고 계산/);
  assert.match(note,/실제 이용 가능 잔고·초기\/유지증거금·청산 위험을 검증하지 않습니다/);
  assert.ok(ticket.indexOf('id="margin"')<ticket.indexOf('id="preview-margin-note"'));
  assert.ok(ticket.indexOf('id="preview-margin-note"')<ticket.indexOf('id="preview-order"'));
  for(const orderType of ['MARKET','LIMIT']){
    const result=previewOrderEstimate({
      market:'ETH',orderType,quantity:'0.05',leverage:5,limitPrice:'2000.50',
    });
    assert.equal(result.indicativeMargin,result.notional/5);
    assert.equal(result.orderExecutable,false);
    assert.equal(result.executionGuaranteed,false);
    assert.equal(result.feesConfigured,false);
  }
  assert.doesNotMatch(model,/account-margin-status|fee-estimate-unavailable|liquidation-price-unavailable/);
  assert.doesNotMatch(js,/available-margin|reserved-margin|position-margin|fee-estimate-unavailable|funding-payment-unavailable|liquidation-price-unavailable/);
});
test('UX-HL-06-D2: 지원하지 않는 옵션은 비활성 상태이며 위험 고지는 네이티브 disclosure로 읽을 수 있다',()=>{
  assert.match(ticket,/id="reduce-only"[^>]*type="checkbox" disabled/);
  assert.match(ticket,/id="reduce-only"[^>]*aria-describedby="reduce-only-help"/);
  assert.match(ticket,/class="reduce-only-unavailable">UNAVAILABLE/);
  const details=ticket.match(/<details class="risk-capability-details">[\s\S]*?<\/details>/)?.[0]??'';
  assert.match(details,/<summary>미지원 거래 기능과 위험 정보 안내<\/summary>/);
  assert.match(details,/TP\/SL, Cross\/Unified Margin, TWAP\/Chase/);
  assert.match(details,/서버 검증과 실계정·테스트넷 연동 전까지 사용할 수 없으며/);
  assert.doesNotMatch(details,/<(?:button|input)\b|\sopen(?:\s|>)/);
  assert.match(ticket,/Not configured<\/strong>/);
  assert.match(html,/connect-src 'none'/);
  assert.match(html,/form-action 'none'/);
  assert.doesNotMatch(js+review,/\b(?:fetch|XMLHttpRequest|WebSocket|eth_sendTransaction|eth_requestAccounts)\s*\(/);
});
test('UX-HL-06-D2: 위험 영역의 반응형 폭, 표 형태, 설명 접근성을 보존한다',()=>{
  assert.match(css,/\.terminal-grid>\.order-panel \.risk-metrics-status\{/);
  assert.match(css,/\.terminal-grid>\.order-panel \.risk-metrics-row\{/);
  assert.match(css,/\.terminal-grid>\.order-panel \.risk-metrics-row dd\{/);
  assert.match(css,/\.terminal-grid>\.order-panel \.risk-capability-details summary:focus-visible\{/);
  assert.match(css,/\.terminal-grid>\.order-panel \.preview-margin-note\{/);
  assert.match(css,/\.ticket-status-strip #ticket-price-source\[data-source="USER_INPUT"\]/);
  assert.match(css,/\.ticket-status-strip #ticket-price-source\[data-source="MOCK_DEFAULT"\]/);
  assert.match(css,/@media\(max-width:760px\)\{[\s\S]*?\.risk-capability-details summary\{[\s\S]*?min-height:44px/);
  assert.match(css,/@media\(max-width:360px\)\{[\s\S]*?\.risk-metrics-row\{[\s\S]*?flex-wrap:wrap/);
});
