/** Durable, SIMULATION_ONLY, single-account position application. No real matching or funds. */
import {getAddress} from 'viem';
import type {OrderTransactionManager} from '../orders/order-transactions.ts';
import type {SqlRunner} from '../orders/nonce-registry.ts';
import {
  createEmptyPosition,applyPerpPositionFill,markPerpPosition,
  type PerpPosition,type PerpPositionFill,type PerpPositionContext,
  type PerpPositionTransition,
} from './position-engine.ts';
import {hashPerpMarketConfig} from './sim-order.ts';

export class PerpPositionLedgerError extends Error {
  constructor(message:string){super(message);this.name='PerpPositionLedgerError';}
}
const EMPTY_POSITION_RE = /^0x[0-9a-f]{64}$/;

type SnapshotRow={
  chain_id:string;verifying_contract:string;market:string;collateral_token:string;account:string;
  config_revision:number|string;size_signed_atomic:string;open_cost_numerator:string;
  realized_pnl_numerator:string;version:number|string;last_fill_id:string|null;
};
type ApplicationRow={
  applied_version:number|string;fill_id:string;size_signed_atomic:string;
  open_cost_numerator:string;realized_pnl_numerator:string;
};
function scopedAccount(raw:string):string {
  if(typeof raw!=='string')throw new PerpPositionLedgerError('account required');
  try{return getAddress(raw).toLowerCase();}
  catch{throw new PerpPositionLedgerError('invalid account address');}
}
function positionKey(context:PerpPositionContext,account:string){
  // Trusted policy and oracle are verified by the pure engine (even for reads).
  const empty=createEmptyPosition(account,context);
  return {empty,key:[empty.chainId,empty.verifyingContract,empty.market,empty.collateralToken,empty.account]};
}
function toPosition(row:SnapshotRow):Readonly<PerpPosition>{
  const version=Number(row.version),revision=Number(row.config_revision);
  if(!Number.isSafeInteger(version)||!Number.isSafeInteger(revision)){
    throw new PerpPositionLedgerError('persisted version/revision cannot be represented safely');
  }
  return Object.freeze({chainId:Number(row.chain_id),verifyingContract:row.verifying_contract,
    market:row.market,collateralToken:row.collateral_token,account:row.account,
    configRevision:revision,sizeSignedAtomic:row.size_signed_atomic,
    openCostNumerator:row.open_cost_numerator,realizedPnlNumerator:row.realized_pnl_numerator,
    version,lastFillId:row.last_fill_id});
}
function equalLatest(row:ApplicationRow|undefined,position:Readonly<PerpPosition>){
  if(position.version===0)return row===undefined;
  if(!row)return false;
  return Number(row.applied_version)===position.version && row.fill_id===position.lastFillId &&
    row.size_signed_atomic===position.sizeSignedAtomic &&
    row.open_cost_numerator===position.openCostNumerator &&
    row.realized_pnl_numerator===position.realizedPnlNumerator;
}
async function latest(db:SqlRunner,key:readonly unknown[]):Promise<ApplicationRow|undefined>{
  const q=await db.query(
    `SELECT applied_version,fill_id,size_signed_atomic,open_cost_numerator,realized_pnl_numerator
     FROM perp_position_applications WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3
       AND collateral_token=$4 AND account=$5 ORDER BY applied_version DESC LIMIT 1`,key);
  return q.rows[0] as ApplicationRow|undefined;
}
async function readSnapshot(db:SqlRunner,key:readonly unknown[],lock=false){
  const result=await db.query(
    `SELECT chain_id,verifying_contract,market,collateral_token,account,config_revision,
      size_signed_atomic,open_cost_numerator,realized_pnl_numerator,version,last_fill_id
     FROM perp_position_snapshots WHERE chain_id=$1 AND verifying_contract=$2
       AND market=$3 AND collateral_token=$4 AND account=$5${lock?' FOR UPDATE':''}`,key);
  return result.rows[0] as SnapshotRow|undefined;
}

/** Read-only snapshot with last-journal consistency check. Does not create accounts. */
export async function readSimPerpPosition(
  db:SqlRunner,account:string,context:PerpPositionContext,
):Promise<Readonly<PerpPosition>>{
  const {empty,key}=positionKey(context,account);
  const stored=await readSnapshot(db,key);
  if(!stored)return empty;
  const position=toPosition(stored);
  // markPerpPosition checks scope, timestamps, numeric format and risk bounds.
  markPerpPosition(position,context);
  if(!equalLatest(await latest(db,key),position)){
    throw new PerpPositionLedgerError('snapshot differs from durable latest application');
  }
  return position;
}

/**
 * Unique fill ID is scoped to chain/verifying-contract/account across ALL markets.
 * The buy and sell counterparty may use the same fillId in DIFFERENT accounts.
 * Any replay is rejected, even after multiple intervening fills and restarts.
 * Uses a DB snapshot row lock + unique application PK and a single transaction.
 */
