/**
 * UX-HL-01-B2-B2-B1: injected, OFFLINE account-read transport orchestrator.
 *
 * No fetch, wallet, credentials, DOM, or on-chain access. A future trusted
 * backend must independently establish user auth, account/chain scoping and
 * server response integrity; these callbacks alone cannot prove identity.
 * The static demo intentionally does not import or instantiate this module.
 */
import {ACCOUNT_TABS} from './account-tabs-model.mjs';
import {createAccountQueryCoordinator} from './account-query-contract.mjs';

const IDS=new Set(ACCOUNT_TABS.map(tab=>tab.id));
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const SOURCES=new Set(['LOCAL_DB','VERIFIED_TESTNET']);
function version(value){
  return typeof value==='number'&&Number.isSafeInteger(value)&&value>0;
}
function normalizeSession(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
     !ADDRESS.test(raw.account)||raw.chainId!==11155111||
     !SOURCES.has(raw.source)||!version(raw.sessionVersion)){
    throw new TypeError('Verified account read session required');
  }
  return Object.freeze({
    account:raw.account.toLowerCase(),chainId:raw.chainId,
    source:raw.source,sessionVersion:raw.sessionVersion,
  });
}
function sameSession(a,b){
  return !!a&&!!b&&a.account===b.account&&a.chainId===b.chainId&&
    a.source===b.source&&a.sessionVersion===b.sessionVersion;
}
export function createOfflineAccountReadFlow({verifySession,query,onChange=()=>{}}){
  if(typeof verifySession!=='function'||typeof query!=='function'||
     typeof onChange!=='function'){
    throw new TypeError('Trusted callbacks required; no default account API');
  }
  const coordinator=createAccountQueryCoordinator();
  let identity=null,highestVersion=0,lastApprovedIdentity=null,globalEpoch=0;
  const generation=new Map(ACCOUNT_TABS.map(tab=>[tab.id,0]));
  const pending=new Map();
  const snapshot=tab=>{
    if(!IDS.has(tab))throw new TypeError('Unknown account tab');
    return coordinator.get(tab);
  };
  function publish(tab){onChange(tab,snapshot(tab));}
  function publishAll(){for(const {id} of ACCOUNT_TABS)publish(id);}
  function cancelAll(){
    for(const controller of pending.values())controller.abort();
    pending.clear();
  }
  function disconnect(){
    ++globalEpoch;
    cancelAll();
    identity=null;
    coordinator.disconnect();
    publishAll();
  }
  async function load(tab){
    if(!IDS.has(tab))throw new TypeError('Unknown account tab');
    const sequence=generation.get(tab)+1;
    generation.set(tab,sequence);
    const previous=pending.get(tab);
    if(previous){previous.abort();pending.delete(tab);}
    const opEpoch=globalEpoch;
    let verified;
    try{
      verified=normalizeSession(await verifySession());
    }catch{
      if(generation.get(tab)===sequence&&globalEpoch===opEpoch)disconnect();
      return false;
    }
    if(generation.get(tab)!==sequence||opEpoch!==globalEpoch)return false;
    if(verified.sessionVersion<highestVersion||
       (lastApprovedIdentity&&verified.sessionVersion===highestVersion&&
         !sameSession(lastApprovedIdentity,verified))){
      disconnect();return false;
    }
    if(!sameSession(identity,verified)){
      // Every identity switch revokes all pending tokens and all cached rows.
      ++globalEpoch;
      cancelAll();
      identity=verified;
      highestVersion=verified.sessionVersion;
      lastApprovedIdentity=verified;
      coordinator.connect(verified);
      publishAll();
    }else highestVersion=Math.max(highestVersion,verified.sessionVersion);
    const currentEpoch=globalEpoch;
    const controller=new AbortController();
    pending.set(tab,controller);
    const token=coordinator.begin(tab);
    publish(tab);
    const current=()=>generation.get(tab)===sequence&&
      pending.get(tab)===controller&&!controller.signal.aborted&&
      globalEpoch===currentEpoch&&sameSession(identity,verified);
    try{
      const payload=await query(token,{signal:controller.signal});
      if(!current())return false;
      // TOCTOU guard: wallet/chain/session could have changed during response.
      let after;
      try{
        after=normalizeSession(await verifySession());
      }catch{
        // A revoked/unreadable wallet session is not an API query error.
        // Never retain records from a previously verified identity.
        if(current())disconnect();
        return false;
      }
      if(!current())return false;
      if(!sameSession(after,verified)){
        disconnect();
        return false;
      }
      const accepted=coordinator.accept(token,payload);
      pending.delete(tab);
      publish(tab);
      return accepted;
    }catch{
      if(!current())return false;
      coordinator.fail(token);
      pending.delete(tab);
      publish(tab);
      return false;
    }
  }
  return Object.freeze({
    load,disconnect,snapshot,
    get connected(){return coordinator.connected;},
  });
}
