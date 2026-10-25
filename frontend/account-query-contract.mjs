/**
 * UX-HL-01-B2-B1: pure account-query acceptance boundary.
 *
 * This module deliberately performs NO fetch, wallet access, authentication,
 * DOM mutation or order execution. A future trusted backend adapter must
 * authenticate the transport and establish the wallet identity independently;
 * matching a response's declared source is NOT proof of its authenticity.
 */
import {ACCOUNT_TABS} from './account-tabs-model.mjs';

const TAB_IDS=new Set(ACCOUNT_TABS.map(t=>t.id));
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const ID=/^(?:0x[0-9a-fA-F]{64}|[A-Za-z0-9:_-]{1,120})$/;
const DECIMAL=/^(?:0|[1-9][0-9]*)$/;
const SIGNED_DECIMAL=/^(?:0|-?[1-9][0-9]*)$/;
const SOURCES=new Set(['LOCAL_DB','VERIFIED_TESTNET']);
const MARKET='BTC-USD-PERP';
const MAX_UINT256=(1n<<256n)-1n;
function uintAtomic(value,positive=false){
  return typeof value==='string'&&value.length<=78&&DECIMAL.test(value)&&
    BigInt(value)<=MAX_UINT256&&(!positive||BigInt(value)>0n);
}
function signedAtomic(value){
  return typeof value==='string'&&value.length<=79&&SIGNED_DECIMAL.test(value)&&
    BigInt(value)<=MAX_UINT256&&BigInt(value)>=-MAX_UINT256;
}

