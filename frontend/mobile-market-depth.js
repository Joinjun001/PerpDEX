/**
 * UX-HL-01-D1 — progressive mobile-only market-depth disclosure.
 *
 * Without JS, the button remains hidden and sample data panels stay visible.
 * Mobile CSS hides the common surface only when the disclosure is collapsed;
 * desktop still exposes the selected tab panel.
 */
export function initMobileMarketDepth(root=document){
  const container=root.getElementById('market-depth');
  const toggle=root.getElementById('market-depth-toggle');
  const status=root.getElementById('market-depth-toggle-status');
  const surface=root.getElementById('market-depth-surface');
  if(!container||!toggle||!status||!surface){
    throw new Error('Incomplete mobile market-depth markup');
  }
  // Show the control only AFTER it has a working event listener. If scripts
  // do not load, mobile users still have access to depth/trades content.
  let open=false;
  const setOpen=value=>{
    open=!!value;
    container.dataset.mobileCollapsed=String(!open);
    toggle.setAttribute('aria-expanded',String(open));
    status.textContent=open?'접기':'펼치기';
  };
  toggle.addEventListener('click',()=>setOpen(!open));
  setOpen(false);
  toggle.hidden=false;
  return Object.freeze({
    get expanded(){return open;},
    setExpanded:setOpen,
  });
}
if(typeof document!=='undefined')initMobileMarketDepth(document);
