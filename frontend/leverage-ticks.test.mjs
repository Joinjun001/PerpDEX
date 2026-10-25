import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const read=name=>readFileSync(fileURLToPath(new URL('./'+name,import.meta.url)),'utf8');
const html=read('trade.html');
const css=read('trade.css');

test('UX-HL-02-O1 slider tick labels represent real 1–10 leverage stops',()=>{
  assert.match(html,/id="leverage"[^>]*type="range"[^>]*min="1"[^>]*max="10"[^>]*step="1"/);
  const ticks=html.match(/<div class="leverage-ticks">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(ticks,'expected visible leverage tick labels');
  assert.deepEqual([...ticks.matchAll(/<span>([^<]+)<\/span>/g)].map(m=>m[1]),['1×','3×','5×','10×']);
});

test('UX-HL-02-O1 intermediate leverage ticks align with exact slider steps, not equal spacing',()=>{
  assert.match(css,/\/\* UX-HL-02-O1/);
  assert.match(css,/\.trade-shell \.leverage-ticks\s*\{[^}]*position:relative[^}]*display:block/);
  assert.match(css,/\.trade-shell \.leverage-ticks span:nth-child\(2\)\s*\{[^}]*left:22\.22%/);
  assert.match(css,/\.trade-shell \.leverage-ticks span:nth-child\(3\)\s*\{[^}]*left:44\.44%/);
  assert.match(css,/\.trade-shell \.leverage-ticks span:first-child\s*\{[^}]*left:0/);
  assert.match(css,/\.trade-shell \.leverage-ticks span:last-child\s*\{[^}]*right:0/);
  assert.match(css,/\.trade-shell \.leverage-ticks span\s*\{[^}]*pointer-events:none/);
});
