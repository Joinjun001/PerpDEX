import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createOfflineAccountReadFlow} from './account-read-flow.mjs';

const A='0x1111111111111111111111111111111111111111';
const B='0x2222222222222222222222222222222222222222';
const session=(account=A,sessionVersion=1,source='LOCAL_DB')=>({
  account,chainId:11155111,source,sessionVersion,
});
const row=(id='r1',account=A)=>({
  id,account,chainId:11155111,market:'BTC-USD-PERP',
  side:'LONG',sizeAtomic:'100',marginAtomic:'40',
});
const envelope=(token,records=[],revision=1)=>({
  account:token.account,chainId:token.chainId,source:token.source,
  tab:token.tab,requestId:token.requestId,revision,records,
});
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
function deferred(){
  let resolve,reject;
  const promise=new Promise((a,b)=>{resolve=a;reject=b;});
  return {promise,resolve,reject};
}
test('B2-B2-B1 rejects missing trusted callbacks or invalid tab names',async()=>{
  for(const v of [{},{verifySession:()=>session()},
    {query:()=>{}},{verifySession:()=>session(),query:()=>{},onChange:'invalid'}]){
    assert.throws(()=>createOfflineAccountReadFlow(v),TypeError);
  }
  const flow=createOfflineAccountReadFlow({
    verifySession:()=>session(),
    query:()=>{throw Error('must not query');},
  });
  await assert.rejects(()=>flow.load('unknown'),TypeError);
  assert.throws(()=>flow.snapshot('unknown'),TypeError);
  assert.equal(flow.connected,false);
});
test('B2-B2-B1 no verified session means disconnected, with zero transport calls',async()=>{
  let requested=0;
  for(const bad of [null,{},session(A,1,'MOCK_SAMPLE'),
    {...session(),chainId:1},{...session(),account:'0xNOTANADDRESS'},
    {...session(),sessionVersion:0}]){
    const changes=[];
    const flow=createOfflineAccountReadFlow({
      verifySession:()=>bad,
      query:()=>{requested++;return {};},
      onChange:(tab,state)=>changes.push({tab,state:state.state}),
    });
    assert.equal(await flow.load('positions'),false);
    assert.equal(flow.snapshot('positions').state,'disconnected');
    assert.equal(flow.connected,false);
    assert.ok(changes.every(x=>x.state==='disconnected'));
  }
  assert.equal(requested,0);
});
test('B2-B2-B1 success requires double session check and strict payload binding',async()=>{
  const changes=[];let checks=0,requests=0;
  const flow=createOfflineAccountReadFlow({
    verifySession:()=>{checks++;return session();},
    query:(token,{signal})=>{
      assert.equal(signal.aborted,false);
      requests++;
      return envelope(token,token.tab==='positions'?[row()]:[],3);
    },
    onChange:(tab,state)=>changes.push([tab,state.state]),
  });
  assert.equal(await flow.load('positions'),true);
  assert.equal(checks,2);
  assert.equal(requests,1);
  assert.equal(flow.snapshot('positions').state,'ready');
  assert.equal(flow.snapshot('positions').records[0].id,'r1');
  assert.deepEqual(changes.at(-1),['positions','ready']);
  assert.equal(flow.snapshot('open-orders').state,'disconnected');
  assert.equal(await flow.load('trade-history'),true); // empty response
  assert.equal(flow.snapshot('trade-history').state,'empty');
});
test('B2-B2-B1 unknown or duplicated record is rejected with empty error state',async()=>{
  const flow=createOfflineAccountReadFlow({
    verifySession:()=>session(),
    query:token=>envelope(token,[row('abc'),row('abc')]),
  });
  assert.equal(await flow.load('positions'),false);
  assert.equal(flow.snapshot('positions').state,'error');
  assert.equal(flow.snapshot('positions').records.length,0);
});
test('B2-B2-B1 overlapping same-tab requests fence old responses and abort first',async()=>{
  const held=[];const observed=[];
  const flow=createOfflineAccountReadFlow({
    verifySession:()=>session(),
    query:(token,{signal})=>{
      const d=deferred();held.push({...d,token,signal});return d.promise;
    },
    onChange:(tab,state)=>observed.push([tab,state.state]),
  });
  const old=flow.load('positions');await flush();
  assert.equal(held.length,1);
  const latest=flow.load('positions');await flush();
  assert.equal(held.length,2);
  assert.equal(held[0].signal.aborted,true);
  held[1].resolve(envelope(held[1].token,[row('new')],2));
  assert.equal(await latest,true);
  held[0].resolve(envelope(held[0].token,[row('old')],5));
  assert.equal(await old,false);
  assert.equal(flow.snapshot('positions').state,'ready');
  assert.equal(flow.snapshot('positions').records[0].id,'new');
  assert.ok(observed.every(([tab])=>tab==='positions'||tab==='open-orders'||
    tab==='order-history'||tab==='trade-history'||tab==='funding-history'));
});
test('B2-B2-B1 disconnect aborts requests and forbids stale success or error',async()=>{
  const d=deferred();let signal;
  const flow=createOfflineAccountReadFlow({
    verifySession:()=>session(),
    query:(_token,{signal:currentSignal})=>{signal=currentSignal;return d.promise;},
  });
  const ongoing=flow.load('positions');await flush();
  assert.equal(flow.snapshot('positions').state,'loading');
  flow.disconnect();
  assert.equal(signal.aborted,true);
  assert.equal(flow.snapshot('positions').state,'disconnected');
  d.reject(new Error('old query error'));
  assert.equal(await ongoing,false);
  assert.equal(flow.snapshot('positions').state,'disconnected');
});
test('B2-B2-B1 session change during response revokes all cached records',async()=>{
  let current=session();
  const flow=createOfflineAccountReadFlow({
    verifySession:()=>current,
    query:token=>{
      // wallet changes before post-query verification
      current=session(B,2);
      return envelope(token,[row()]);
    },
  });
  assert.equal(await flow.load('positions'),false);
  assert.equal(flow.connected,false);
  assert.equal(flow.snapshot('positions').state,'disconnected');
});
test('B2-B2-B1 session verifier rejection after response revokes identity',async()=>{
  let attempts=0;
  const flow=createOfflineAccountReadFlow({
    verifySession:()=>{
      attempts++;
      if(attempts===2)throw new Error('wallet was revoked');
      return session();
    },
    query:token=>envelope(token,[row()]),
  });
  assert.equal(await flow.load('positions'),false);
  assert.equal(flow.connected,false);
  assert.equal(flow.snapshot('positions').state,'disconnected');
  assert.deepEqual(flow.snapshot('positions').records,[]);
});
test('B2-B2-B1 successive account generations clear prior account, old request ignored',async()=>{
  let current=session();const held=[];
  const flow=createOfflineAccountReadFlow({
    verifySession:()=>current,
    query:(token,{signal})=>{const d=deferred();held.push({...d,token,signal});return d.promise;},
  });
  const previous=flow.load('positions');await flush();
  current=session(B,2);
  const next=flow.load('positions');await flush();
  assert.equal(held.length,2);
  assert.equal(held[0].signal.aborted,true);
  held[1].resolve(envelope(held[1].token,[row('bob',B)]));
  assert.equal(await next,true);
  held[0].resolve(envelope(held[0].token,[row('alice')]));
  assert.equal(await previous,false);
  assert.equal(flow.snapshot('positions').records[0].account,B);
});
test('B2-B2-B1 cross-tab loads and API error are isolated',async()=>{
  const flow=createOfflineAccountReadFlow({
    verifySession:()=>session(),
    query:token=>token.tab==='positions'
      ?Promise.reject(new Error('database offline')):envelope(token,[]),
  });
  assert.equal(await flow.load('open-orders'),true);
  assert.equal(flow.snapshot('open-orders').state,'empty');
  assert.equal(await flow.load('positions'),false);
  assert.equal(flow.snapshot('positions').state,'error');
  assert.equal(flow.snapshot('open-orders').state,'empty');
});
test('B2-B2-B1 session revision rollback and changed identity at same revision fail closed',async()=>{
  let current=session(A,4);
  const flow=createOfflineAccountReadFlow({
    verifySession:()=>current,
    query:token=>envelope(token,[]),
  });
  assert.equal(await flow.load('positions'),true);
  current=session(A,3);
  assert.equal(await flow.load('positions'),false);
  assert.equal(flow.snapshot('positions').state,'disconnected');
  current=session(B,4);
  assert.equal(await flow.load('positions'),false);
  assert.equal(flow.snapshot('positions').state,'disconnected');
  current=session(B,5);
  assert.equal(await flow.load('positions'),true);
});
test('B2-B2-B1 transport cannot be implicitly instantiated by public static demo',()=>{
  const trade=readFileSync(fileURLToPath(new URL('./trade.html',import.meta.url)),'utf8');
  const ui=readFileSync(fileURLToPath(new URL('./account-tabs.js',import.meta.url)),'utf8');
  const flow=readFileSync(fileURLToPath(new URL('./account-read-flow.mjs',import.meta.url)),'utf8');
  assert.doesNotMatch(trade,/account-read-flow.mjs/);
  assert.doesNotMatch(ui,/account-read-flow|allowValidatedRecords:true|fetch\(/);
  assert.match(trade,/connect-src 'none'/);
  assert.doesNotMatch(flow,/fetch\(|XMLHttpRequest|localStorage|eth_requestAccounts/);
});
