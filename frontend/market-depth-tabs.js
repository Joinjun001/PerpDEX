/**
 * UX-HL-06-C1 — accessible MOCK_SAMPLE orderbook/recent-trades tablist.
 *
 * Progressive enhancement: if JS fails, the tablist is hidden and both
 * sections remain readable. No quote, fill, wallet, or API is touched here.
 */
export function initMarketDepthTabs(root=document){
  const tablist=root.getElementById('market-depth-tablist');
  const tabs=[
    {key:'book',button:root.getElementById('market-depth-tab-book'),
      panel:root.getElementById('market-depth-book')},
    {key:'trades',button:root.getElementById('market-depth-tab-trades'),
      panel:root.getElementById('market-depth-trades')},
  ];
  if(!tablist||tabs.some(({button,panel})=>!button||!panel))
    throw new Error('Incomplete market depth tab markup');
  let active='book';
  const select=(key,{focus=false}={})=>{
    const target=tabs.find(tab=>tab.key===key);
    if(!target)throw new RangeError('Unknown market depth tab');
    active=key;
    for(const {key:tabKey,button,panel} of tabs){
      // Progressive enhancement: in no-JS mode both sections are named
      // regions; only an active tablist turns them into tabpanels.
      panel.setAttribute('role','tabpanel');
      panel.setAttribute('aria-labelledby',button.id);
      const selected=tabKey===active;
      button.setAttribute('aria-selected',String(selected));
      button.tabIndex=selected?0:-1;
      button.classList.toggle('active',selected);
      panel.hidden=!selected;
    }
    if(focus)target.button.focus();
  };
  tabs.forEach(({key,button},index)=>{
    button.addEventListener('click',()=>select(key));
    button.addEventListener('keydown',event=>{
      let target;
      switch(event.key){
        case 'ArrowRight': target=tabs[(index+1)%tabs.length].key;break;
        case 'ArrowLeft': target=tabs[(index+tabs.length-1)%tabs.length].key;break;
        case 'Home': target=tabs[0].key;break;
        case 'End': target=tabs.at(-1).key;break;
        case 'Enter':
        case ' ': target=key;break;
        default:return; // native Tab, Shift+Tab, Escape etc. unchanged
      }
      event.preventDefault();
      select(target,{focus:true});
    });
  });
  select('book');
  tablist.hidden=false; // reveal only after all handlers are installed
  return Object.freeze({get selected(){return active;},select});
}
if(typeof document!=='undefined')initMarketDepthTabs(document);
