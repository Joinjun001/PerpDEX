/** Internal-only, local simulation of an atomic two-account perpetual fill. */
import {getAddress} from 'viem';
import type {OrderTransactionManager} from '../orders/order-transactions.ts';
import type {SqlRunner} from '../orders/nonce-registry.ts';
import {uint256,MAX_UINT256,int256} from './fixed-point.ts';
import {validatePerpMarketConfig} from './market-config.ts';
import {validateMockPriceSnapshot} from './price-snapshot.ts';
import type {PerpPositionContext,PerpPositionFill,PerpPositionTransition} from './position-engine.ts';
import {applySimPerpFillWithinTransaction} from './position-ledger.ts';
import {hashPerpMarketConfig} from './sim-order.ts';

export class PairedClearingError extends Error {
  constructor(message:string){super(message);this.name='PairedClearingError';}
}
export interface SimPairedFill {
  fillId:string;
  buyerAccount:string;
  sellerAccount:string;
  priceAtomic:string;
  quantityAtomic:string;
  buyerExpectedVersion:number;
  sellerExpectedVersion:number;
  executionMode:'SIMULATION_ONLY';
}
export interface MarketOpenInterest {
  market:string;
  collateralToken:string;
  longQuantityAtomic:string;
  shortQuantityAtomic:string;
  openInterestAtomic:string;
  accountCount:number;
}
export interface PairedExecutionResult {
  buyer:Readonly<PerpPositionTransition>;
  seller:Readonly<PerpPositionTransition>;
  openInterest:Readonly<MarketOpenInterest>;
}
const ID=/^0x[0-9a-f]{64}$/;
const ZERO='0x0000000000000000000000000000000000000000';
function address(raw:unknown):string{
  if(typeof raw!=='string')throw new PairedClearingError('EVM account required');
  try{const value=getAddress(raw).toLowerCase();if(value===ZERO)throw Error();return value;}
  catch{throw new PairedClearingError('invalid/zero account');}
}
function policy(ctx:PerpPositionContext){
  const c=validatePerpMarketConfig(ctx.config,ctx.domain,ctx.trustedSourceId,ctx.nowSeconds);
  const s=validateMockPriceSnapshot(ctx.snapshot,c,ctx.domain,ctx.nowSeconds);
  const key=[c.chainId,c.verifyingContract,c.market,c.collateralToken] as const;
  return {c,s,key};
}
function checkedQuantity(value:bigint,label:string){
  if(value>MAX_UINT256)throw new PairedClearingError(`${label} overflow`);
  return value;
}
/** Read-only aggregate of ALL market/account snapshots, including legacy single-sided rows. */
export async function computeSimMarketOpenInterest(
  db:SqlRunner,ctx:PerpPositionContext,
):Promise<Readonly<MarketOpenInterest>>{
  const {c,key}=policy(ctx);
  const q=await db.query(
    `SELECT account,config_revision,size_signed_atomic FROM perp_position_snapshots
     WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4`,key,
  );
  let long=0n,short=0n;
  for(const row of q.rows as Array<{account:string;config_revision:string|number;size_signed_atomic:string}>){
    if(Number(row.config_revision)!==c.revision)throw new PairedClearingError('market contains incompatible policy revision');
    const size=int256(row.size_signed_atomic,'stored position size');
    if(size>0n)long=checkedQuantity(long+size,'LONG aggregate');
    else short=checkedQuantity(short-size,'SHORT aggregate');
  }
  if(long>BigInt(c.maxOpenInterest)||short>BigInt(c.maxOpenInterest)){
    throw new PairedClearingError('market OI exceeds approved simulated limit');
  }
  return Object.freeze({market:c.market,collateralToken:c.collateralToken,
    longQuantityAtomic:long.toString(),shortQuantityAtomic:short.toString(),
    openInterestAtomic:(long>short?long:short).toString(),accountCount:q.rows.length});
}

