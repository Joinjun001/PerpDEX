import test from "node:test";
import assert from "node:assert/strict";
import {matchIncomingOrder, MatchingInputError} from "../src/matching/engine.ts";
import type {BookOrder} from "../src/matching/engine.ts";

const NOW=1_800_000_000;
let counter=1;
function order(data:Partial<BookOrder>={}):BookOrder {
  const id=counter++;
  return {
    orderId:"0x"+id.toString(16).padStart(64,"0"),
    market:"ETH-USDC",
    side:"BUY",
    price:"100",
    quantity:"10",
    filledQuantity:"0",
    status:"OPEN",
    expiresAt:NOW+1000,
    arrivalSequence:String(id),
    ...data,
  };
}

test("crossing BUY fills cheapest eligible SELL at resting maker price",()=>{
  const taker=order({side:"BUY",price:"120",quantity:"7"});
  const high=order({side:"SELL",price:"115",quantity:"5"});
  const low=order({side:"SELL",price:"100",quantity:"4"});
  const result=matchIncomingOrder(taker,[high,low],NOW);
  assert.deepEqual(result.fills.map(x=>[x.makerOrderId,x.price,x.quantity]),
    [[low.orderId,"100","4"],[high.orderId,"115","3"]]);
  assert.equal(result.incoming.status,"FILLED");
  assert.equal(result.incoming.filledQuantity,"7");
  assert.equal(result.resting[0].status,"PARTIALLY_FILLED");
  assert.equal(result.resting[0].filledQuantity,"3");
  assert.equal(result.resting[1].status,"FILLED");
  assert.equal(result.remainingQuantity,"0");
  assert.equal(result.totalFilled,"7");
  assert.equal(result.fills[0].buyOrderId,taker.orderId);
  assert.equal(result.fills[0].sellOrderId,low.orderId);
});

test("crossing SELL fills highest eligible BUY at resting maker price",()=>{
  const taker=order({side:"SELL",price:"90",quantity:"7"});
  const low=order({side:"BUY",price:"95",quantity:"8"});
  const high=order({side:"BUY",price:"110",quantity:"3"});
  const r=matchIncomingOrder(taker,[low,high],NOW);
  assert.deepEqual(r.fills.map(x=>[x.makerOrderId,x.price,x.quantity]),[
    [high.orderId,"110","3"],[low.orderId,"95","4"],
  ]);
  assert.equal(r.fills[0].sellOrderId,taker.orderId);
  assert.equal(r.fills[0].buyOrderId,high.orderId);
  assert.equal(r.resting[0].filledQuantity,"4");
  assert.equal(r.resting[1].status,"FILLED");
});

test("same price is matched by arrivalSequence ascending even if array is reversed",()=>{
  const taker=order({side:"BUY",price:"100",quantity:"7",arrivalSequence:"10000"});
  const first=order({side:"SELL",price:"100",quantity:"4",arrivalSequence:"1"});
  const second=order({side:"SELL",price:"100",quantity:"4",arrivalSequence:"2"});
  const third=order({side:"SELL",price:"100",quantity:"4",arrivalSequence:"3"});
  const r=matchIncomingOrder(taker,[third,second,first],NOW);
  assert.deepEqual(r.fills.map(x=>[x.makerOrderId,x.quantity]),[
    [first.orderId,"4"],[second.orderId,"3"]
  ]);
  assert.deepEqual(r.resting.map(x=>x.filledQuantity),["0","3","4"]);
});

test("price outranks time; earlier worse price loses to later better price",()=>{
  const taker=order({side:"BUY",price:"120",quantity:"3",arrivalSequence:"10000"});
  const early=order({side:"SELL",price:"119",quantity:"2",arrivalSequence:"1"});
  const late=order({side:"SELL",price:"100",quantity:"2",arrivalSequence:"2"});
  const r=matchIncomingOrder(taker,[early,late],NOW);
  assert.deepEqual(r.fills.map(x=>x.makerOrderId),[late.orderId,early.orderId]);
});

