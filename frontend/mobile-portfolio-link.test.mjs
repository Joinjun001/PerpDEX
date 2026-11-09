import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const read=name=>readFileSync(fileURLToPath(new URL('./'+name,import.meta.url)),'utf8');
const html=read('trade.html');
const css=read('trade.css');

test('UX-HL-01-S1 mobile portfolio shortcut targets existing account section without script',()=>{
  assert.match(html,/id="portfolio"/);
  assert.match(html,/<nav class="main-nav"[^>]*>[\s\S]*?href="#portfolio"/);
  assert.match(html,/<a class="workspace-portfolio-link" href="#portfolio">계정 현황[^<]*<\/a>/);
  assert.match(html,/connect-src 'none'/);
});
test('UX-HL-01-S1 계정 단축 링크는 모바일에서 활성화되고 거래 내비게이션도 유지된다',()=>{
  assert.match(css, /\.topbar \.main-nav\{\s*display:flex;order:3;width:100%/);
  assert.match(css,/\.workspace-portfolio-link\{display:none\}/);
  const rule=css.match(/@media\(max-width:650px\)\{[^}]*\}/g)?.join('')??'';
  assert.match(rule,/\.workspace-portfolio-link/);
  assert.match(css,/\.workspace-portfolio-link\{[^}]*min-height:44px/);
  assert.doesNotMatch(html,/<button[^>]*class="workspace-portfolio-link"/);
});