/** Both counterparties share one market lock and ONE transaction. No nested BEGIN. */
export async function applySimPairedFill(transactions:OrderTransactionManager,trade:SimPairedFill,ctx:PerpPositionContext):Promise<Readonly<PairedExecutionResult>>{
  return transactions.withTransaction(db=>applySimPairedFillWithinTransaction(db,trade,ctx));
}
/** Composition primitive: guarded only after acquiring market and both account guards. */
export async function applySimPairedFillWithinTransaction(db:SqlRunner,trade:SimPairedFill,ctx:PerpPositionContext,guarded=false):Promise<Readonly<PairedExecutionResult>>{
  if(!trade||trade.executionMode!=='SIMULATION_ONLY'||typeof trade.fillId!=='string'||!ID.test(trade.fillId)){
    throw new PairedClearingError('canonical simulation-only fill required');
  }
  const buyer=address(trade.buyerAccount),seller=address(trade.sellerAccount);
  if(buyer===seller)throw new PairedClearingError('self-match forbidden');
  const {c,s,key}=policy(ctx);
  const amount=uint256(trade.quantityAtomic,'quantityAtomic',true);
  const price=uint256(trade.priceAtomic,'priceAtomic',true);
  if(!Number.isSafeInteger(trade.buyerExpectedVersion)||trade.buyerExpectedVersion<0||
     !Number.isSafeInteger(trade.sellerExpectedVersion)||trade.sellerExpectedVersion<0){
    throw new PairedClearingError('invalid expectedVersion');
  }
  // Both fills are derived internally from one canonical trade, never two unrelated orders.
  const fill=(account:string,side:'BUY'|'SELL',version:number):PerpPositionFill=>({
    account,side,expectedVersion:version,fillId:trade.fillId,
    priceAtomic:price.toString(),quantityAtomic:amount.toString(),
    chainId:c.chainId,verifyingContract:c.verifyingContract,market:c.market,
    collateralToken:c.collateralToken,configRevision:c.revision,executionMode:'SIMULATION_ONLY',
  });

    // Row-level serialization of all pair updates in this market, including new accounts.
    await db.query(`INSERT INTO perp_market_open_interest
      (chain_id,verifying_contract,market,collateral_token,config_revision,open_interest_atomic)
      VALUES($1,$2,$3,$4,$5,'0') ON CONFLICT DO NOTHING`,[...key,c.revision]);
    const tracked=await db.query(`SELECT config_revision,open_interest_atomic,mode FROM perp_market_open_interest
      WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4 FOR UPDATE`,key);
    const old=tracked.rows[0] as {config_revision:number|string;open_interest_atomic:string;mode:string}|undefined;
    if(!old||old.mode!=='PAIRED'||Number(old.config_revision)!==c.revision){
      throw new PairedClearingError('market OI policy revision mismatch');
    }
    const already=await db.query(`SELECT fill_id FROM perp_sim_paired_fills
      WHERE chain_id=$1 AND verifying_contract=$2 AND fill_id=$3`,[c.chainId,c.verifyingContract,trade.fillId]);
    if(already.rows.length)throw new PairedClearingError('paired fill ID already processed');
    if(!guarded){
      const available=await db.query("SELECT to_regclass('perp_reduce_guards') AS oid");
      if((available.rows[0] as {oid:string|null}|undefined)?.oid){
        const found=await db.query(`SELECT account FROM perp_reduce_guards WHERE
          chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4
          AND account IN ($5,$6) LIMIT 1`,[...key,buyer,seller]);
        if(found.rows.length)throw new PairedClearingError('reduce-only guarded market account cannot use legacy paired fill');
      }
    }
    const before=await computeSimMarketOpenInterest(db,ctx);
    if(before.longQuantityAtomic!==before.shortQuantityAtomic||
       before.openInterestAtomic!==old.open_interest_atomic){
      throw new PairedClearingError('market snapshot and tracked OI disagree, recheck required');
    }
    // First execution cannot inherit nonzero unpaired M4-T2 snapshots as trusted fills.
    const marker=await db.query(`SELECT COUNT(*)::INTEGER AS count FROM perp_sim_paired_fills
      WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4`,key);
    const count=Number((marker.rows[0] as {count:number}).count);
    if(count===0 && before.openInterestAtomic!=='0'){
      throw new PairedClearingError('preexisting unpaired exposure cannot bootstrap market OI');
    }
    const buyerResult=await applySimPerpFillWithinTransaction(db,fill(buyer,'BUY',trade.buyerExpectedVersion),ctx);
    const sellerResult=await applySimPerpFillWithinTransaction(db,fill(seller,'SELL',trade.sellerExpectedVersion),ctx);
    const after=await computeSimMarketOpenInterest(db,ctx);
    if(after.longQuantityAtomic!==after.shortQuantityAtomic){
      throw new PairedClearingError('LONG/SHORT open interest imbalance');
    }
    const updated=await db.query(`UPDATE perp_market_open_interest
      SET open_interest_atomic=$5,version=version+1
      WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4
        AND open_interest_atomic=$6 AND config_revision=$7 RETURNING version`,
      [...key,after.openInterestAtomic,old.open_interest_atomic,c.revision]);
    if(updated.rows.length!==1)throw new PairedClearingError('market OI lost CAS race');
    const inserted=await db.query(`INSERT INTO perp_sim_paired_fills
      (chain_id,verifying_contract,market,collateral_token,fill_id,buyer_account,seller_account,
       quantity_atomic,price_atomic,config_revision,config_hash,oracle_sequence,open_interest_after)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING fill_id`,
      [...key,trade.fillId,buyer,seller,amount.toString(),price.toString(),c.revision,
       hashPerpMarketConfig(c),s.sourceSequence,after.openInterestAtomic]);
    if(inserted.rows.length!==1)throw new PairedClearingError('paired fill journal missing');
    return Object.freeze({buyer:buyerResult,seller:sellerResult,openInterest:after});
}

/** Confirm stored tracked OI equals recomputed aggregate. Unbalanced markets fail closed. */
export async function verifySimMarketOpenInterest(db:SqlRunner,ctx:PerpPositionContext){
  const {key,c}=policy(ctx);
  const computed=await computeSimMarketOpenInterest(db,ctx);
  const r=await db.query(`SELECT config_revision,open_interest_atomic,mode FROM perp_market_open_interest
    WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4`,key);
  const row=r.rows[0] as {config_revision:number|string;open_interest_atomic:string;mode:string}|undefined;
  if(!row){
    if(computed.openInterestAtomic!=='0')throw new PairedClearingError('untracked nonzero OI');
    return computed;
  }
  if(row.mode!=='PAIRED'||Number(row.config_revision)!==c.revision||computed.longQuantityAtomic!==computed.shortQuantityAtomic||
     computed.openInterestAtomic!==row.open_interest_atomic){
    throw new PairedClearingError('tracked OI fails aggregate invariant');
  }
  return computed;
}