test("noncrossing prices and same side produce no trades or state changes",()=>{
  const bid=order({side:"BUY",price:"99"});
  const ask=order({side:"SELL",price:"100"});
  const otherBid=order({side:"BUY",price:"101"});
  const r=matchIncomingOrder(bid,[ask,otherBid],NOW);
  assert.deepEqual(r.fills,[]);
  assert.equal(r.remainingQuantity,bid.quantity);
  assert.equal(r.totalFilled,"0");
  assert.deepEqual(r.incoming,bid);
  assert.deepEqual(r.resting,[ask,otherBid]);
});

test("orders from different markets never trade",()=>{
  const buyer=order({side:"BUY",market:"ETH-USDC",price:"1000"});
  const otherMarket=order({side:"SELL",market:"BTC-USDC",price:"1"});
  const r=matchIncomingOrder(buyer,[otherMarket],NOW);
  assert.equal(r.fills.length,0);
});

test("cancelled, expired, filled and depleted resting makers are excluded",()=>{
  const taker=order({side:"BUY",price:"100",quantity:"6",arrivalSequence:"2000"});
  const canceled=order({side:"SELL",price:"1",status:"CANCELED"});
  const expired=order({side:"SELL",price:"1",status:"EXPIRED"});
  const timeExpired=order({side:"SELL",price:"1",expiresAt:NOW});
  const filled=order({side:"SELL",price:"1",status:"FILLED",filledQuantity:"10"});
  const valid=order({side:"SELL",price:"90",quantity:"3"});
  const r=matchIncomingOrder(taker,[canceled,expired,timeExpired,filled,valid],NOW);
  assert.deepEqual(r.fills.map(x=>x.makerOrderId),[valid.orderId]);
  assert.equal(r.remainingQuantity,"3");
  assert.equal(r.incoming.status,"PARTIALLY_FILLED");
  assert.equal(r.resting[0].status,"CANCELED");
  assert.equal(r.resting[1].status,"EXPIRED");
  assert.equal(r.resting[2].expiresAt,NOW);
});

test("cancelled, filled and expired incoming orders cannot trade",()=>{
  const maker=order({side:"SELL",price:"1"});
  const taker=order({side:"BUY",price:"100",quantity:"10"});
  for(const invalid of [
    {...taker,status:"CANCELED" as const},
    {...taker,status:"EXPIRED" as const},
    {...taker,status:"FILLED" as const,filledQuantity:"10"},
    {...taker,expiresAt:NOW},
  ]) {
    const r=matchIncomingOrder(invalid,[maker],NOW);
    assert.equal(r.fills.length,0);
    assert.deepEqual(r.incoming,invalid);
    assert.deepEqual(r.resting[0],maker);
  }
});

test("partially filled maker and taker consume only remaining quantities",()=>{
  const taker=order({side:"BUY",quantity:"12",filledQuantity:"5",status:"PARTIALLY_FILLED"});
  const maker=order({side:"SELL",price:"99",quantity:"10",filledQuantity:"7",status:"PARTIALLY_FILLED"});
  const r=matchIncomingOrder(taker,[maker],NOW);
  assert.equal(r.totalFilled,"3");
  assert.equal(r.incoming.filledQuantity,"8");
  assert.equal(r.remainingQuantity,"4");
  assert.equal(r.incoming.status,"PARTIALLY_FILLED");
  assert.equal(r.resting[0].filledQuantity,"10");
  assert.equal(r.resting[0].status,"FILLED");
});

test("BigInt comparisons and quantities remain exact beyond Number.MAX_SAFE_INTEGER",()=>{
  const huge=(1n<<220n).toString();
  const target=order({side:"BUY",price:huge,quantity:huge});
  const maker=order({side:"SELL",price:(BigInt(huge)-1n).toString(),quantity:(BigInt(huge)-5n).toString()});
  const r=matchIncomingOrder(target,[maker],NOW);
  assert.equal(r.fills[0].quantity,(BigInt(huge)-5n).toString());
  assert.equal(r.fills[0].price,(BigInt(huge)-1n).toString());
  assert.equal(r.remainingQuantity,"5");
  assert.equal(r.incoming.filledQuantity,(BigInt(huge)-5n).toString());
  assert.equal(r.resting[0].status,"FILLED");
});

