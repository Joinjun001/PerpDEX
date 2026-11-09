import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {ACCOUNT_TABS} from './account-tabs-model.mjs';

const source=name=>readFileSync(fileURLToPath(new URL('./'+name,import.meta.url)),'utf8');
const html=source('trade.html'),main=source('main.js');
const depth=source('market-depth-tabs.js'),mobile=source('mobile-market-depth.js');
const accounts=source('account-tabs.js'),model=source('preview-model.mjs');
const review=source('order-review.mjs');

test('UX-HL-06-F2a market/chart active state, sample origin and unavailable real-time tools',()=>{
  assert.match(html,/id="market-picker" role="group" aria-label="모의 시장 선택"/);
  assert.match(html,/id="market-stats-symbol" aria-live="polite" aria-atomic="true"/);
  assert.equal((html.match(/data-market="(?:BTC|ETH|SOL)"[^>]*aria-pressed=/g)||[]).length,3);
  assert.match(main,/b\.setAttribute\('aria-pressed',String\(active\)\)/);
  assert.match(main,/b\.setAttribute\('aria-label',b\.dataset\.market/);
  assert.match(main,/byId\('market-chart'\)\.setAttribute\('aria-label',ohlc/);
  assert.match(main,/byId\('chart-line-layer'\)\.setAttribute\('display',ohlc\?'none':'inline'\)/);
  assert.match(main,/byId\('chart-candle-layer'\)\.setAttribute\('display',ohlc\?'inline':'none'\)/);
  assert.equal((html.match(/id="chart-(?:group-[48]|line-mode|candle-mode)"/g)||[]).length,4);
  assert.match(html,/시각·거래량 미연결/);
  assert.match(html,/실제 시간봉·거래량 없음/);
});
test('UX-HL-06-F2a depth tabs and mobile disclosure retain focus and no-script fallback',()=>{
  assert.match(html,/id="market-depth-tablist"[^>]*role="tablist"[^>]*hidden/);
  assert.match(html,/id="market-depth-surface"/);
  assert.match(html,/aria-controls="market-depth-surface" aria-expanded="true"/);
  assert.match(depth,/panel\.hidden=!selected/);
  assert.match(depth,/button\.tabIndex=selected\?0:-1/);
  for(const key of ['ArrowRight','ArrowLeft','Home','End'])assert.ok(depth.includes("case '"+key+"':"));
  assert.match(depth,/select\('book'\)/);
  assert.match(mobile,/toggle\.hidden=false/);
  assert.match(mobile,/container\.dataset\.mobileCollapsed=String\(!open\)/);
  assert.match(html,/id="asks"[^>]*role="list"/);
  assert.match(html,/id="recent-trades"[^>]*role="list"/);
  assert.match(html,/SYNTHETIC LIQUIDITY/);
  assert.match(html,/GENERATED EXAMPLES/);
});
test('UX-HL-06-F2a disconnected account does not convert errors to empty rows or enable balances',()=>{
  const account=html.slice(html.indexOf('<section class="bottom-grid" id="portfolio"'));
  assert.equal(ACCOUNT_TABS.length,5);
  assert.equal((account.match(/role="tab"/g)||[]).length,5);
  assert.equal((account.match(/role="tabpanel"/g)||[]).length,5);
  assert.equal((account.match(/class="account-table" hidden/g)||[]).length,5);
  assert.equal((account.match(/<tbody><\/tbody>/g)||[]).length,5);
  assert.equal((account.match(/data-account-state-label=/g)||[]).length,5);
  assert.match(accounts,/renderAccountTabSnapshot\(root,ACCOUNT_TABS\[i\]\.id,\{state:'disconnected'\}\)/);
  assert.match(accounts,/tab\.tabIndex=active\?0:-1/);
  assert.match(accounts,/tab\.focus\(\{preventScroll:true\}\)/);
  assert.match(html,/ACCOUNT DATA UNAVAILABLE/);
  assert.doesNotMatch(account,/id="account-tab-balances"/);
});
test('UX-HL-06-F2a price source, review provenance and execution barriers remain explicit',()=>{
  assert.match(html,/data-source="MOCK_SAMPLE" aria-live="polite">REFERENCE · MOCK_SAMPLE/);
  assert.match(main,/view\.limitPriceEdited\?'USER_INPUT':'MOCK_DEFAULT'/);
  assert.match(main,/reviewedLimitPriceOrigin==='USER_INPUT'/);
  assert.match(main,/reviewedLimitPriceOrigin=view\.orderType==='LIMIT'/);
  assert.match(review,/limitPriceOrigin==='MOCK_DEFAULT'\?'가상 기준가 자동 입력 Limit Price'/);
  assert.match(main,/Limit Price \(MOCK default\)/);
  assert.match(html,/ACCOUNT · UNAVAILABLE/);
  assert.match(html,/data-source="UNAVAILABLE"/);
  assert.match(html,/id="reduce-only"[^>]*disabled/);
  assert.match(html,/id="preview-order"[^>]*disabled/);
  assert.match(html,/connect-src 'none'/);
  assert.match(html,/form-action 'none'/);
  assert.match(model,/executionGuaranteed:false/);
  for(const content of [main,depth,mobile,accounts,model,review])
    assert.doesNotMatch(content,/\b(?:fetch|XMLHttpRequest|WebSocket|eth_sendTransaction|eth_requestAccounts)\s*\(/);
});
