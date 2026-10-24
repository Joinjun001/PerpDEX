/**
 * Account history presentation only: no backend, wallet, network or trades.
 */
export const ACCOUNT_TABS = Object.freeze([
  Object.freeze({id:'positions',label:'Positions',emptyTitle:'열려 있는 포지션이 없습니다'}),
  Object.freeze({id:'open-orders',label:'Open Orders',emptyTitle:'미체결 주문이 없습니다'}),
  Object.freeze({id:'order-history',label:'Order History',emptyTitle:'주문 기록이 없습니다'}),
  Object.freeze({id:'trade-history',label:'Trade History',emptyTitle:'체결 기록이 없습니다'}),
  Object.freeze({id:'funding-history',label:'Funding History',emptyTitle:'펀딩 기록이 없습니다'}),
]);
export const ACCOUNT_STATES = Object.freeze(['disconnected','loading','empty','error']);

export function accountTabIndexForKey(key,currentIndex,total=ACCOUNT_TABS.length){
  if(!Number.isInteger(currentIndex)||currentIndex<0||currentIndex>=total||
     !Number.isInteger(total)||total<1)throw new RangeError('Invalid tab index');
  if(key==='ArrowRight')return (currentIndex+1)%total;
  if(key==='ArrowLeft')return (currentIndex+total-1)%total;
  if(key==='Home')return 0;
  if(key==='End')return total-1;
  return null;
}

/**
 * The empty state means a successfully connected account query returned zero rows.
 * Never use it for a missing wallet, backend or network.
 */
export function accountViewFor(tabId,state){
  const tab=ACCOUNT_TABS.find(t=>t.id===tabId);
  if(!tab)throw new RangeError('Unknown account tab');
  if(!ACCOUNT_STATES.includes(state))throw new RangeError('Unknown account data state');
  switch(state){
    case 'disconnected':return Object.freeze({
      title:'지갑이 연결되지 않았습니다',
      description:tab.label+' 정보는 지갑 및 테스트넷 백엔드 연동 후에만 조회할 수 있습니다.',
      label:'ACCOUNT NOT CONNECTED',records:[],
    });
    case 'loading':return Object.freeze({
      title:'계정 데이터를 불러오는 중입니다',
      description:tab.label+' 응답을 확인하고 있습니다. 완료되기 전에는 기록을 표시하지 않습니다.',
      label:'LOADING',records:[],
    });
    case 'empty':return Object.freeze({
      title:tab.emptyTitle,
      description:'연결된 계정의 '+tab.label+' 조회가 성공했지만 표시할 기록이 없습니다.',
      label:'NO RECORDS',records:[],
    });
    case 'error':return Object.freeze({
      title:'계정 정보를 가져오지 못했습니다',
      description:tab.label+' 요청이 실패했습니다. 실패한 데이터를 빈 계정으로 표시하지 않습니다.',
      label:'DATA UNAVAILABLE',records:[],
    });
  }
}
