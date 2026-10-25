import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAccountQueryResponse,createAccountQueryCoordinator,
} from './account-query-contract.mjs';
import {ACCOUNT_TABS} from './account-tabs-model.mjs';

const A='0x1111111111111111111111111111111111111111';
const B='0x2222222222222222222222222222222222222222';
const C=Object.freeze({chainId:11155111,account:A,source:'VERIFIED_TESTNET'});
function row(tab,id='r01',account=A){
  const base={id,account,chainId:11155111,market:'BTC-USD-PERP'};
  switch(tab){
    case 'positions':return {...base,side:'LONG',sizeAtomic:'10000',marginAtomic:'1000'};
    case 'open-orders':return {...base,side:'BUY',status:'OPEN',quantityAtomic:'10000',filledQuantityAtomic:'0',remainingQuantityAtomic:'10000'};
    case 'order-history':return {...base,side:'BUY',status:'CANCELED',quantityAtomic:'10000',filledQuantityAtomic:'0'};
    case 'trade-history':return {...base,side:'BUY',fillPriceAtomic:'6500000',fillQuantityAtomic:'10000'};
    case 'funding-history':return {...base,paymentSignedAtomic:'-250'};
  }
  throw Error('unknown fixture tab');
}
function response(token,records=[],revision=1){
  return {chainId:token.chainId,account:token.account,source:token.source,
    tab:token.tab,requestId:token.requestId,revision,records};
}
test('B2-B1 every tab has exact response envelope contract and immutable snapshot',()=>{
  for(const {id} of ACCOUNT_TABS){
    const expected={...C,tab:id,requestId:1};
    const accepted=validateAccountQueryResponse(response(expected,[row(id)]),expected);
    assert.equal(accepted.tab,id);
    assert.equal(accepted.records.length,1);
    assert.equal(Object.isFrozen(accepted.records[0]),true);
    assert.equal(Object.isFrozen(accepted.records),true);
    assert.equal(Object.isFrozen(accepted),true);
    assert.equal(accepted.records[0].account,A);
    assert.deepEqual(validateAccountQueryResponse(response(expected,[]),expected).records,[]);
  }
});
test('B2-B1 reject response envelope with different account, chain, source, tab or request',()=>{
  const exp={...C,tab:'positions',requestId:5};
  const valid=response(exp,[row('positions')]);
  for(const [key,value] of [
    ['account',B],['chainId',1],['source','MOCK_SAMPLE'],
    ['tab','open-orders'],['requestId',6],
  ]){
    assert.throws(()=>validateAccountQueryResponse({...valid,[key]:value},exp),TypeError,key);
  }
  assert.throws(()=>validateAccountQueryResponse({...valid,extra:'value'},exp),TypeError);
  assert.throws(()=>validateAccountQueryResponse({...valid,revision:'1'},exp),TypeError);
  assert.throws(()=>validateAccountQueryResponse({...valid,revision:-1},exp),TypeError);
  assert.throws(()=>validateAccountQueryResponse({...valid,records:null},exp),TypeError);
});
test('B2-B1 strict identity prevents cross-account or cross-chain row laundering',()=>{
  const exp={...C,tab:'positions',requestId:1};
  for(const record of [
    {...row('positions'),account:B},
    {...row('positions'),chainId:1},
    {...row('positions'),market:'ETH-USD-PERP'},
    {...row('positions'),extra:'unsafe'},
    {...row('positions'),sizeAtomic:'-1'},
    {...row('positions'),sizeAtomic:'0'},
    {...row('positions'),side:'BUY'},
  ])assert.throws(()=>validateAccountQueryResponse(response(exp,[record]),exp),TypeError);
  assert.throws(()=>validateAccountQueryResponse(
    response(exp,Array.from({length:101},(_,i)=>row('positions','rec'+i))),exp),TypeError);
});
test('B2-B1 atomic values must be canonical bounded strings, not implicit JS coercions',()=>{
  const exp={...C,tab:'positions',requestId:1};
  for(const invalid of [0,100,1.25,[],['1000'],{},'01','1e3',
    '9'.repeat(100),(1n<<256n).toString()]){
    assert.throws(()=>validateAccountQueryResponse(
      response(exp,[{...row('positions'),marginAtomic:invalid}]),exp),TypeError);
  }
  const funding={...C,tab:'funding-history',requestId:2};
  for(const invalid of [0,-1,[],['1'],'-0','-01',(1n<<256n).toString(),
    '-'+(1n<<256n).toString()]){
    assert.throws(()=>validateAccountQueryResponse(
      response(funding,[{...row('funding-history'),paymentSignedAtomic:invalid}]),funding),TypeError);
  }
});
test('UX-HL-03-I1 accepted positions preserve the exact numeric field that was validated',()=>{
  const exp={...C,tab:'positions',requestId:71};
  let reads=0;
  const supplied=row('positions');
  Object.defineProperty(supplied,'marginAtomic',{
    enumerable:true,configurable:true,
    get(){reads++;return reads===1?'1000':'-1';},
  });
  const accepted=validateAccountQueryResponse(response(exp,[supplied]),exp);
  assert.equal(accepted.records[0].marginAtomic,'1000',
    'never retain the different invalid value returned by a second getter read');
  assert.equal(reads,1,'account atomic field read exactly once');
  assert.equal(Object.isFrozen(accepted.records[0]),true);
});

