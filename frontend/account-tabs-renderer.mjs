/**
 * UX-HL-01-B2-B2-A: offline account table presenter.
 *
 * Not an authentication boundary. A future trusted adapter must authenticate
 * wallet/endpoint and validate the API payload with account-query-contract.mjs.
 * The public static demo never enables account record display.
 */
import {ACCOUNT_TABS,accountViewFor} from './account-tabs-model.mjs';

const FIELDS=Object.freeze({
  positions:Object.freeze(['market','side','sizeAtomic',null,null,null,'marginAtomic',null,null]),
  'open-orders':Object.freeze(['market','side',null,null,'quantityAtomic','filledQuantityAtomic','remainingQuantityAtomic','status',null]),
  'order-history':Object.freeze(['market','side',null,null,'quantityAtomic','filledQuantityAtomic','status',null]),
  'trade-history':Object.freeze(['market','side','fillPriceAtomic','fillQuantityAtomic',null,null]),
  'funding-history':Object.freeze(['market',null,null,'paymentSignedAtomic',null]),
});
const STATES=new Set(['disconnected','loading','empty','error','ready']);

function requireTab(tabId){
  if(!Object.hasOwn(FIELDS,tabId)||!ACCOUNT_TABS.some(t=>t.id===tabId))
    throw new TypeError('Unknown account tab');
}
function elementsFor(root,tabId){
  const title=root.querySelector('[data-account-title="'+tabId+'"]');
  const description=root.querySelector('[data-account-description="'+tabId+'"]');
  const empty=root.querySelector('[data-account-view="'+tabId+'"]');
  const tbody=root.querySelector('#account-panel-'+tabId+' tbody');
  const table=root.querySelector('#account-panel-'+tabId+' table');
  if(!title||!description||!empty||!tbody||!table)
    throw new Error('Incomplete account table DOM');
  return {title,description,empty,tbody,table};
}
function clearRows(tbody){
  // replaceChildren() deletes old DOM nodes even if a new request fails.
  tbody.replaceChildren();
}
function textCell(doc,value){
  const td=doc.createElement('td');
  // Never innerHTML or a template built from a response value.
  td.textContent=value===undefined||value===null?'—':String(value);
  return td;
}
function rowValue(record,key){
  if(!key)return '—';
  const value=record[key];
  if(value===undefined||value===null)return '—';
  // Preserve atomic units as atomic; no implied human decimal precision or USD.
  return key.endsWith('Atomic')?String(value)+' (atomic)':String(value);
}
function failReadySnapshot(els,tabId){
  const view=accountViewFor(tabId,'error');
  els.title.textContent=view.title;
  els.description.textContent=view.description;
  els.empty.dataset.accountState='error';
  return 'error';
}

/**
 * Shows no account records unless caller specifically enables an authenticated
 * adapter boundary AND supplies a successfully validated coordinator snapshot.
 * This is only a presentation safeguard, not proof of server authenticity.
 */
export function renderAccountTabSnapshot(
  root,tabId,snapshot,{allowValidatedRecords=false}={},
){
  requireTab(tabId);
  const els=elementsFor(root,tabId);
  // A disabled adapter cannot make this renderer display records. Explicitly
  // resolve all non-verified data to disconnected, not a misleading zero count.
  const accepted=allowValidatedRecords===true&&
    snapshot&&typeof snapshot==='object'&&STATES.has(snapshot.state);
  const state=accepted?snapshot.state:'disconnected';
  clearRows(els.tbody);
  els.empty.hidden=false;
  els.table.hidden=true;
  els.empty.dataset.accountState=state;
  if(state==='ready'){
    if(!Array.isArray(snapshot.records)||snapshot.records.length===0)
      return failReadySnapshot(els,tabId);
    const doc=root.ownerDocument??root;
    // Column keys are module-owned only; never use raw server-provided column names.
    // Build off-DOM so a malformed record cannot leave partial or stale account rows.
    try{
      const fragment=doc.createDocumentFragment();
      for(const record of snapshot.records){
        if(record===null||typeof record!=='object'||Array.isArray(record))
          return failReadySnapshot(els,tabId);
        const tr=doc.createElement('tr');
        for(const key of FIELDS[tabId]){
          tr.appendChild(textCell(doc,rowValue(record,key)));
        }
        fragment.appendChild(tr);
      }
      els.tbody.appendChild(fragment);
    }catch{
      // This presenter is not the trusted validator. If a caller supplies a
      // corrupt "ready" record, render an explicit error instead of crashing.
      clearRows(els.tbody);
      return failReadySnapshot(els,tabId);
    }
    els.empty.hidden=true;
    els.table.hidden=false;
    els.title.textContent='';
    els.description.textContent='';
    return 'ready';
  }
  const view=accountViewFor(tabId,state);
  els.title.textContent=view.title;
  els.description.textContent=view.description;
  return state;
}
export function renderAccountTabsFromCoordinator(
  root,coordinator,{allowValidatedRecords=false}={},
){
  if(!coordinator||typeof coordinator.get!=='function')
    throw new TypeError('Account coordinator required');
  return Object.freeze(Object.fromEntries(ACCOUNT_TABS.map(t=>[
    t.id,renderAccountTabSnapshot(root,t.id,coordinator.get(t.id),
      {allowValidatedRecords}),
  ])));
}