const REQUIRED_FIELDS=Object.freeze({
  positions:['side','sizeAtomic','marginAtomic'],
  'open-orders':['side','status','quantityAtomic','filledQuantityAtomic','remainingQuantityAtomic'],
  'order-history':['side','status','quantityAtomic','filledQuantityAtomic'],
  'trade-history':['side','fillPriceAtomic','fillQuantityAtomic'],
  'funding-history':['paymentSignedAtomic'],
});
const BASE_FIELDS=['id','chainId','account','market'];
function isObject(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function integer(value){return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;}
function invalid(message){throw new TypeError('Account query rejected: '+message);}
function address(value){
  if(typeof value!=='string'||!ADDRESS.test(value))invalid('invalid account address');
  return value.toLowerCase();
}
function tabCheck(tab){if(!TAB_IDS.has(tab))invalid('unknown tab');}
function validateContext(context){
  if(!isObject(context))invalid('missing account connection context');
  const normalized=address(context.account);
  if(context.chainId!==11155111)invalid('unexpected chain');
  if(!SOURCES.has(context.source))invalid('untrusted declared source');
  return Object.freeze({account:normalized,chainId:11155111,source:context.source});
}
function validateRecord(record,tab,context){
  if(!isObject(record))invalid('record is not an object');
  const allowed=[...BASE_FIELDS,...REQUIRED_FIELDS[tab]];
  if(Object.keys(record).length!==allowed.length||
     Object.keys(record).some(key=>!allowed.includes(key))||
     allowed.some(key=>!Object.hasOwn(record,key)))invalid('unexpected or missing record field');
  // Capture each supplied field exactly once before validation. Validating a
  // getter value and then re-reading it to store the record creates a TOCTOU
  // gap: the frozen display snapshot could contain values never checked.
  record=Object.fromEntries(allowed.map(key=>[key,record[key]]));
  if(typeof record.id!=='string'||!ID.test(record.id))invalid('invalid record identifier');
  if(record.chainId!==context.chainId||address(record.account)!==context.account)
    invalid('record account or chain does not match request');
  if(record.market!==MARKET)invalid('unsupported market');
  if(tab==='positions'){
    if(!['LONG','SHORT'].includes(record.side))invalid('invalid position side');
    if(!uintAtomic(record.sizeAtomic,true)||!uintAtomic(record.marginAtomic))invalid('invalid position balances');
  }else if(tab==='open-orders'||tab==='order-history'){
    if(!['BUY','SELL'].includes(record.side))invalid('invalid order side');
    if(!uintAtomic(record.quantityAtomic,true)||
       !uintAtomic(record.filledQuantityAtomic)||
       BigInt(record.filledQuantityAtomic)>BigInt(record.quantityAtomic))
      invalid('invalid order quantity');
    if(tab==='open-orders'){
      if(record.status!=='OPEN'||!uintAtomic(record.remainingQuantityAtomic,true)||
         BigInt(record.quantityAtomic)!==BigInt(record.filledQuantityAtomic)+
           BigInt(record.remainingQuantityAtomic))invalid('invalid open order or residual');
    }else{
      if(!['CANCELED','FILLED'].includes(record.status))
        invalid('invalid terminal order status');
      // A terminal FILLED label cannot describe a partially executed order.
      if(record.status==='FILLED'&&
         BigInt(record.filledQuantityAtomic)!==BigInt(record.quantityAtomic))
        invalid('FILLED order quantity mismatch');
    }
  }else if(tab==='trade-history'){
    if(!['BUY','SELL'].includes(record.side)||
       !uintAtomic(record.fillPriceAtomic,true)||
       !uintAtomic(record.fillQuantityAtomic,true))
      invalid('invalid trade fill');
  }else if(tab==='funding-history'){
    if(!signedAtomic(record.paymentSignedAtomic))invalid('invalid signed funding amount');
  }
  // Never retain a backend object's mutable references or its prototype.
  return Object.freeze(Object.fromEntries(allowed.map(key=>[
    key,key==='account'?context.account:record[key],
  ])));
}
/**
 * Shape validation only; the remote backend's provenance MUST be established
 * by the future adapter before this can be connected to the visible UI.
 */
export function validateAccountQueryResponse(raw,expected){
  const context=validateContext(expected);
  tabCheck(expected.tab);
  if(!integer(expected.requestId)||expected.requestId===0)invalid('invalid request ID');
  if(!isObject(raw))invalid('missing response');
  const envelopeFields=['chainId','account','source','tab','requestId','revision','records'];
  if(Object.keys(raw).length!==envelopeFields.length||
      envelopeFields.some(key=>!Object.hasOwn(raw,key)))invalid('unknown response envelope fields');
  // Capture each response field once, just as for individual account rows.
  // Otherwise a changing getter may bypass the record-count bound or store
  // a revision different from the integer that was actually validated.
  raw=Object.fromEntries(envelopeFields.map(key=>[key,raw[key]]));
  if(raw.chainId!==context.chainId||address(raw.account)!==context.account||
     raw.source!==context.source||raw.tab!==expected.tab||
     raw.requestId!==expected.requestId)invalid('response identity mismatch');
  if(!integer(raw.revision)||!Array.isArray(raw.records)||raw.records.length>100)
    invalid('invalid revision or record count');
  const ids=new Set();
  const rows=raw.records.map(record=>{
    const normalized=validateRecord(record,expected.tab,context);
    const key=normalized.id.toLowerCase();
    if(ids.has(key))invalid('duplicate record ID');
    ids.add(key);
    return normalized;
  });
  return Object.freeze({
    chainId:context.chainId,account:context.account,source:context.source,
    tab:expected.tab,requestId:expected.requestId,revision:raw.revision,
    records:Object.freeze(rows),
  });
}
/**
 * One coordinator per displayed account, with per-tab request generations.
 * stale tokens are ignored instead of overwriting current data/errors.
 */
export function createAccountQueryCoordinator(){
  let identity=null,epoch=0,nextId=0;
  const lastRevision=new Map(),lastContent=new Map(),active=new Map(),results=new Map();
  function reset(){
    epoch++;active.clear();lastRevision.clear();lastContent.clear();results.clear();
    for(const {id} of ACCOUNT_TABS)results.set(id,Object.freeze({
      state:'disconnected',records:Object.freeze([]),revision:null,
    }));
  }
  reset();
  function connect(context){
    identity=validateContext(context);
    reset();return identity;
  }
  function disconnect(){identity=null;reset();}
  function get(tab){
    tabCheck(tab);
    return results.get(tab);
  }
  function begin(tab){
    tabCheck(tab);
    if(!identity)invalid('not connected to an authenticated account adapter');
    const token=Object.freeze({
      ...identity,tab,epoch,requestId:++nextId,
    });
    active.set(tab,token);
    results.set(tab,Object.freeze({state:'loading',records:Object.freeze([]),revision:null}));
    return token;
  }
  function isActive(token){
    return isObject(token)&&identity!==null&&active.get(token.tab)===token&&
      token.epoch===epoch;
  }
  function fail(token){
    if(!isActive(token))return false;
    active.delete(token.tab);
    results.set(token.tab,Object.freeze({
      state:'error',records:Object.freeze([]),revision:null,
    }));
    return true;
  }
  function accept(token,payload){
    if(!isActive(token))return false;
    try{
      const validated=validateAccountQueryResponse(payload,token);
      const previous=lastRevision.get(token.tab);
      if(previous!==undefined&&validated.revision<previous)
        invalid('older server revision');
      // A server revision identifies a snapshot: the same revision must not
      // overwrite an accepted order/account view with contradictory records.
      // Normalized records contain only bounded primitives and fixed keys.
      const content=JSON.stringify(validated.records);
      if(previous===validated.revision&&lastContent.get(token.tab)!==content)
        invalid('conflicting records at the same server revision');
      lastRevision.set(token.tab,validated.revision);
      lastContent.set(token.tab,content);
      active.delete(token.tab);
      results.set(token.tab,Object.freeze({
        state:validated.records.length?'ready':'empty',
        records:validated.records,revision:validated.revision,
      }));
      return true;
    }catch{
      fail(token);
      return false;
    }
  }
  return Object.freeze({
    connect,disconnect,begin,accept,fail,get,
    get connected(){return identity!==null;},
  });
}
