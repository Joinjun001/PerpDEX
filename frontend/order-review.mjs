/**
 * UX-HL-02-B1 — structured *demo-only* review.
 * Generates presentation values only; no signature, transfer or execution.
 */
import {FORMAT_USD,formatDemoUsdAmount,previewOrderEstimate} from './preview-model.mjs';

export function createDemoOrderReview({market,side,orderType,quantity,leverage,limitPrice}){
  if(side!=='BUY'&&side!=='SELL')throw new RangeError('Unsupported preview side');
  const value=previewOrderEstimate({market,orderType,quantity,leverage,limitPrice});
  const rows=Object.freeze([
    Object.freeze({label:'방향',value:side==='BUY'?'Long / Buy':'Short / Sell'}),
    Object.freeze({label:'주문 유형',value:value.orderType==='MARKET'?'Market · DEMO':'Limit · DEMO'}),
    Object.freeze({label:'마켓',value:value.market+'-USD-PERP'}),
    Object.freeze({label:'가격 출처',value:value.orderType==='MARKET'?'MOCK Reference':'사용자 입력 Limit Price'}),
    Object.freeze({label:'가격',value:FORMAT_USD.format(value.price)}),
    Object.freeze({label:'수량',value:String(value.quantity)+' '+value.market}),
    Object.freeze({label:'레버리지',value:String(value.leverage)+'× (모의)'}),
    Object.freeze({label:'가상 명목가치',value:formatDemoUsdAmount(value.notional)}),
    Object.freeze({label:'참고 증거금',value:formatDemoUsdAmount(value.indicativeMargin)}),
  ]);
  return Object.freeze({
    title:'모의 주문 검토 · 주문 전송 없음',
    rows,
    notice:'실제 주문 아님 · 서버 전송 0건 · 지갑 서명 0건 · 체결 0건',
    unavailable:'수수료 · 펀딩 · 청산가 · 체결 가능성은 계산되지 않습니다.',
    simulated:true,
    orderExecutable:false,
  });
}
/** DOM rendering does not use innerHTML, all text is safe textContent. */
export function renderDemoOrderReview(panel,document,review,{onClose}={}){
  if(!panel||!document||!review||!Array.isArray(review.rows))throw new TypeError('Review rendering requires DOM and rows');
  const make=(tag,className,text)=>{
    const el=document.createElement(tag);
    if(className)el.className=className;
    if(text!==undefined)el.textContent=text;
    return el;
  };
  const heading=make('div','preview-review-heading');
  const title=make('strong','',review.title);
  const close=make('button','preview-review-close','닫기');
  close.type='button';
  close.setAttribute('aria-label','모의 주문 검토 닫기');
  close.addEventListener('click',()=>onClose?.());
  heading.append(title,close);
  const details=make('dl','preview-review-details');
  for(const {label,value} of review.rows){
    const row=make('div','preview-review-row');
    row.append(make('dt','',label),make('dd','',value));
    details.append(row);
  }
  const notice=make('p','preview-review-notice',review.notice);
  const unavailable=make('p','preview-review-unsupported',review.unavailable);
  panel.replaceChildren(heading,details,notice,unavailable);
  panel.hidden=false;
  panel.focus({preventScroll:true});
  return close;
}