export async function applySimPerpFillToLedger(
  transactions:OrderTransactionManager,fill:PerpPositionFill,context:PerpPositionContext,
):Promise<Readonly<PerpPositionTransition>>{
  return transactions.withTransaction(async db=>{
    // A single-account M4-T2 writer must not silently bypass paired-market OI.
    // to_regclass works even in old M4-T2 schema tests lacking migration 011.
    const present=await db.query(`SELECT to_regclass('perp_market_open_interest') AS oid`);
    if((present.rows[0] as {oid:string|null}|undefined)?.oid){
      const c=context.config;
      const marketKey=[c.chainId,c.verifyingContract.toLowerCase(),c.market,c.collateralToken.toLowerCase()];
      // Serializes even FIRST writer with pair bootstrap (INSERT unique row waits on
      // an uncommitted concurrent insert). Mark legacy as permanently UNPAIRED;
      // only an explicit future reconciliation may change its mode.
      await db.query(`INSERT INTO perp_market_open_interest
        (chain_id,verifying_contract,market,collateral_token,config_revision,mode,open_interest_atomic)
        VALUES($1,$2,$3,$4,$5,'UNPAIRED','0') ON CONFLICT DO NOTHING`,
        [...marketKey,c.revision]);
      const tracked=await db.query(`SELECT mode,config_revision FROM perp_market_open_interest
        WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4 FOR UPDATE`,marketKey);
      const marker=tracked.rows[0] as {mode:string;config_revision:number|string}|undefined;
      if(!marker||marker.mode!=='UNPAIRED'||Number(marker.config_revision)!==c.revision){
        throw new PerpPositionLedgerError('paired market requires atomic two-account application');
      }
    }
    return applySimPerpFillWithinTransaction(db,fill,context);
  });
}

/** Internal composition primitive: caller MUST own the same atomic DB transaction. */
export async function applySimPerpFillWithinTransaction(
  db:SqlRunner,fill:PerpPositionFill,context:PerpPositionContext,
):Promise<Readonly<PerpPositionTransition>>{
  if(!fill||fill.executionMode!=='SIMULATION_ONLY'||
     typeof fill.fillId!=='string'||!EMPTY_POSITION_RE.test(fill.fillId)){
    throw new PerpPositionLedgerError('simulation-only canonical fill required');
  }
  const account=scopedAccount(fill.account);
  const {empty,key}=positionKey(context,account);
  // No external API, live order matching, collateral, Vault or asset changes.
  {
    await db.query(
      `INSERT INTO perp_position_snapshots
       (chain_id,verifying_contract,market,collateral_token,account,config_revision,
        size_signed_atomic,open_cost_numerator,realized_pnl_numerator,version,last_fill_id)
       VALUES($1,$2,$3,$4,$5,$6,'0','0','0',0,NULL)
       ON CONFLICT (chain_id,verifying_contract,market,collateral_token,account) DO NOTHING`,
      [...key,empty.configRevision],
    );
    const row=await readSnapshot(db,key,true);
    if(!row)throw new PerpPositionLedgerError('snapshot row missing after insertion');
    const previous=toPosition(row);
    // Never allow a later policy revision to implicitly reinterpret old cost units.
    if(previous.configRevision!==empty.configRevision){
      throw new PerpPositionLedgerError('snapshot policy revision mismatch: explicit migration required');
    }
    markPerpPosition(previous,context);
    if(!equalLatest(await latest(db,key),previous)){
      throw new PerpPositionLedgerError('snapshot journal integrity violation');
    }
    const existing=await db.query(
      `SELECT fill_id FROM perp_position_applications WHERE chain_id=$1 AND verifying_contract=$2
        AND account=$3 AND fill_id=$4`,[empty.chainId,empty.verifyingContract,account,fill.fillId]);
    if(existing.rows.length)throw new PerpPositionLedgerError('fill ID already applied to this account');
    // The pure state transition verifies expectedVersion, entire fill identity,
    // mark freshness, tick/lot, bounded cost, and signed PnL arithmetic.
    const applied=applyPerpPositionFill(previous,fill,context);
    const next=applied.position;
    const journal=await db.query(
      `INSERT INTO perp_position_applications
       (chain_id,verifying_contract,market,collateral_token,account,fill_id,applied_version,
        side,price_atomic,quantity_atomic,config_revision,config_hash,oracle_sequence,
        closed_quantity_atomic,opened_quantity_atomic,realized_delta_atomic,
        size_signed_atomic,open_cost_numerator,realized_pnl_numerator)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING fill_id`,
      [...key,fill.fillId,next.version,fill.side,fill.priceAtomic,fill.quantityAtomic,
        next.configRevision,hashPerpMarketConfig(context.config),context.snapshot.sourceSequence,
        applied.closedQuantityAtomic,applied.openedQuantityAtomic,applied.realizedDeltaAtomic,
        next.sizeSignedAtomic,next.openCostNumerator,next.realizedPnlNumerator],
    );
    if(journal.rows.length!==1)throw new PerpPositionLedgerError('application journal insert failed');
    const updated=await db.query(
      `UPDATE perp_position_snapshots
       SET size_signed_atomic=$6,open_cost_numerator=$7,realized_pnl_numerator=$8,
           version=$9,last_fill_id=$10,updated_at=NOW()
       WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4
         AND account=$5 AND version=$11 AND config_revision=$12 RETURNING version`,
      [...key,next.sizeSignedAtomic,next.openCostNumerator,next.realizedPnlNumerator,
        next.version,next.lastFillId,previous.version,empty.configRevision],
    );
    if(updated.rows.length!==1)throw new PerpPositionLedgerError('snapshot CAS failed');
    return applied;
  }
}
