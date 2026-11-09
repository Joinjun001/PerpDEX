import {ACCOUNT_TABS} from './account-tabs-model.mjs';

/**
 * Visible account table hints are strictly presentation-only.
 * The live static site has no wallet/API adapter and keeps tables hidden.
 */
export function shouldShowAccountTableHint({mobile,selected,visible,scrollWidth,clientWidth}){
  return mobile===true&&selected===true&&visible===true&&
    Number.isFinite(scrollWidth)&&Number.isFinite(clientWidth)&&
    clientWidth>0&&scrollWidth>clientWidth+1;
}

// Bound the scroll position to a finite, non-negative range; no inferred
// account data or direction based on missing table rows.
export function accountTableScrollPosition({scrollWidth,clientWidth,scrollLeft}){
  if(!Number.isFinite(scrollWidth)||!Number.isFinite(clientWidth)||
     !Number.isFinite(scrollLeft)||clientWidth<=0||
     scrollWidth<=clientWidth+1)return 'none';
  const remaining=Math.max(0,scrollWidth-clientWidth);
  if(scrollLeft<=1)return 'start';
  if(scrollLeft>=remaining-1)return 'end';
  return 'middle';
}

const SCROLL_GUIDANCE=Object.freeze({
  start:'오른쪽에 숨겨진 열이 있습니다. 표에 포커스한 뒤 오른쪽 방향키로 탐색하세요.',
  middle:'양쪽에 숨겨진 열이 있습니다. 표에 포커스한 뒤 좌우 방향키로 탐색하세요.',
  end:'왼쪽에 숨겨진 열이 있습니다. 표에 포커스한 뒤 왼쪽 방향키로 돌아가세요.',
});

export function initAccountTableScrollHints(root=document){
  const view=root.defaultView??(typeof window!=='undefined'?window:null);
  const media=view?.matchMedia?.('(max-width: 760px)');
  const entries=ACCOUNT_TABS.map(({id})=>{
    const panel=root.getElementById('account-panel-'+id);
    const container=root.querySelector('#account-panel-'+id+' .account-table-scroll');
    const table=root.querySelector('#account-panel-'+id+' table');
    const hint=root.getElementById('account-table-hint-'+id);
    if(!panel||!container||!table||!hint)
      throw new Error('Incomplete account table overflow hint markup');
    return {panel,container,table,hint};
  });
  let disposed=false;
  function update(){
    if(disposed)return;
    const mobile=media?.matches===true;
    for(const {panel,container,table,hint} of entries){
      const show=shouldShowAccountTableHint({
        mobile,selected:!panel.hidden,visible:!table.hidden,
        scrollWidth:container.scrollWidth,clientWidth:container.clientWidth,
      });
      hint.hidden=!show;
      if(show){
        const location=accountTableScrollPosition({
          scrollWidth:container.scrollWidth,clientWidth:container.clientWidth,
          scrollLeft:container.scrollLeft,
        });
        const direction=location==='none'?'start':location;
        hint.textContent=SCROLL_GUIDANCE[direction];
        hint.setAttribute('data-scroll-position',direction);
      }else hint.removeAttribute('data-scroll-position');
      // Horizontal table scrolling must not produce inert keyboard tab stops
      // while the static account view is disconnected.
      container.tabIndex=show?0:-1;
      if(show)container.setAttribute('aria-describedby',hint.id);
      else container.removeAttribute('aria-describedby');
    }
  }
  const stop=[];
  for(const {container} of entries){
    if(typeof container.addEventListener==='function'){
      container.addEventListener('scroll',update,{passive:true});
      stop.push(()=>container.removeEventListener('scroll',update));
    }
  }
  if(view?.addEventListener){
    view.addEventListener('resize',update);
    stop.push(()=>view.removeEventListener('resize',update));
  }
  if(media?.addEventListener){
    media.addEventListener('change',update);
    stop.push(()=>media.removeEventListener('change',update));
  }
  if(view?.ResizeObserver){
    const observer=new view.ResizeObserver(update);
    for(const {container,table} of entries){
      observer.observe(container);
      observer.observe(table);
    }
    stop.push(()=>observer.disconnect());
  }
  if(view?.MutationObserver){
    const observer=new view.MutationObserver(update);
    for(const {panel,table} of entries){
      observer.observe(panel,{attributes:true,attributeFilter:['hidden']});
      observer.observe(table,{attributes:true,attributeFilter:['hidden']});
    }
    stop.push(()=>observer.disconnect());
  }
  update();
  return Object.freeze({
    update,
    dispose(){
      disposed=true;
      for(const dispose of stop)dispose();
    },
  });
}
