import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const read=name=>readFileSync(fileURLToPath(new URL('./'+name,import.meta.url)),'utf8');
const styles=read('styles.css');
const trade=read('trade.css');
const html=read('trade.html');
function cssRule(css,selector){
  const start=css.indexOf(selector+'{');
  assert.notEqual(start,-1,'missing '+selector+' CSS rule');
  return css.slice(start+selector.length+1,css.indexOf('}',start));
}
function contrast(foreground,background){
  const luminance=hex=>{
    const rgb=hex.match(/^#([0-9a-f]{6})$/i)?.[1];
    assert.ok(rgb,'expected six-digit hex color: '+hex);
    return [0,2,4].map(i=>parseInt(rgb.slice(i,i+2),16)/255)
      .map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4)
      .reduce((sum,value,i)=>sum+value*[0.2126,0.7152,0.0722][i],0);
  };
  const [first,second]=[luminance(foreground),luminance(background)];
  return (Math.max(first,second)+0.05)/(Math.min(first,second)+0.05);
}
test('UX-HL-01-V1 tiny chart sample-axis labels pass readable contrast on the actual panel background',()=>{
  const axis=cssRule(styles,'.chart-axis');
  const panel=cssRule(styles,'.panel');
  assert.match(axis,/font-size:10px/);
  assert.match(panel,/background:var\(--panel\)/);
  const textColor=axis.match(/(?:^|;)color:(#[0-9a-f]{6})/i)?.[1];
  const panelColor=styles.match(/--panel:(#[0-9a-f]{6})/i)?.[1];
  assert.ok(textColor&&panelColor);
  const ratio=contrast(textColor,panelColor);
  assert.ok(ratio>=7,'small 10px chart axis samples must remain comfortably legible (AAA 7:1); got '+ratio.toFixed(2)+':1');
});
test('UX-HL-01-V1 all six synthetic sample indices stay visible, labeled as non-time data',()=>{
  for(const marker of ['01','13','26','39','52','64'])
    assert.match(html,new RegExp('<span>#'+marker+'</span>'));
  assert.match(html,/class="chart-axis" aria-label="가상 샘플 순서, 실제 시간 아님"/);
  assert.doesNotMatch(trade,/\.trade-shell \.chart-axis\s*\{[^}]*color:/);
  assert.match(html,/connect-src 'none'/);
});
