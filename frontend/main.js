import {MARKETS,FORMAT_USD,FORMAT_QTY,formatDemoUsdAmount,previewOrderEstimate,validPreviewQuantity,validPreviewLeverage,validPreviewLimitPrice,sampleChart,describeSampleChart} from './preview-model.mjs';
import {createDemoOrderReview,renderDemoOrderReview} from './order-review.mjs';
import {sampleCandles,sampleCandlePaths} from './sample-candles.mjs';

const byId=(id)=>document.getElementById(id);
const view={market:'BTC',side:'BUY',orderType:'MARKET',chartMode:'LINE',sampleGroup:4,limitPriceEdited:false};
const tickets={BTC:'₿',ETH:'◆',SOL:'◎'};
const prices=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

function node(tag,className,text){
  const n=document.createElement(tag);
  if(className)n.className=className;
  if(text!==undefined)n.textContent=text;
  return n;
}
function updateMarket(){
  const m=MARKETS[view.market];
  document.querySelectorAll('[data-market]').forEach(b=>{
    const active=b.dataset.market===view.market;
    b.classList.toggle('selected',active);
    b.setAttribute('aria-pressed',String(active));
    const sample=describeSampleChart(b.dataset.market,sampleChart(b.dataset.market,64));
    const delta=sample.changePercent;
    const pickerChange=byId('market-change-'+b.dataset.market);
    const changeLabel=(delta>=0?'+':'−')+Math.abs(delta).toFixed(2)+'%';
    pickerChange.textContent=changeLabel;
    pickerChange.className='market-change '+(delta>=0?'positive':'negative');
    // A market option's own accessible name must disclose that its price
    // and change are generated samples, not actionable live quotes.
    b.setAttribute('aria-label',b.dataset.market+'-USD-PERP 고정 모의 기준 가격 '+
      FORMAT_USD.format(MARKETS[b.dataset.market].price)+' USD · 샘플 변화 '+
      changeLabel+' · 실제 시세 아님');
  });
  byId('chart-title').replaceChildren(document.createTextNode(m.symbol+' / USD '),node('span','', 'Perpetual'));
  byId('chart-price').textContent=FORMAT_USD.format(m.price);
  // The visible "Sample change" must describe the generated series itself,
  // not the static fixture's trend-configuration metadata.
  const change=describeSampleChart(view.market,sampleChart(view.market,64)).changePercent;
  const ch=byId('chart-change');
  ch.textContent=(change>=0?'↗ +':'↘ −')+Math.abs(change).toFixed(2)+'%';
  ch.className=change>=0?'positive':'negative';
  byId('pair-icon').textContent=tickets[view.market];
  byId('pair-icon').className='pair-icon '+(view.market==='BTC'?'coin-btc':view.market==='ETH'?'coin-eth':'coin-sol');
  byId('market-stats-symbol').textContent=m.symbol+'-USD-PERP';
  document.title=m.symbol+'-USD-PERP · 거래 데모 · PerpDEX';
  byId('market-stats-reference').textContent=FORMAT_USD.format(m.price);
  const sampleChange=byId('market-stats-change');
  sampleChange.textContent=(change>=0?'+':'−')+Math.abs(change).toFixed(2)+'%';
  sampleChange.className=change>=0?'positive':'negative';
  byId('limit-price').value=m.price.toFixed(2);
  // A market change restores the seeded MOCK limit default, not a user quote.
  view.limitPriceEdited=false;
  byId('quantity-unit').textContent=m.symbol;
  byId('input-unit').textContent=m.symbol;
  byId('book-size-label').textContent='Size ('+m.symbol+')';
  byId('book-total-label').textContent='Total ('+m.symbol+')';
  byId('trade-size-label').textContent='Size ('+m.symbol+')';
  renderChart();
  renderBook();
  renderTrades();
  renderTicket();
  byId('order-result').hidden=true;
}
function renderChart(){
  const points=sampleChart(view.market,64);
  const summary=describeSampleChart(view.market,points);
  const min=summary.low,max=summary.high,span=max-min||1;
  const xy=points.map((p,i)=>[i/(points.length-1)*800,260-(p-min)/span*225]);
  const path=xy.map(([x,y],i)=>(i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)).join(' ');
  const last=xy.at(-1);
  byId('chart-line').setAttribute('d',path);
  byId('chart-area').setAttribute('d',path+' L800 284 L0 284 Z');
  byId('chart-point').setAttribute('cx',String(last[0]));
  byId('chart-point').setAttribute('cy',String(last[1]));
  byId('chart-sample-low').textContent=FORMAT_USD.format(summary.low);
  byId('chart-sample-high').textContent=FORMAT_USD.format(summary.high);
  byId('chart-sample-description').textContent=summary.accessibilityText;
  // The chart belongs to the same MOCK series as the signed sample-change
  // statistic. Avoid an upward-green visual for a falling synthetic market.
  const trendColor=summary.changePercent>=0?'#43e1b4':'#ff6c7b';
  byId('chart-line').setAttribute('stroke',trendColor);
  byId('chart-point').setAttribute('fill',trendColor);
  byId('chart-gradient-start').setAttribute('stop-color',trendColor);
  byId('chart-gradient-end').setAttribute('stop-color',trendColor);
  // Keep the floating last-price badge consistent with the sample's actual
  // direction, just like the stroke, endpoint and filled chart area.
  byId('chart-value-label').setAttribute('data-trend',
    summary.changePercent>=0?'up':'down');
  byId('chart-value-label').textContent=FORMAT_USD.format(MARKETS[view.market].price);
  byId('chart-value-label').style.top=Math.max(4,Math.min(84,last[1]/284*100-4))+'%';
  renderSampleCandleLayer(points,summary);
}
function renderSampleCandleLayer(points,summary){
  // These bars are descriptive group summaries of 64 synthetic prices, not
  // exchange OHLCV data. No fictional timestamp or volume is inferred.
  const candles=sampleCandles(points,view.sampleGroup);
  const paths=sampleCandlePaths(candles,{low:summary.low,high:summary.high});
  for(const [id,key] of [
    ['chart-candle-up-wicks','upWicks'],['chart-candle-down-wicks','downWicks'],
    ['chart-candle-up-bodies','upBodies'],['chart-candle-down-bodies','downBodies'],
  ])byId(id).setAttribute('d',paths[key]);
  for(const id of ['chart-candle-up-bodies','chart-candle-down-bodies'])
    byId(id).setAttribute('stroke-width',String(paths.bodyWidth));
  const ohlc=view.chartMode==='OHLC';
  // SVG <g> is not an HTMLElement: the .hidden property may be an expando.
  // Use SVG-native display attributes to ensure actual browser visibility.
  byId('chart-line-layer').setAttribute('display',ohlc?'none':'inline');
  byId('chart-candle-layer').setAttribute('display',ohlc?'inline':'none');
  byId('market-chart').setAttribute('aria-label',ohlc
    ?'시장별 고정 합성 가격 Sample OHLC 차트 · 실제 시간봉 아님'
    :'시장별 고정 모의 가격 선 차트 · 실제 시세 아님');
  for(const [id,selected] of [
    ['chart-line-mode',!ohlc],['chart-candle-mode',ohlc],
    ['chart-group-4',view.sampleGroup===4],['chart-group-8',view.sampleGroup===8]
  ]){
    const btn=byId(id);
    btn.setAttribute('aria-pressed',String(selected));
    btn.classList.toggle('active',selected);
  }
  for(const id of ['chart-group-4','chart-group-8'])byId(id).disabled=!ohlc;
  byId('chart-mode-description').textContent=ohlc
    ?'Sample OHLC · MOCK_SAMPLE: '+candles.length+'개 묶음, 묶음당 '+view.sampleGroup+
      '개의 고정 생성 가격으로 시가·최고·최저·종가를 계산했습니다. 거래소 시간봉·실제 시각·거래량·실거래 체결 데이터가 아닙니다.'
    :'Line · MOCK_SAMPLE: 64개의 생성된 가격 점을 순서대로 연결했습니다. 실제 시간축·시간봉·거래량 데이터가 아닙니다.';
}

