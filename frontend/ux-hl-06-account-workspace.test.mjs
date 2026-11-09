import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {ACCOUNT_TABS,accountViewFor} from './account-tabs-model.mjs';

const read=name=>readFileSync(fileURLToPath(new URL('./'+name,import.meta.url)),'utf8');
const html=read('trade.html'),css=read('trade.css');
const tabs=read('account-tabs.js'),renderer=read('account-tabs-renderer.mjs');
const hints=read('account-table-scroll-hint.mjs');

test('UX-HL-06-E1 only the original five account tabs and disconnected state badges exist',()=>{
  assert.equal(ACCOUNT_TABS.length,5);
  const markup=html.slice(html.indexOf('<section class="bottom-grid" id="portfolio"'));
  assert.equal((markup.match(/role="tab"/g)||[]).length,5);
  assert.equal((markup.match(/role="tabpanel"/g)||[]).length,5);
  assert.equal((markup.match(/class="account-state-label" data-account-state-label=/g)||[]).length,5);
  assert.equal((markup.match(/>ACCOUNT NOT CONNECTED<\/span>/g)||[]).length,5);
  assert.equal((markup.match(/<tbody><\/tbody>/g)||[]).length,5);
  assert.doesNotMatch(markup,/id="account-tab-balances"|role="tab"[^>]*>Balances<\/button>/);
  assert.match(markup,/ACCOUNT · UNAVAILABLE/);
  assert.match(markup,/계정 조회 미연결 · ‘기록 없음’으로 판정하지 않습니다/);
  assert.match(markup,/ACCOUNT DATA UNAVAILABLE/);
});
test('UX-HL-06-E1 static disconnected view hides every data table until validated rendering',()=>{
  for(const {id,label} of ACCOUNT_TABS){
    const start=html.indexOf('<section id="account-panel-'+id+'"');
    assert.ok(start>=0);
    const end=html.indexOf('</section>',start);
    const panel=html.slice(start,end);
    assert.match(panel,new RegExp('<div class="account-table-scroll" role="region" aria-label="'+id+' 표 가로 탐색" tabindex="-1"><table class="account-table" hidden aria-label="'+label+'">'));
    assert.match(panel,new RegExp('data-account-state-label="'+id+'"'));
    assert.match(panel,new RegExp('data-account-view="'+id+'" role="status" aria-live="polite"'));
    assert.match(panel,new RegExp('id="account-table-hint-'+id+'" class="account-table-hint" hidden'));
    assert.match(panel,/<tbody><\/tbody>/);
    assert.equal(accountViewFor(id,'disconnected').label,'ACCOUNT NOT CONNECTED');
    assert.equal(accountViewFor(id,'empty').label,'NO RECORDS');
  }
  assert.match(css,/\.account-table\[hidden\]\{display:none!important\}/);
});
test('UX-HL-06-E1 account status changes only through gated account renderer, not fake empty rows',()=>{
  assert.match(renderer,/const stateLabel=root\.querySelector\('\[data-account-state-label=/);
  assert.match(renderer,/els\.stateLabel\.textContent=state==='ready'\?'':accountViewFor\(tabId,state\)\.label/);
  assert.match(renderer,/els\.table\.hidden=true/);
  assert.match(renderer,/els\.table\.hidden=false/);
  assert.match(renderer,/allowValidatedRecords=false/);
  assert.match(tabs,/renderAccountTabSnapshot\(root,ACCOUNT_TABS\[i\]\.id,\{state:'disconnected'\}\)/);
  assert.match(tabs,/tab\.setAttribute\('aria-selected',String\(active\)\)/);
  assert.match(tabs,/tab\.tabIndex=active\?0:-1/);
  assert.match(tabs,/tab\.focus\(\{preventScroll:true\}\)/);
  assert.doesNotMatch(tabs,/(?:fetch|XMLHttpRequest|eth_requestAccounts|eth_sendTransaction)\s*\(/);
  assert.match(html,/connect-src 'none'/);
});
test('UX-HL-06-E1 responsive account table and tab overflow only receive keyboard focus when meaningful',()=>{
  assert.match(css,/\.terminal-grid \.account-tab\[aria-selected="true"\]/);
  assert.match(css,/\.terminal-grid \.account-state-label\{/);
  assert.match(css,/\.account-empty\[data-account-state="empty"\] \.account-state-label/);
  assert.match(css,/\.account-empty\[data-account-state="error"\] \.account-state-label/);
  assert.match(css,/\.terminal-grid \.account-table th\{/);
  assert.match(css,/\.terminal-grid \.account-table td\{/);
  assert.match(css,/@media\(max-width:760px\)\{[\s\S]*?\.terminal-grid \.account-tab\{min-height:44px/);
  assert.match(css,/\.terminal-grid \.account-table-scroll:focus-visible\{/);
  assert.match(hints,/visible:!table\.hidden/);
  assert.match(hints,/container\.tabIndex=show\?0:-1/);
  assert.match(hints,/container\.setAttribute\('aria-describedby',hint\.id\)/);
  assert.match(hints,/container\.addEventListener\('scroll',update,\{passive:true\}\)/);
});
