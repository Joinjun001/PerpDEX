import {MARKETS,FORMAT_USD,FORMAT_QTY,previewEstimate,sampleChart} from './preview-model.mjs';

const byId=(id)=>document.getElementById(id);
const view={market:'BTC',side:'BUY'};
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
  byId('reference-price').textContent=FORMAT_USD.format(m.price);
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
  const min=Math.min(...points),max=Math.max(...points),span=max-min||1;
  const xy=points.map((p,i)=>[i/(points.length-1)*800,260-(p-min)/span*225]);
  const path=xy.map(([x,y],i)=>(i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)).join(' ');
  const last=xy.at(-1);
  byId('chart-line').setAttribute('d',path);
  byId('chart-area').setAttribute('d',path+' L800 284 L0 284 Z');
  byId('chart-point').setAttribute('cx',String(last[0]));
  byId('chart-point').setAttribute('cy',String(last[1]));
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
      node('span','',FORMAT_QTY.format(qty)),node('span','','18:'+String(50-i*4).padStart(2,'0')));
    container.append(row);
  }
}
function renderTicket(){
  const sideBuy=view.side==='BUY';
  byId('buy-tab').classList.toggle('active',sideBuy);
  byId('sell-tab').classList.toggle('active',!sideBuy);
  byId('buy-tab').setAttribute('aria-pressed',String(sideBuy));
  byId('sell-tab').setAttribute('aria-pressed',String(!sideBuy));
  const button=byId('preview-order');
  button.className='submit-order '+(sideBuy?'buy-submit':'sell-submit');
  button.replaceChildren(document.createTextNode(sideBuy?'Preview Long Order ':'Preview Short Order '),node('span','','↗'));
  const lever=Number(byId('leverage').value);
  byId('leverage-output').textContent=lever+'×';
  byId('leverage').style.background='linear-gradient(90deg,#43e1b4 '+((lever-1)/9*100)+'%,#3b4856 '+((lever-1)/9*100)+'%)';
  const quantity=byId('quantity').value;
  try{
    const result=previewEstimate(view.market,quantity,lever);
    byId('notional').textContent=FORMAT_USD.format(result.notional);
    byId('margin').textContent=FORMAT_USD.format(result.indicativeMargin);
    button.disabled=false;
  }catch{
    byId('notional').textContent='—';
    byId('margin').textContent='—';
    button.disabled=true;
  }
  document.querySelectorAll('[data-qty]').forEach(b=>b.classList.toggle('active',b.dataset.qty===quantity));
}
function displayOrderPreview(event){
  event.preventDefault();
  const panel=byId('order-result');
  try{
    const value=previewEstimate(view.market,byId('quantity').value,byId('leverage').value);
    panel.classList.remove('error');
    panel.replaceChildren(
      node('strong','','◈ 데모 주문 미리보기만 생성되었습니다'),
      node('div','',`${view.side==='BUY'?'Long':'Short'} ${value.market}-PERP · ${value.quantity} ${value.market} · ${value.leverage}×`),
      node('div','',`가상 주문금액 ${FORMAT_USD.format(value.notional)} · 참고 증거금 ${FORMAT_USD.format(value.indicativeMargin)}`),
      node('div','','서버 전송 0건 · 지갑 서명 0건 · 실제 체결 0건')
    );
  }catch(err){
    panel.classList.add('error');
    panel.textContent=err.message;
  }
  panel.hidden=false;
}
document.querySelectorAll('[data-market]').forEach(b=>b.addEventListener('click',()=>{
  view.market=b.dataset.market;
  updateMarket();
}));
byId('buy-tab').addEventListener('click',()=>{view.side='BUY';renderTicket();byId('order-result').hidden=true});
byId('sell-tab').addEventListener('click',()=>{view.side='SELL';renderTicket();byId('order-result').hidden=true});
byId('leverage').addEventListener('input',renderTicket);
byId('quantity').addEventListener('input',renderTicket);
document.querySelectorAll('[data-qty]').forEach(b=>b.addEventListener('click',()=>{
  byId('quantity').value=b.dataset.qty;
  renderTicket();
}));
byId('order-form').addEventListener('submit',displayOrderPreview);
updateMarket();
