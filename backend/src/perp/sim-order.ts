import {getAddress,hashTypedData,keccak256,toHex,isHex,recoverTypedDataAddress,size,type Hex} from 'viem';
import {validateCreateOrder,type CreateOrderInput,type OrderInput} from '../orders/order.ts';
import {validateOrderSigningDomain,type OrderSigningDomainInput} from '../orders/signature.ts';
import {PostgresNonceRegistry,NonceAlreadyUsedError} from '../orders/nonce-registry.ts';
import type {OrderTransactionManager} from '../orders/order-transactions.ts';
import type {SqlRunner} from '../orders/nonce-registry.ts';
import {collateralNotional,mulDivUnsigned,uint256} from './fixed-point.ts';
import {validatePerpMarketConfig,validatePerpOrderUnits,type PerpMarketConfig} from './market-config.ts';
import {validateMockPriceSnapshot,type PerpPriceSnapshot} from './price-snapshot.ts';
import {transferIsolatedMargin,type MarginBalances} from './margin-ledger.ts';

export class SimPerpOrderError extends Error {
  constructor(message:string){super(message);this.name='SimPerpOrderError';}
}
export interface SimPerpOrderInput extends CreateOrderInput {
  marketConfigHash: string;
  reduceOnly: false;
  marginMode: 'ISOLATED';
  configRevision: number;
  collateralToken: string;
  executionMode: 'SIMULATION_ONLY';
}
export interface SimCancelInput {account:string;nonce:string;orderId:string;deadline:number;executionMode:'SIMULATION_ONLY'}
const ORDER_TYPES={PerpSimOrder:[
  {name:'account',type:'address'},{name:'market',type:'string'},
  {name:'side',type:'uint8'},{name:'price',type:'uint256'},
  {name:'quantity',type:'uint256'},{name:'nonce',type:'uint256'},
  {name:'expiresAt',type:'uint256'},
  {name:'reduceOnly',type:'bool'},{name:'marginMode',type:'string'},
  {name:'configRevision',type:'uint256'},{name:'collateralToken',type:'address'},
  {name:'executionMode',type:'string'},{name:'marketConfigHash',type:'bytes32'},
]} as const;
const CANCEL_TYPES={CancelPerpSimOrder:[
  {name:'account',type:'address'},{name:'nonce',type:'uint256'},
  {name:'orderId',type:'bytes32'},{name:'deadline',type:'uint256'},
  {name:'executionMode',type:'string'},
]} as const;
const ID=/^0x[0-9a-f]{64}$/;
const HASH = /^0x[0-9a-f]{64}$/;
/** Deterministic canonical policy commitment; check against server-approved config on admission. */
export function hashPerpMarketConfig(config:Readonly<PerpMarketConfig>):string{
  const fields:[keyof PerpMarketConfig,...(keyof PerpMarketConfig)[]]=[
    'market','baseAsset','quoteAsset','collateralToken','chainId','verifyingContract',
    'sourceId','oracleSourceId','revision','status','validFrom','validUntil',
    'baseDecimals','priceDecimals','collateralDecimals','tickSize','lotSize',
    'minQuantity','maxQuantity','maxOpenInterest','initialMarginBps','maintenanceMarginBps',
    'maxLeverage','maxPriceDeviationBps','maxConfidenceBps','maxOracleAgeSeconds',
  ];
  return keccak256(toHex(JSON.stringify(fields.map(name=>config[name]))));
}
function internalDomain(input:OrderSigningDomainInput){
  return {...validateOrderSigningDomain(input),version:'2' as const};
}
function normalize(input:SimPerpOrderInput,nowSeconds:number):SimPerpOrderInput{
  const order=validateCreateOrder(input,nowSeconds);
  if(typeof input.marketConfigHash!=='string'||!HASH.test(input.marketConfigHash)||
     input.executionMode!=='SIMULATION_ONLY'||input.marginMode!=='ISOLATED'||input.reduceOnly!==false||
     !Number.isSafeInteger(input.configRevision)||input.configRevision<1){
    throw new SimPerpOrderError('sim-only isolated non-reduce-only versioned order required');
  }
  let token:string;
  try{token=getAddress(input.collateralToken).toLowerCase();}
  catch{throw new SimPerpOrderError('invalid collateral token');}
  return {...order,executionMode:'SIMULATION_ONLY',marginMode:'ISOLATED',reduceOnly:false,
    configRevision:input.configRevision,collateralToken:token,marketConfigHash:input.marketConfigHash};
}
export function buildSimPerpOrderTypedData(input:SimPerpOrderInput,domain:OrderSigningDomainInput,nowSeconds=Math.floor(Date.now()/1000)){
  const order=normalize(input,nowSeconds);
  return {domain:internalDomain(domain),types:ORDER_TYPES,primaryType:'PerpSimOrder' as const,
    message:{account:getAddress(order.account),market:order.market,side:order.side==='BUY'?0:1,
      price:BigInt(order.price),quantity:BigInt(order.quantity),nonce:BigInt(order.nonce),
      expiresAt:BigInt(order.expiresAt),reduceOnly:false,marginMode:'ISOLATED',
      configRevision:BigInt(order.configRevision),collateralToken:getAddress(order.collateralToken),
      executionMode:'SIMULATION_ONLY',marketConfigHash:order.marketConfigHash as Hex}};
}
function normalizeCancel(raw:SimCancelInput,nowSeconds:number):SimCancelInput{
  if(!raw||raw.executionMode!=='SIMULATION_ONLY'||!Number.isSafeInteger(nowSeconds)||
     !Number.isSafeInteger(raw.deadline)||raw.deadline<=nowSeconds||
     typeof raw.orderId!=='string'||!ID.test(raw.orderId))throw new SimPerpOrderError('invalid signed simulation cancellation');
  let account:string;
  try{account=getAddress(raw.account).toLowerCase();}
  catch{throw new SimPerpOrderError('invalid cancellation account');}
  uint256(raw.nonce,'nonce');
  return {account,nonce:raw.nonce,orderId:raw.orderId,deadline:raw.deadline,executionMode:'SIMULATION_ONLY'};
}
export function buildSimPerpCancelTypedData(input:SimCancelInput,domain:OrderSigningDomainInput,nowSeconds=Math.floor(Date.now()/1000)){
  const cancel=normalizeCancel(input,nowSeconds);
  return {domain:internalDomain(domain),types:CANCEL_TYPES,primaryType:'CancelPerpSimOrder' as const,
    message:{account:getAddress(cancel.account),nonce:BigInt(cancel.nonce),
      orderId:cancel.orderId as Hex,deadline:BigInt(cancel.deadline),executionMode:'SIMULATION_ONLY'}};
}
async function signedOrderBy(typed:ReturnType<typeof buildSimPerpOrderTypedData>,signature:string,account:string){
  if(typeof signature!=='string'||!isHex(signature)||![64,65].includes(size(signature)))return false;
  try{return (await recoverTypedDataAddress({...typed,signature:signature as Hex})).toLowerCase()===account.toLowerCase();}
  catch{return false;}
}
async function signedCancelBy(typed:ReturnType<typeof buildSimPerpCancelTypedData>,signature:string,account:string){
  if(typeof signature!=='string'||!isHex(signature)||![64,65].includes(size(signature)))return false;
  try{return (await recoverTypedDataAddress({...typed,signature:signature as Hex})).toLowerCase()===account.toLowerCase();}
  catch{return false;}
}
function withRunner(db:SqlRunner):OrderTransactionManager{return {withTransaction:fn=>fn(db)};}
function reserveId(orderId:string){return orderId.slice(2);}
function cancelId(orderId:string){return keccak256(toHex(`perp-sim-cancel:${orderId}`)).slice(2);}