test("pure function does not mutate frozen source data and is deterministic",()=>{
  const buyer=Object.freeze(order({side:"BUY",price:"101",quantity:"5"}));
  const seller=Object.freeze(order({side:"SELL",price:"99",quantity:"6"}));
  const original=Object.freeze([seller]);
  const first=matchIncomingOrder(buyer,original,NOW);
  const again=matchIncomingOrder(buyer,original,NOW);
  assert.deepEqual(first,again);
  assert.equal(buyer.filledQuantity,"0");
  assert.equal(seller.filledQuantity,"0");
  assert.notEqual(first.resting[0],seller);
  assert.notEqual(first.incoming,buyer);
});

test("duplicate order identity or same-market sequence is rejected before matching",()=>{
  const buyer=order({side:"BUY",arrivalSequence:"10000"});
  const seller=order({side:"SELL",arrivalSequence:"3"});
  for(const invalid of [
    {...seller,orderId:buyer.orderId},
    {...seller,arrivalSequence:buyer.arrivalSequence},
  ]) {
    assert.throws(()=>matchIncomingOrder(buyer,[invalid],NOW),MatchingInputError);
  }
  const sameSeq=order({side:"SELL",arrivalSequence:"3"});
  assert.throws(()=>matchIncomingOrder(buyer,[seller,sameSeq],NOW),MatchingInputError);
});

test("invalid prices, filled states, unsafe times and sequences fail closed",()=>{
  const orderA=order();
  for(const data of [
    {price:"0"},{quantity:"0"},{filledQuantity:"-1"},
    {filledQuantity:"11"},{filledQuantity:"1"},
    {status:"PARTIALLY_FILLED",filledQuantity:"0"},
    {status:"FILLED",filledQuantity:"0"},
    {arrivalSequence:"0"},
    {arrivalSequence:(1n<<63n).toString()},
    {price:(1n<<256n).toString()},
    {expiresAt:1.4},
    {market:"ETH-INVALID NAME"},
    {orderId:"abc"},
  ]) {
    assert.throws(()=>matchIncomingOrder({...orderA,...data} as BookOrder,[],NOW),MatchingInputError,
      `must reject invalid ${JSON.stringify(data)}`);
  }
  assert.throws(()=>matchIncomingOrder(orderA,[],NaN),MatchingInputError);
});

test("conservation across many deterministic randomized match cases",()=>{
  let state=123456789;
  const random=(max:number)=>{state=(1103515245*state+12345) % 2147483647;return state%max;};
  for(let iteration=0;iteration<120;iteration++) {
    const taker=order({side:iteration%2===0?"BUY":"SELL",
      price:String(50+random(100)),quantity:String(1+random(1000)),arrivalSequence:"9999999"});
    const makers=Array.from({length:8},(_,i)=>order({
      side:taker.side==="BUY"?"SELL":"BUY",
      price:String(50+random(100)),
      quantity:String(1+random(300)),
      arrivalSequence:String(i+1),
    }));
    const r=matchIncomingOrder(taker,makers,NOW);
    const traded=r.fills.reduce((sum,x)=>sum+BigInt(x.quantity),0n);
    assert.equal(traded,BigInt(r.totalFilled));
    assert.equal(traded+BigInt(r.remainingQuantity),BigInt(taker.quantity));
    assert.equal(traded,BigInt(r.incoming.filledQuantity));
    assert.equal(r.resting.reduce((sum,x,i)=>sum+BigInt(x.filledQuantity)-BigInt(makers[i].filledQuantity),0n),traded);
    for(const fill of r.fills){
      assert.ok(BigInt(fill.quantity)>0n);
      assert.ok(taker.side==="BUY" ? BigInt(fill.price)<=BigInt(taker.price) :
        BigInt(fill.price)>=BigInt(taker.price));
    }
  }
});
