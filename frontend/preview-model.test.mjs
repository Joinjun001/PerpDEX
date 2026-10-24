import test from 'node:test';
import assert from 'node:assert/strict';
import {MARKETS,previewEstimate,validPreviewQuantity,sampleChart} from './preview-model.mjs';
test('시장별 모의 표시 데이터는 고정되고 외부 시세 호출이 없다',()=>{
  assert.deepEqual(Object.keys(MARKETS),['BTC','ETH','SOL']);
  assert.ok(Object.values(MARKETS).every(m=>m.price>0&&Number.isFinite(m.price)));
  assert.deepEqual(sampleChart('BTC'),sampleChart('BTC'));
  assert.equal(sampleChart('ETH').length,64);
});
test('주문 금액·참고 증거금 계산은 데모 결과만 반환한다',()=>{
  const p=previewEstimate('BTC','0.05',3);
  assert.equal(p.notional,3262.025);
  assert.ok(Math.abs(p.indicativeMargin-1087.3416666666667)<1e-8);
  assert.equal(p.orderExecutable,false);
  assert.equal(p.feesConfigured,false);
  assert.equal(p.simulated,true);
});
test('부적절한 수량·레버리지·마켓은 거부한다',()=>{
  for(const q of ['',0,-1,NaN,Infinity,'abc','1e999',101,0.00001]){
    assert.equal(validPreviewQuantity(q),false);
    assert.throws(()=>previewEstimate('BTC',q,3),RangeError);
  }
  for(const l of [0,11,1.5,'not a number',null]){
    assert.throws(()=>previewEstimate('BTC','0.05',l),RangeError);
  }
  assert.throws(()=>previewEstimate('UNKNOWN','0.05',3),RangeError);
});
test('UX-HL-02-C1: reject non-decimal strings and implicit JS coercion in quantity',()=>{
  for(const invalid of ['0x1','0b1','0o1',' 0.05 ','0.05 USD','1_0','', ' ',
    true,false,[1],[0.05],{valueOf:()=>0.05},new Number(0.05),0n,
    'Infinity','NaN','1e999','1e','1..0']){
    assert.equal(validPreviewQuantity(invalid),false,String(invalid));
    assert.throws(()=>previewEstimate('BTC',invalid,3),RangeError);
  }
});
test('UX-HL-02-C1: preserve decimal and valid native number input forms at limits',()=>{
  for(const [input,expected] of [['0.0001',0.0001],['1e-4',0.0001],
    ['1E-4',0.0001],['.05',0.05],['0.05',0.05],['1.',1],
    ['100',100],[0.05,0.05],[100,100]]){
    assert.equal(validPreviewQuantity(input),true,String(input));
    const p=previewEstimate('BTC',input,3);
    assert.equal(p.quantity,expected);
    assert.equal(p.orderExecutable,false);
  }
});
test('샘플 차트는 요청하지 않은 외부 데이터나 음수 가격 없이 생성한다',()=>{
  for(const market of Object.keys(MARKETS)){
    const arr=sampleChart(market);
    assert.equal(arr.length,64);
    assert.ok(arr.every(x=>Number.isFinite(x)&&x>0));
    assert.ok(Math.abs(arr.at(-1)-MARKETS[market].price)<0.01);
  }
  for(const n of [0,2,1001,NaN])assert.throws(()=>sampleChart('BTC',n),RangeError);
});