function renderBook(){
  const m=MARKETS[view.market];
  for(const [side,containerId,sign] of [['ask','asks',1],['bid','bids',-1]]){
    const container=byId(containerId);container.replaceChildren();
    const sideName=side==='ask'?'매도':'매수';
    container.setAttribute('role','list');
    container.setAttribute('aria-label',view.market+' 합성 '+sideName+'호가 목록 · 실제 주문장 아님');
    const sizes=Array.from({length:7},(_,i)=>
      (.018+(i*7+3)%9*.009)*(view.market==='SOL'?12:1));
    const maxDepth=sizes.reduce((sum,size)=>sum+size,0);
    for(let i=0;i<sizes.length;i++){
      const price=m.price+sign*m.depthStep*(side==='ask'?7-i:i+1);
      const size=sizes[i];
      // Asks render farthest price first, bids render best price first.
      // Total must accumulate from best price outward on each side.
      const total=(side==='ask'?sizes.slice(i):sizes.slice(0,i+1))
        .reduce((sum,value)=>sum+value,0);
      const row=node('div','book-row'+(side==='bid'?' bid':''));
      // Mock depth shading represents the displayed cumulative Total, not an
      // unrelated decorative percentage. Both sides reach 100% at outermost level.
      row.style.setProperty('--depth',(total/maxDepth*100).toFixed(2)+'%');
      const priceLabel=prices.format(price);
      const sizeLabel=FORMAT_QTY.format(size);
      const totalLabel=FORMAT_QTY.format(total);
      // Each synthetic level announces its column meanings and data source,
      // rather than relying on unassociated visual-only grid headings.
      row.setAttribute('role','listitem');
      row.setAttribute('aria-label','모의 '+sideName+'호가 '+(i+1)+'. 가격 '+priceLabel+
        ' USD, 수량 '+sizeLabel+' '+view.market+', 누적 '+totalLabel+' '+view.market+
        '. 실제 주문장 아님.');
      const cells=[node('span',side==='ask'?'negative':'positive',priceLabel),
        node('span','',sizeLabel),node('span','',totalLabel)];
      cells.forEach(cell=>cell.setAttribute('aria-hidden','true'));
      row.append(...cells);container.append(row);
    }
  }
  byId('book-mid').textContent=FORMAT_USD.format(m.price);
  // The nearest synthetic ask/bid are reference +/- one depthStep.
  // This is only a generated example, never a live order-book spread.
  const displayedSpread=FORMAT_USD.format(2*m.depthStep);
  byId('book-spread').textContent=displayedSpread;
  // An aria-label overrides the output's visible text as its accessible name.
  // Include the same generated USD value so it is not lost to screen readers.
  byId('book-spread').setAttribute('aria-label',
    view.market+' 합성 호가 스프레드 '+displayedSpread+' USD · 실제 호가 아님');
}
function renderTrades(){
  const container=byId('recent-trades');container.replaceChildren();
  container.setAttribute('role','list');
  container.setAttribute('aria-label',view.market+' 합성 최근 체결 예시 목록 · 실제 체결 기록 아님');
  const m=MARKETS[view.market];
  for(let i=0;i<9;i++){
    const buy=((i*7+m.seed)%5)<3;
    const px=m.price+(buy?1:-1)*m.depthStep*((i%5)+.5);
    const qty=((i*3+5)%9+1)*.012*(view.market==='SOL'?10:1);
    const row=node('div','trade-row');
    const priceLabel=prices.format(px);
    const sizeLabel=FORMAT_QTY.format(qty);
    const sampleLabel='#'+String(i+1).padStart(2,'0');
    row.setAttribute('role','listitem');
    row.setAttribute('aria-label','모의 '+(buy?'매수':'매도')+' 방향, 샘플 '+
      sampleLabel+'. 가격 '+priceLabel+' USD, 수량 '+sizeLabel+' '+
      view.market+'. 실제 체결 기록 아님.');
    const cells=[node('span',buy?'positive':'negative',priceLabel),
      node('span','',sizeLabel),node('span','',sampleLabel),
      node('span','trade-side '+(buy?'positive':'negative'),buy?'Buy':'Sell')];
    cells.forEach(cell=>cell.setAttribute('aria-hidden','true'));
    row.append(...cells);
    container.append(row);
  }
}
function matchesQuickQuantity(quantity,preset){
  // Only validated numeric input can select a preset. Equivalent decimal
  // representations must not invalidate a completed demo review.
  return validPreviewQuantity(quantity)&&Number(quantity)===Number(preset);
}
function renderTicket(){
  const sideBuy=view.side==='BUY';
  byId('buy-tab').classList.toggle('active',sideBuy);
  byId('sell-tab').classList.toggle('active',!sideBuy);
  byId('buy-tab').setAttribute('aria-pressed',String(sideBuy));
  byId('sell-tab').setAttribute('aria-pressed',String(!sideBuy));
  const isLimit=view.orderType==='LIMIT';
  byId('market-type').classList.toggle('active',!isLimit);
  byId('limit-type').classList.toggle('active',isLimit);
  byId('market-type').setAttribute('aria-pressed',String(!isLimit));
  byId('limit-type').setAttribute('aria-pressed',String(isLimit));
  byId('limit-price-field').hidden=!isLimit;
  byId('limit-price').disabled=!isLimit;
  const badLimit=isLimit&&!validPreviewLimitPrice(byId('limit-price').value);
  byId('limit-price-error').hidden=!badLimit;
  byId('limit-price').setAttribute('aria-invalid',String(badLimit));
  byId('limit-price').setAttribute('aria-describedby',
    'limit-price-help'+(badLimit?' limit-price-error':''));
  const badQuantity=!validPreviewQuantity(byId('quantity').value);
  byId('quantity').setAttribute('aria-invalid',String(badQuantity));
  byId('quantity-error').hidden=!badQuantity;
  // A hidden error referenced by aria-describedby may still be announced by
  // assistive technology. Attach it only while validation actually fails.
  byId('quantity').setAttribute('aria-describedby',
    'quantity-help'+(badQuantity?' quantity-error':''));
  // A Limit form starts with a MOCK_SAMPLE seeded value, and becomes
  // USER_INPUT only after an actual edit event. Neither is a live quote.
  const priceSource=isLimit?(view.limitPriceEdited?'USER_INPUT':'MOCK_DEFAULT'):'MOCK_SAMPLE';
  const source=byId('ticket-price-source');
  source.textContent=isLimit
    ?(view.limitPriceEdited?'LIMIT PRICE · USER_INPUT':'LIMIT PRICE · MOCK_DEFAULT')
    :'REFERENCE · MOCK_SAMPLE';
  source.dataset.source=priceSource;
  byId('preview-estimate-source').textContent=priceSource+' · 참고용';
  byId('preview-price-label').textContent=isLimit
    ?(view.limitPriceEdited?'Limit Price (user input)':'Limit Price (MOCK default)')
    :'Reference price (MOCK)';

  const button=byId('preview-order');
  button.className='submit-order '+(sideBuy?'buy-submit':'sell-submit');
  button.replaceChildren(document.createTextNode(sideBuy?'Preview Long Order ':'Preview Short Order '),node('span','',sideBuy?'↗':'↘'));
  const leverageInput=byId('leverage').value;
  const leverageValid=validPreviewLeverage(leverageInput);
  const lever=Number(leverageInput);
  byId('leverage').setAttribute('aria-invalid',String(!leverageValid));
  byId('leverage-error').hidden=leverageValid;
  byId('leverage').setAttribute('aria-describedby',
    'leverage-help'+(leverageValid?'':' leverage-error'));
  byId('leverage-output').textContent=leverageValid?lever+'×':'—';
  byId('leverage').style.background=leverageValid
    ?'linear-gradient(90deg,#43e1b4 '+((lever-1)/9*100)+'%,#3b4856 '+((lever-1)/9*100)+'%)'
    :'#3b4856';
  const quantity=byId('quantity').value;
  try{
    const result=previewOrderEstimate({
      market:view.market,orderType:view.orderType,quantity,leverage:leverageInput,
      limitPrice:byId('limit-price').value,
    });
    byId('reference-price').textContent=FORMAT_USD.format(result.price);
    byId('notional').textContent=formatDemoUsdAmount(result.notional);
    byId('margin').textContent=formatDemoUsdAmount(result.indicativeMargin);
    button.disabled=false;
  }catch{
    byId('reference-price').textContent='—';
    byId('notional').textContent='—';
    byId('margin').textContent='—';
    button.disabled=true;
  }
  document.querySelectorAll('[data-qty]').forEach(b=>{
    const selected=matchesQuickQuantity(quantity,b.dataset.qty);
    b.classList.toggle('active',selected);
    b.setAttribute('aria-pressed',String(selected));
    // Each preset represents an amount of the currently selected asset;
    // its visible numeric label alone is ambiguous to screen readers.
    b.setAttribute('aria-label','모의 빠른 수량 '+b.dataset.qty+' '+view.market);
  });
}
function dismissDemoReview(){
  byId('order-result').hidden=true;
  byId('preview-order').focus();
}
let reviewedQuantity=null;
let reviewedLimitPrice=null;
let reviewedLimitPriceOrigin=null;
let reviewedLeverage=null;
function displayOrderPreview(event){
  event.preventDefault();
  const panel=byId('order-result');
  try{
    const review=createDemoOrderReview({
      market:view.market,side:view.side,orderType:view.orderType,
      quantity:byId('quantity').value,leverage:byId('leverage').value,
      limitPrice:byId('limit-price').value,
      limitPriceOrigin:view.limitPriceEdited?'USER_INPUT':'MOCK_DEFAULT',
    });
    panel.classList.remove('error');
    renderDemoOrderReview(panel,document,review,{onClose:dismissDemoReview});
    reviewedQuantity=Number(byId('quantity').value);
    reviewedLimitPrice=view.orderType==='LIMIT'?Number(byId('limit-price').value):null;
    reviewedLimitPriceOrigin=view.orderType==='LIMIT'
      ?(view.limitPriceEdited?'USER_INPUT':'MOCK_DEFAULT'):null;
    reviewedLeverage=Number(byId('leverage').value);
  }catch{
    // A keyboard-triggered form submission can occur even when the preview
    // button is disabled. Route focus to the failing field rather than a
    // generic status panel; no preview/order should be created.
    renderTicket();
    panel.hidden=true;
    if(!validPreviewQuantity(byId('quantity').value)){
      byId('quantity').focus();
    }else if(view.orderType==='LIMIT'&&!validPreviewLimitPrice(byId('limit-price').value)){
      byId('limit-price').focus();
    }else if(!validPreviewLeverage(byId('leverage').value)){
      byId('leverage').focus();
    }else{
      panel.classList.add('error');
      panel.textContent='미리보기를 생성할 수 없습니다. 입력값을 다시 확인하세요.';
      panel.hidden=false;
      panel.focus({preventScroll:true});
    }
  }
}
byId('order-result').addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!byId('order-result').hidden){
    event.preventDefault();
    dismissDemoReview();
  }
});
for(const [mode,id] of [['LINE','chart-line-mode'],['OHLC','chart-candle-mode']]){
  byId(id).addEventListener('click',()=>{
    if(view.chartMode===mode)return;
    view.chartMode=mode;
    renderChart(); // never invalidate a review; changing visualization cannot place an order
  });
}
for(const [groupSize,id] of [[4,'chart-group-4'],[8,'chart-group-8']]){
  byId(id).addEventListener('click',()=>{
    if(view.chartMode!=='OHLC'||view.sampleGroup===groupSize)return;
    view.sampleGroup=groupSize;
    renderChart();
  });
}
document.querySelectorAll('[data-market]').forEach(b=>b.addEventListener('click',()=>{
  // Re-selecting the active market is not a market change. Preserve the user's
  // Limit draft, inline validation state and existing demo review.
  if(b.dataset.market===view.market)return;
  view.market=b.dataset.market;
  updateMarket();
}));
for(const [side,id] of [['BUY','buy-tab'],['SELL','sell-tab']]){
  byId(id).addEventListener('click',()=>{
    // Only a changed order direction invalidates the existing demo review.
    if(view.side===side)return;
    view.side=side;
    renderTicket();
    byId('order-result').hidden=true;
  });
}
for(const [type,id] of [['MARKET','market-type'],['LIMIT','limit-type']]){
  byId(id).addEventListener('click',()=>{
    if(view.orderType===type)return;
    view.orderType=type;
    renderTicket();
    byId('order-result').hidden=true;
  });
}
const onLimitPriceEdit=()=>{
  view.limitPriceEdited=true;
  const price=byId('limit-price').value;
  // Only a currently visible Limit review with an unchanged valid price
  // survives equivalent formatting edits (e.g. 60000.50 -> 60000.5).
  const unchanged=view.orderType==='LIMIT'&&!byId('order-result').hidden&&
    validPreviewLimitPrice(price)&&Number(price)===reviewedLimitPrice&&
    reviewedLimitPriceOrigin==='USER_INPUT';
  renderTicket();
  if(!unchanged)byId('order-result').hidden=true;
};
for(const eventType of ['input','change'])byId('limit-price').addEventListener(eventType,onLimitPriceEdit);
const onLeverageEdit=()=>{
  // A range input event may fire without an actual change (e.g. a boundary
  // key press). Retain a currently visible review only for the same valid lev.
  const leverage=byId('leverage').value;
  const unchanged=!byId('order-result').hidden&&
    validPreviewLeverage(leverage)&&Number(leverage)===reviewedLeverage;
  renderTicket();
  if(!unchanged)byId('order-result').hidden=true;
};
for(const eventType of ['input','change'])byId('leverage').addEventListener(eventType,onLeverageEdit);
const onQuantityEdit=()=>{
  const quantity=byId('quantity').value;
  // A text-only change (0.05 -> 0.050) does not change the reviewed order.
  // Never restore a dismissed/stale review or retain it for invalid input.
  const unchanged=!byId('order-result').hidden&&
    validPreviewQuantity(quantity)&&Number(quantity)===reviewedQuantity;
  renderTicket();
  if(!unchanged)byId('order-result').hidden=true;
};
for(const eventType of ['input','change'])byId('quantity').addEventListener(eventType,onQuantityEdit);
document.querySelectorAll('[data-qty]').forEach(b=>b.addEventListener('click',()=>{
  // Keep the review for the same valid amount even if text differs (e.g. 0.050).
  if(matchesQuickQuantity(byId('quantity').value,b.dataset.qty))return;
  byId('quantity').value=b.dataset.qty;
  renderTicket();
  byId('order-result').hidden=true;
}));
byId('order-form').addEventListener('submit',displayOrderPreview);
updateMarket();