/**
 * Internal-only shadow admission. No matching, fills, public HTTP or onchain movements.
 * The approval source, snapshot and domain MUST originate from a trusted test harness.
 * A simulation-only v2 signature cannot be substituted with an M2 v1 order signature.
 */
export async function admitSimPerpOrder(
  raw:SimPerpOrderInput,signature:string,domain:OrderSigningDomainInput,transactions:OrderTransactionManager,
  rawConfig:PerpMarketConfig,trustedSourceId:string,rawSnapshot:PerpPriceSnapshot,
  nowSeconds=Math.floor(Date.now()/1000),
){
  const order=normalize(raw,nowSeconds);
  const config=validatePerpMarketConfig(rawConfig,domain,trustedSourceId,nowSeconds);
  const snapshot=validateMockPriceSnapshot(rawSnapshot,config,domain,nowSeconds);
  if(order.configRevision!==config.revision||order.market!==config.market||
     order.collateralToken!==config.collateralToken||order.marketConfigHash!==hashPerpMarketConfig(config)){
    throw new SimPerpOrderError('order policy revision or market/collateral binding mismatch');
  }
  validatePerpOrderUnits(config,order.price,order.quantity);
  // Do not accept off-band limit prices outside the trusted mark-price band.
  const price=BigInt(order.price),mark=BigInt(snapshot.markPrice);
  const diff=price>mark?price-mark:mark-price;
  if(diff*10000n>mark*BigInt(config.maxPriceDeviationBps))throw new SimPerpOrderError('order price outside trusted mark band');
  const typed=buildSimPerpOrderTypedData(order,domain,nowSeconds);
  if(!(await signedOrderBy(typed,signature,order.account)))throw new SimPerpOrderError('invalid isolated simulation v2 signature');
  const orderId=hashTypedData(typed).toLowerCase();
  // Reserve at conservative max(limit-price, mark-price), not the cheaper one.
  const riskPrice=(price>mark?price:mark).toString();
  const notional=BigInt(collateralNotional(order.quantity,riskPrice,config,'UP'));
  const reserve=mulDivUnsigned(notional,BigInt(config.initialMarginBps),10000n,'UP');
  if(reserve<=0n)throw new SimPerpOrderError('required reservation rounded to zero');
  return transactions.withTransaction(async db=>{
    if(!(await new PostgresNonceRegistry(db).consume(order as OrderInput,domain,orderId))){
      throw new NonceAlreadyUsedError();
    }
    await db.query(
      `INSERT INTO perp_sim_orders
      (chain_id,verifying_contract,account,nonce,order_id,market,collateral_token,
       side,price,quantity,expires_at,config_revision,market_config_hash,policy_source,oracle_sequence,initial_margin)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [config.chainId,config.verifyingContract,order.account,order.nonce,orderId,order.market,
       order.collateralToken,order.side,order.price,order.quantity,order.expiresAt,
       config.revision,order.marketConfigHash,config.sourceId,snapshot.sourceSequence,reserve.toString()],
    );
    const margin=await transferIsolatedMargin(withRunner(db),domain,
      {market:order.market,account:order.account,collateralToken:order.collateralToken,
       operationId:reserveId(orderId),action:'RESERVE',amount:reserve.toString()});
    return {orderId,initialMargin:reserve.toString(),balances:margin.balances,status:'OPEN' as const};
  });
}

/**
 * Only OPEN shadow orders (not matchable) may be canceled; a signed v2 order-specific
 * cancellation and margin RELEASE happen in the same transaction.
 */
export async function cancelSimPerpOrder(
  raw:SimCancelInput,signature:string,domain:OrderSigningDomainInput,transactions:OrderTransactionManager,
  nowSeconds=Math.floor(Date.now()/1000),
):Promise<{orderId:string;status:'CANCELED';balances:MarginBalances}>{
  const input=normalizeCancel(raw,nowSeconds);
  if(!(await signedCancelBy(buildSimPerpCancelTypedData(input,domain,nowSeconds),signature,input.account))){
    throw new SimPerpOrderError('invalid simulation cancel signature');
  }
  const trusted=validateOrderSigningDomain(domain);
  return transactions.withTransaction(async db=>{
    const matched=await db.query(
      `SELECT market,collateral_token,initial_margin,status,order_id
         FROM perp_sim_orders WHERE chain_id=$1 AND verifying_contract=$2 AND account=$3 AND nonce=$4 FOR UPDATE`,
      [trusted.chainId,trusted.verifyingContract.toLowerCase(),input.account,input.nonce],
    );
    const order=matched.rows[0] as {market:string;collateral_token:string;initial_margin:string;status:string;order_id:string}|undefined;
    if(!order||order.order_id!==input.orderId||order.status!=='OPEN'){
      throw new SimPerpOrderError('shadow order missing, mismatched or already terminal');
    }
    if(!(await new PostgresNonceRegistry(db).cancel(input,domain))){
      throw new SimPerpOrderError('nonce cannot be canceled');
    }
    const changed=await db.query(
      `UPDATE perp_sim_orders SET status='CANCELED'
       WHERE chain_id=$1 AND verifying_contract=$2 AND account=$3 AND nonce=$4 AND status='OPEN'
       RETURNING order_id`,[trusted.chainId,trusted.verifyingContract.toLowerCase(),input.account,input.nonce],
    );
    if(changed.rows.length!==1)throw new SimPerpOrderError('shadow order lost cancellation race');
    const released=await transferIsolatedMargin(withRunner(db),domain,
      {market:order.market,collateralToken:order.collateral_token,account:input.account,
       operationId:cancelId(order.order_id),action:'RELEASE',amount:order.initial_margin});
    return {orderId:order.order_id,status:'CANCELED',balances:released.balances};
  });
}
