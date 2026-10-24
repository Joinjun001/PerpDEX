import {ACCOUNT_TABS,accountTabIndexForKey} from './account-tabs-model.mjs';
import {renderAccountTabSnapshot} from './account-tabs-renderer.mjs';

/**
 * Native-button ARIA tabs. The static preview has neither a wallet connection
 * nor account API, so only disconnected state may be rendered at runtime.
 */
export function initAccountTabs(root=document){
  const entries=ACCOUNT_TABS.map(({id})=>({
    tab:root.getElementById('account-tab-'+id),
    panel:root.getElementById('account-panel-'+id),
    title:root.querySelector('[data-account-title="'+id+'"]'),
    description:root.querySelector('[data-account-description="'+id+'"]'),
    view:root.querySelector('[data-account-view="'+id+'"]'),
  }));
  if(entries.some(e=>Object.values(e).some(v=>!v))){
    throw new Error('Incomplete account tab markup');
  }
  const tabScroller=root.querySelector('.account-tab-scroll');
  if(!tabScroller)throw new Error('Account tab scroll container missing');
  let selected=0;
  function revealSelectedTab(tab){
    // Only adjust horizontal overflow; avoid scrollIntoView, which can shift
    // the entire document vertically when mobile users switch history tabs.
    if(tabScroller.scrollWidth<=tabScroller.clientWidth)return;
    const viewport=tabScroller.getBoundingClientRect();
    const bounds=tab.getBoundingClientRect();
    const delta=bounds.left<viewport.left
      ?bounds.left-viewport.left
      :bounds.right>viewport.right
        ?bounds.right-viewport.right
        :0;
    if(Number.isFinite(delta)&&delta!==0)tabScroller.scrollLeft+=delta;
  }
  function activate(index,focus=false){
    if(!Number.isInteger(index)||index<0||index>=entries.length){
      throw new RangeError('Account tab index out of bounds');
    }
    selected=index;
    entries.forEach(({tab,panel},i)=>{
      const active=i===index;
      tab.setAttribute('aria-selected',String(active));
      tab.tabIndex=active?0:-1;
      tab.classList.toggle('active',active);
      panel.hidden=!active;
    });
    if(focus)entries[index].tab.focus({preventScroll:true});
    revealSelectedTab(entries[index].tab);
  }
  entries.forEach((entry,i)=>{
    // Static site: always fail closed to disconnected. No backend adapter wired.
    renderAccountTabSnapshot(root,ACCOUNT_TABS[i].id,{state:'disconnected'});
    entry.tab.addEventListener('click',()=>activate(i));
    entry.tab.addEventListener('keydown',event=>{
      const next=accountTabIndexForKey(event.key,i,entries.length);
      if(next===null)return;
      event.preventDefault();
      activate(next,true);
    });
  });
  activate(0);
  return Object.freeze({
    get selectedTab(){return ACCOUNT_TABS[selected].id;},
    activate,
  });
}
if(typeof document!=='undefined')initAccountTabs(document);