test('UX-HL-03-I1 accepted record ID is the checked ID, not a later getter value',()=>{
  const exp={...C,tab:'trade-history',requestId:72};
  let reads=0;
  const supplied=row('trade-history');
  Object.defineProperty(supplied,'id',{
    enumerable:true,configurable:true,
    get(){reads++;return reads===1?'good-id':'unsafe id with spaces';},
  });
  const accepted=validateAccountQueryResponse(response(exp,[supplied]),exp);
  assert.equal(accepted.records[0].id,'good-id',
    'do not store an invalid ID that was never validated');
  assert.equal(reads,1,'record ID must be captured and checked only once');
  assert.equal(Object.isFrozen(accepted.records[0]),true);
});
test('B2-B1 detects duplicate IDs independent of capitalization',()=>{
  const exp={...C,tab:'trade-history',requestId:1};
  assert.throws(()=>validateAccountQueryResponse(
    response(exp,[row('trade-history','0x'+'a'.repeat(64)),
      row('trade-history','0x'+'A'.repeat(64))]),exp),/duplicate record ID/);
});
test('B2-B1 open order quantity integrity and canonical numeric fields',()=>{
  const exp={...C,tab:'open-orders',requestId:10};
  const good={...row('open-orders'),quantityAtomic:'10',filledQuantityAtomic:'2',remainingQuantityAtomic:'8'};
  assert.equal(validateAccountQueryResponse(response(exp,[good]),exp).records.length,1);
  for(const corrupted of [
    {...good,remainingQuantityAtomic:'9'},
    {...good,filledQuantityAtomic:'11'},
    {...good,filledQuantityAtomic:'02'},
    {...good,quantityAtomic:'-10'},
    {...good,status:'FILLED'},
  ])assert.throws(()=>validateAccountQueryResponse(response(exp,[corrupted]),exp),TypeError);
});
test('UX-HL-03-G1 order-history FILLED must represent a completely filled order',()=>{
  const exp={...C,tab:'order-history',requestId:11};
  const complete={...row('order-history'),status:'FILLED',quantityAtomic:'10',filledQuantityAtomic:'10'};
  const partial={...complete,filledQuantityAtomic:'7'};
  const zero={...complete,filledQuantityAtomic:'0'};
  assert.equal(validateAccountQueryResponse(response(exp,[complete]),exp).records[0].status,'FILLED');
  for(const invalid of [partial,zero]){
    assert.throws(()=>validateAccountQueryResponse(response(exp,[invalid]),exp),TypeError,
      'FILLED with unfilled units must never appear as completed history');
  }
  // Partial fills are still allowed for a canceled terminal order.
  const canceled={...complete,status:'CANCELED',filledQuantityAtomic:'7'};
  assert.equal(validateAccountQueryResponse(response(exp,[canceled]),exp).records[0].status,'CANCELED');
});

