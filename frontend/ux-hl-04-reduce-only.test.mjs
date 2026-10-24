import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const read=name=>readFileSync(fileURLToPath(new URL('./'+name,import.meta.url)),'utf8');
const html=read('trade.html');
const css=read('trade.css');
const main=read('main.js');
const preview=read('preview-model.mjs');
const review=read('order-review.mjs');

test('UX-HL-04-A1 Reduce Only is visibly unavailable and natively disabled',()=>{
  const control=html.match(/<input\b[^>]*id="reduce-only"[^>]*>/)?.[0];
  assert.ok(control,'expected Reduce Only input');
  assert.match(control,/type="checkbox"/);
  assert.match(control,/disabled(?:\s|>)/);
  assert.doesNotMatch(control,/\schecked(?:\s|>)/);
  assert.match(control,/aria-describedby="reduce-only-help"/);
  assert.match(html,/<label[^>]*for="reduce-only"[^>]*>[^<]*Reduce Only/);
  assert.match(html,/id="reduce-only-help"[^>]*>[^<]*포지션[^<]*검증[^<]*미연결/);
});

test('UX-HL-04-A1 disabled option cannot become a real execution or simulated claim',()=>{
  const form=html.match(/<form id="order-form"[\s\S]*?<\/form>/)?.[0];
  assert.ok(form);
  assert.match(form,/id="reduce-only"/);
  assert.match(form,/LOCAL|Preview|미리보기/);
  assert.match(css,/\.trade-shell \.reduce-only-option/);
  assert.match(css,/\.trade-shell \.reduce-only-option input:disabled/);
  assert.doesNotMatch(main,/\b(?:fetch|XMLHttpRequest|WebSocket|eth_sendTransaction)\s*\(/);
  assert.doesNotMatch(preview,/reduceOnly|reduce_only/);
  assert.doesNotMatch(review,/reduceOnly|reduce_only/);
  assert.match(html,/connect-src 'none'/);
});
