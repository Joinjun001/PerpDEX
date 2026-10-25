import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const read=name=>readFileSync(fileURLToPath(new URL('./'+name,import.meta.url)),'utf8');
const html=read('trade.html');
const css=read('trade.css');
const main=read('main.js');
const model=read('preview-model.mjs');
const review=read('order-review.mjs');

test('UX-HL-04-B1 margin section lists all three independently unavailable account metrics',()=>{
  const form=html.match(/<form id="order-form"[\s\S]*?<\/form>/)?.[0];
  assert.ok(form,'margin must be within the order form');
  const section=form.match(/<section class="account-margin-status"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section,'missing account margin status section');
  assert.match(section,/data-source="UNAVAILABLE"/);
  assert.match(section,/aria-labelledby="account-margin-title"/);
  assert.match(section,/aria-describedby="account-margin-help"/);
  assert.match(section,/id="account-margin-title"[^>]*>Account Margin/);
  assert.match(section,/ACCOUNT DATA[^<]*UNAVAILABLE/);
  for(const [id,label] of [
    ['available-margin','Available Margin'],
    ['reserved-margin','Reserved Margin'],
    ['position-margin','Position Margin'],
  ]){
    const row=section.match(new RegExp('<div class="account-margin-row"[\\s\\S]*?<dt>'+label+'</dt>[\\s\\S]*?<dd id="'+id+'"[^>]*>([\\s\\S]*?)<\\/dd>'))?.[1];
    assert.ok(row,'missing '+label+' value');
    assert.match(row,/—/,'unavailable must not be presented as numeric zero');
    assert.match(row,/미연결/);
    assert.doesNotMatch(row,/[0-9]+(?:\.[0-9]+)?/,'must not make up account balances');
  }
  assert.match(section,/id="account-margin-help"[^>]*>/);
  assert.match(section,/인증된 계정/);
  assert.match(section,/Indicative margin/);
  assert.match(section,/MOCK/);
});

test('UX-HL-04-B1 no fetched or derived account margin and demo calculation stays separate',()=>{
  assert.match(html,/id="account-margin-help"/);
  assert.match(html,/id="margin"[^>]*>—<\/strong>/,
    'static cost preview is unavailable until the DEMO estimator initializes');
  assert.match(main,/formatDemoUsdAmount\(result\.indicativeMargin\)/,
    'validated demo estimator fills the separate indicative margin after initialization');
  assert.match(html,/id="reduce-only"[^>]*disabled/);
  assert.doesNotMatch(main,/account-margin-status|available-margin|reserved-margin|position-margin/);
  assert.doesNotMatch(model,/account-margin-status|available-margin|reserved-margin|position-margin/);
  assert.doesNotMatch(review,/account-margin-status|available-margin|reserved-margin|position-margin/);
  assert.doesNotMatch(main,/\b(?:fetch|XMLHttpRequest|WebSocket|eth_sendTransaction)\s*\(/);
  assert.match(html,/connect-src 'none'/);
});

test('UX-HL-04-B1 narrow ticket displays readable margin rows without overflow',()=>{
  assert.match(css,/\.trade-shell \.account-margin-status/);
  assert.match(css,/\.trade-shell \.account-margin-row/);
  assert.match(css,/\.trade-shell \.account-margin-status dd/);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
});
