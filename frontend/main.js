import {MARKETS,FORMAT_USD,FORMAT_QTY,previewOrderEstimate,validPreviewQuantity,validPreviewLeverage,validPreviewLimitPrice,sampleChart,describeSampleChart} from './preview-model.mjs';
import {createDemoOrderReview,renderDemoOrderReview} from './order-review.mjs';

const byId=(id)=>document.getElementById(id);
const view={market:'BTC',side:'BUY',orderType:'MARKET'};
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
  });
  byId('chart-title').replaceChildren(document.createTextNode(m.symbol+' / USD '),node('span','', 'Perpetual'));
  byId('chart-price').textContent=FORMAT_USD.format(m.price);
  const ch=byId('chart-change');
  ch.textContent=(m.change>=0?'↗ +':'↘ −')+Math.abs(m.change).toFixed(2)+'%';
  ch.className=m.change>=0?'positive':'negative';
  byId('pair-icon').textContent=tickets[view.market];
  byId('pair-icon').className='pair-icon '+(view.market==='BTC'?'coin-btc':view.market==='ETH'?'coin-eth':'coin-sol');
  byId('market-stats-symbol').textContent=m.symbol+'-USD-PERP';
  byId('market-stats-reference').textContent=FORMAT_USD.format(m.price);
  const sampleChange=byId('market-stats-change');
  sampleChange.textContent=(m.change>=0?'+':'−')+Math.abs(m.change).toFixed(2)+'%';
  sampleChange.className=m.change>=0?'positive':'negative';
  byId('limit-price').value=m.price.toFixed(2);
  byId('quantity-unit').textContent=m.symbol;
  byId('input-unit').textContent=m.symbol;
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
  byId('chart-value-label').textContent=FORMAT_USD.format(MARKETS[view.market].price);
  byId('chart-value-label').style.top=Math.max(4,Math.min(84,last[1]/284*100-4))+'%';
}
function renderBook(){
  const m=MARKETS[view.market];
  for(const [side,containerId,sign] of [['ask','asks',1],['bid','bids',-1]]){
    const container=byId(containerId);container.replaceChildren();
    for(let i=0;i<7;i++){
      const price=m.price+sign*m.depthStep*(side==='ask'?7-i:i+1);
      const size=(.018+(i*7+3)%9*.009)*(view.market==='SOL'?12:1);
      const row=node('div','book-row'+(side==='bid'?' bid':''));
      row.style.setProperty('--depth',String(12+(i*19)%76)+'%');
      row.append(
        node('span',side==='ask'?'negative':'positive',prices.format(price)),
        node('span','',FORMAT_QTY.format(size)),
        node('span','',FORMAT_QTY.format(size*(i+1)))
      );container.append(row);
    }
  }
  byId('book-mid').textContent=FORMAT_USD.format(m.price);
}
function renderTrades(){
  const container=byId('recent-trades');container.replaceChildren();
  const m=MARKETS[view.market];
  for(let i=0;i<9;i++){
    const buy=((i*7+m.seed)%5)<3;
    const px=m.price+(buy?1:-1)*m.depthStep*((i%5)+.5);
    const qty=((i*3+5)%9+1)*.012*(view.market==='SOL'?10:1);
    const row=node('div','trade-row');
    row.append(node('span',buy?'positive':'negative',prices.format(px)),
      node('span','',FORMAT_QTY.format(qty)),node('span','','#'+String(i+1).padStart(2,'0')));
    container.append(row);
  }
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
  const badQuantity=!validPreviewQuantity(byId('quantity').value);
  byId('quantity').setAttribute('aria-invalid',String(badQuantity));
  byId('quantity-error').hidden=!badQuantity;
  byId('preview-price-label').textContent=isLimit?'Limit Price (user input)':'Reference price (MOCK)';

  const button=byId('preview-order');
  button.className='submit-order '+(sideBuy?'buy-submit':'sell-submit');
  button.replaceChildren(document.createTextNode(sideBuy?'Preview Long Order ':'Preview Short Order '),node('span','','↗'));
  const leverageInput=byId('leverage').value;
  const leverageValid=validPreviewLeverage(leverageInput);
  const lever=Number(leverageInput);
  byId('leverage').setAttribute('aria-invalid',String(!leverageValid));
  byId('leverage-error').hidden=leverageValid;
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
    byId('notional').textContent=FORMAT_USD.format(result.notional);
    byId('margin').textContent=FORMAT_USD.format(result.indicativeMargin);
    button.disabled=false;
  }catch{
    byId('reference-price').textContent='—';
    byId('notional').textContent='—';
    byId('margin').textContent='—';
    button.disabled=true;
  }
  document.querySelectorAll('[data-qty]').forEach(b=>b.classList.toggle('active',b.dataset.qty===quantity));
}
function dismissDemoReview(){
  byId('order-result').hidden=true;
  byId('preview-order').focus();
}
function displayOrderPreview(event){
  event.preventDefault();
  const panel=byId('order-result');
  try{
    const review=createDemoOrderReview({
      market:view.market,side:view.side,orderType:view.orderType,
      quantity:byId('quantity').value,leverage:byId('leverage').value,
      limitPrice:byId('limit-price').value,
    });
    panel.classList.remove('error');
    renderDemoOrderReview(panel,document,review,{onClose:dismissDemoReview});
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
document.querySelectorAll('[data-market]').forEach(b=>b.addEventListener('click',()=>{
  view.market=b.dataset.market;
  updateMarket();
}));
byId('buy-tab').addEventListener('click',()=>{view.side='BUY';renderTicket();byId('order-result').hidden=true});
byId('sell-tab').addEventListener('click',()=>{view.side='SELL';renderTicket();byId('order-result').hidden=true});
for(const [type,id] of [['MARKET','market-type'],['LIMIT','limit-type']]){
  byId(id).addEventListener('click',()=>{
    view.orderType=type;
    renderTicket();
    byId('order-result').hidden=true;
  });
}
byId('limit-price').addEventListener('input',()=>{
  renderTicket();
  byId('order-result').hidden=true;
});
byId('leverage').addEventListener('input',()=>{
  renderTicket();
  byId('order-result').hidden=true;
});
byId('quantity').addEventListener('input',()=>{
  renderTicket();
  byId('order-result').hidden=true;
});
document.querySelectorAll('[data-qty]').forEach(b=>b.addEventListener('click',()=>{
  byId('quantity').value=b.dataset.qty;
  renderTicket();
  byId('order-result').hidden=true;
}));
byId('order-form').addEventListener('submit',displayOrderPreview);
updateMarket();