test('UX-HL-03-G1 open-orders OPEN must always retain positive remaining quantity',()=>{
  const exp={...C,tab:'open-orders',requestId:12};
  const complete={...row('open-orders'),quantityAtomic:'10',filledQuantityAtomic:'10',remainingQuantityAtomic:'0'};
  assert.throws(()=>validateAccountQueryResponse(response(exp,[complete]),exp),TypeError,
    'OPEN with zero remaining must not be presented as an active order');
  const partial={...complete,filledQuantityAtomic:'9',remainingQuantityAtomic:'1'};
  assert.equal(validateAccountQueryResponse(response(exp,[partial]),exp).records[0].status,'OPEN');
});
test('B2-B1 rejects invalid fill prices, statuses, funding amounts',()=>{
  for(const [tab,change] of [
    ['trade-history',{fillPriceAtomic:'0'}],
    ['trade-history',{fillQuantityAtomic:'-1'}],
    ['order-history',{status:'UNKNOWN'}],
    ['funding-history',{paymentSignedAtomic:'-0'}],
    ['funding-history',{paymentSignedAtomic:'1.3'}],
  ]){
    const exp={...C,tab,requestId:1};
    assert.throws(()=>validateAccountQueryResponse(response(exp,[{...row(tab),...change}]),exp),TypeError);
  }
});
test('B2-B1 coordinator stays disconnected until a caller supplies valid bound context',()=>{
  const gate=createAccountQueryCoordinator();
  for(const {id} of ACCOUNT_TABS){
    assert.equal(gate.get(id).state,'disconnected');
    assert.deepEqual(gate.get(id).records,[]);
  }
  assert.equal(gate.connected,false);
  assert.throws(()=>gate.begin('positions'),TypeError);
  for(const invalid of [
    {...C,chainId:1},{...C,account:'alice'},
    {...C,source:'MOCK_SAMPLE'},{...C,source:'unverified'},
  ])assert.throws(()=>gate.connect(invalid),TypeError);
  assert.equal(gate.connected,false);
});
test('B2-B1 loading -> empty/ready and failures are isolated per tab',()=>{
  const gate=createAccountQueryCoordinator();
  gate.connect(C);
  const position=gate.begin('positions');
  const open=gate.begin('open-orders');
  assert.equal(gate.get('positions').state,'loading');
  assert.equal(gate.get('open-orders').state,'loading');
  assert.equal(gate.accept(position,response(position,[],4)),true);
  assert.equal(gate.get('positions').state,'empty');
  assert.equal(gate.get('open-orders').state,'loading');
  assert.equal(gate.accept(open,response(open,[row('open-orders')],2)),true);
  assert.equal(gate.get('open-orders').state,'ready');
  assert.equal(gate.get('open-orders').records.length,1);
  const bad=gate.begin('trade-history');
  assert.equal(gate.accept(bad,response(bad,[{...row('trade-history'),account:B}],4)),false);
  assert.equal(gate.get('trade-history').state,'error');
  assert.deepEqual(gate.get('trade-history').records,[]);
  assert.equal(gate.get('positions').state,'empty');
});
test('B2-B1 older same-tab request cannot overwrite latest state or inject error',()=>{
  const gate=createAccountQueryCoordinator();
  gate.connect(C);
  const prior=gate.begin('positions');
  const current=gate.begin('positions');
  assert.equal(gate.accept(current,response(current,[row('positions','current')],8)),true);
  assert.equal(gate.accept(prior,response(prior,[row('positions','stale')],9)),false);
  assert.equal(gate.fail(prior),false);
  assert.equal(gate.get('positions').records[0].id,'current');
  const next=gate.begin('positions');
  assert.equal(gate.accept(next,response(next,[row('positions','older-rev')],7)),false);
  assert.equal(gate.get('positions').state,'error');
  assert.equal(gate.get('positions').records.length,0);
});
test('UX-HL-03-H1 same revision cannot replace accepted records with contradictory rows',()=>{
  const gate=createAccountQueryCoordinator();
  gate.connect(C);
  const first=gate.begin('open-orders');
  const original=row('open-orders','order-a');
  assert.equal(gate.accept(first,response(first,[original],15)),true);
  assert.equal(gate.get('open-orders').records[0].id,'order-a');
  const second=gate.begin('open-orders');
  const conflicting={...original,id:'order-b'};
  assert.equal(gate.accept(second,response(second,[conflicting],15)),false,
    'same revision with changed order ID must be rejected');
  assert.equal(gate.get('open-orders').state,'error');
  assert.deepEqual(gate.get('open-orders').records,[]);
  const recovery=gate.begin('open-orders');
  assert.equal(gate.accept(recovery,response(recovery,[conflicting],16)),true,
    'a newer revision may legitimately change records');
  assert.equal(gate.get('open-orders').records[0].id,'order-b');
});
test('UX-HL-03-H1 equal revision idempotent reads allowed; empty vs nonempty conflict blocked',()=>{
  const gate=createAccountQueryCoordinator();
  gate.connect(C);
  const initial=gate.begin('positions');
  assert.equal(gate.accept(initial,response(initial,[],4)),true);
  const identical=gate.begin('positions');
  assert.equal(gate.accept(identical,response(identical,[],4)),true,
    'same-revision same-data polling is idempotent');
  const conflicting=gate.begin('positions');
  assert.equal(gate.accept(conflicting,response(conflicting,[row('positions')],4)),false,
    'same revision cannot turn empty account into nonempty account');
  assert.equal(gate.get('positions').state,'error');
  assert.deepEqual(gate.get('positions').records,[]);
});
test('B2-B1 disconnect/reconnect invalidates prior request even for same account',()=>{
  const gate=createAccountQueryCoordinator();
  gate.connect(C);
  const old=gate.begin('positions');
  gate.disconnect();
  assert.equal(gate.get('positions').state,'disconnected');
  assert.equal(gate.accept(old,response(old,[row('positions')],3)),false);
  gate.connect(C);
  assert.equal(gate.fail(old),false);
  const fresh=gate.begin('positions');
  assert.notEqual(fresh.requestId,old.requestId);
  assert.equal(gate.accept(fresh,response(fresh,[],4)),true);
  assert.equal(gate.get('positions').state,'empty');
});
test('B2-B1 switching wallets or source invalidates previous in-flight responses',()=>{
  const gate=createAccountQueryCoordinator();
  gate.connect(C);
  const old=gate.begin('open-orders');
  gate.connect({...C,account:B,source:'LOCAL_DB'});
  const fresh=gate.begin('open-orders');
  assert.equal(gate.accept(old,response(old,[],99)),false);
  assert.equal(gate.accept(fresh,response(fresh,[row('open-orders','bob01',B)],1)),true);
  assert.equal(gate.get('open-orders').records[0].account,B);
  assert.equal(gate.get('open-orders').revision,1);
  assert.equal(gate.accept(old,response(old,[],100)),false);
});
test('B2-B1 revision, forged response, and failure never turn errors into completed records',()=>{
  const gate=createAccountQueryCoordinator();
  gate.connect(C);
  const start=gate.begin('funding-history');
  assert.equal(gate.accept(start,{...response(start,[row('funding-history')]),source:'UNKNOWN'}),false);
  assert.equal(gate.get('funding-history').state,'error');
  assert.equal(gate.get('funding-history').records.length,0);
  const retry=gate.begin('funding-history');
  assert.equal(gate.fail(retry),true);
  assert.equal(gate.get('funding-history').state,'error');
  assert.equal(gate.accept(retry,response(retry,[],3)),false);
});
