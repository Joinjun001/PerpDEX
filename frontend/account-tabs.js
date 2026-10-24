import {ACCOUNT_TABS,accountTabIndexForKey,accountViewFor} from './account-tabs-model.mjs';

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
  let selected=0;
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
    if(focus)entries[index].tab.focus();
  }
  entries.forEach((entry,i)=>{
    const state=accountViewFor(ACCOUNT_TABS[i].id,'disconnected');
    entry.title.textContent=state.title;
    entry.description.textContent=state.description;
    entry.view.dataset.accountState='disconnected';
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
