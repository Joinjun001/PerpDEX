/**
 * M5-T3-C2-A: two-sided, execution-price-aware, SIMULATION_ONLY atomic proof.
 * Not a fill or approval: no M3 allocation, M4 transition, order consumption,
 * live matching, withdrawal or external settlement.
 */
import {getAddress} from 'viem';
import type {OrderTransactionManager} from '../orders/order-transactions.ts';
import type {PerpPositionContext} from './position-engine.ts';
import type {SimPerpOrderInput} from './sim-order.ts';
import {uint256} from './fixed-point.ts';
import {assessPersistedSignedSimPerpOrderWithinTransaction,
  type SignedSimRiskGateResult} from './signed-sim-risk-gate.ts';

export class SignedSimPairGateError extends Error {
  constructor(message:string){super(message);this.name='SignedSimPairGateError';}
}
export interface SignedSimPairLeg {
  input:SimPerpOrderInput;
  signature:string;
  expectedPositionVersion:number;
}
export interface SignedSimPairCandidate {
  executionMode:'SIMULATION_ONLY';
  fillId:string;
  priceAtomic:string;
  quantityAtomic:string;
  buyer:SignedSimPairLeg;
  seller:SignedSimPairLeg;
}
export interface SignedSimPairAssessment {
  executionMode:'SIMULATION_ONLY';
  fillId:string;
  priceAtomic:string;
  quantityAtomic:string;
  marketOiVersion:number;
  buyer:Readonly<SignedSimRiskGateResult>;
  seller:Readonly<SignedSimRiskGateResult>;
  executionAuthorized:false;
}
const FILL_ID=/^0x[0-9a-f]{64}$/;
function account(input:SimPerpOrderInput):string{
  try{return getAddress(input.account).toLowerCase();}
  catch{throw new SignedSimPairGateError('invalid signed leg account');}
}
/** Locks the common market and both accounts in canonical address order.
 * The independent C1 pre-trade reports must both be eligible at the SAME
 * matched price; their conclusions still confer no execution authority.
 */
export async function assessPersistedSignedSimPerpPair(
  candidate:SignedSimPairCandidate,ctx:PerpPositionContext,
  transactions:OrderTransactionManager,
):Promise<Readonly<SignedSimPairAssessment>>{
  if(!candidate||candidate.executionMode!=='SIMULATION_ONLY'||
     typeof candidate.fillId!=='string'||!FILL_ID.test(candidate.fillId)||
     !candidate.buyer?.input||!candidate.seller?.input){
    throw new SignedSimPairGateError('canonical signed simulation pair required');
  }
  const buyerAccount=account(candidate.buyer.input);
  const sellerAccount=account(candidate.seller.input);
  if(buyerAccount===sellerAccount)throw new SignedSimPairGateError('self-match forbidden');
  if(candidate.buyer.input.side!=='BUY'||candidate.seller.input.side!=='SELL'){
    throw new SignedSimPairGateError('BUY and SELL signed sides required');
  }
  const quantity=uint256(candidate.quantityAtomic,'paired quantity',true);
  const price=uint256(candidate.priceAtomic,'paired price',true);
  if(quantity%BigInt(ctx.config.lotSize)!==0n||
     price%BigInt(ctx.config.tickSize)!==0n||
     price>BigInt(candidate.buyer.input.price)||
     price<BigInt(candidate.seller.input.price)){
    throw new SignedSimPairGateError('matched price violates signed limits or market ticks');
  }
  if(quantity>uint256(candidate.buyer.input.quantity,'buyer quantity',true)||
     quantity>uint256(candidate.seller.input.quantity,'seller quantity',true)){
    throw new SignedSimPairGateError('pair quantity exceeds signed order');
  }
  return transactions.withTransaction(async db=>{
    // Serialize with M4 paired writes BEFORE checking the fill ID. Otherwise
    // an already executed ID fails later as an unrelated position replay.
    const key=[ctx.config.chainId,ctx.config.verifyingContract.toLowerCase(),
      ctx.config.market,ctx.config.collateralToken.toLowerCase()] as const;
    const marker=await db.query(`SELECT mode,config_revision FROM perp_market_open_interest
      WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3
      AND collateral_token=$4 FOR UPDATE`,key);
    const m=marker.rows[0] as {mode:string;config_revision:number|string}|undefined;
    if(!m||m.mode!=='PAIRED'||Number(m.config_revision)!==ctx.config.revision){
      throw new SignedSimPairGateError('existing paired market and current policy required');
    }
    const used=await db.query(`SELECT fill_id FROM perp_sim_paired_fills
      WHERE chain_id=$1 AND verifying_contract=$2 AND fill_id=$3`,
      [key[0],key[1],candidate.fillId]);
    if(used.rows.length)throw new SignedSimPairGateError('paired fill ID already committed');
    const legs=[
      {account:buyerAccount,side:'buyer' as const,leg:candidate.buyer},
      {account:sellerAccount,side:'seller' as const,leg:candidate.seller},
    ].sort((a,b)=>a.account.localeCompare(b.account));
    const assessed=new Map<'buyer'|'seller',Readonly<SignedSimRiskGateResult>>();
    for(const {side,leg} of legs){
      const proof=await assessPersistedSignedSimPerpOrderWithinTransaction(
        db,leg.input,leg.signature,ctx,quantity.toString(),leg.expectedPositionVersion,
        candidate.fillId,price.toString());
      if(proof.preTrade.decision!=='SIMULATION_ELIGIBLE'||
         proof.preTrade.effect!=='INCREASE'||
         proof.preTrade.candidate?.position.lastFillId!==candidate.fillId){
        throw new SignedSimPairGateError(`${side} opening position not simulation-eligible`);
      }
      assessed.set(side,proof);
    }
    const buyer=assessed.get('buyer')!,seller=assessed.get('seller')!;
    if(buyer.marketOiVersion!==seller.marketOiVersion||
       buyer.oracleSequence!==seller.oracleSequence||
       buyer.orderId===seller.orderId){
      throw new SignedSimPairGateError('pair has inconsistent market, oracle or order identity');
    }
    return Object.freeze({
      executionMode:'SIMULATION_ONLY' as const,fillId:candidate.fillId,
      priceAtomic:price.toString(),quantityAtomic:quantity.toString(),
      marketOiVersion:buyer.marketOiVersion,buyer,seller,
      executionAuthorized:false as const,
    });
  });
}
