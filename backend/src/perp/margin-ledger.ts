import {getAddress} from 'viem';
import type {OrderSigningDomainInput} from '../orders/signature.ts';
import {validateOrderSigningDomain} from '../orders/signature.ts';
import type {OrderTransactionManager} from '../orders/order-transactions.ts';
import type {SqlRunner} from '../orders/nonce-registry.ts';
import {MAX_UINT256,uint256} from './fixed-point.ts';

export type MarginBucket = 'AVAILABLE' | 'RESERVED' | 'POSITION';
export type MarginAction = 'RESERVE' | 'RELEASE' | 'ALLOCATE' | 'UNALLOCATE';
export interface IsolatedMarginAccountInput {
  market: string;
  collateralToken: string;
  account: string;
}
export interface MarginOperationInput extends IsolatedMarginAccountInput {
  operationId: string;
  action: MarginAction;
  amount: string;
}
export interface MarginBalances {
  available: string;
  reserved: string;
  positionMargin: string;
  total: string;
}
export interface MarginOperationReceipt {
  operationId: string;
  action: MarginAction;
  amount: string;
  fromBucket: MarginBucket;
  toBucket: MarginBucket;
  balances: MarginBalances;
  replayed: boolean;
}
export class MarginLedgerError extends Error {
  constructor(message:string){super(message);this.name='MarginLedgerError';}
}

const ZERO='0x0000000000000000000000000000000000000000';
const MARKET=/^[A-Z0-9]+(?:[-_/][A-Z0-9]+)*$/;
const OP_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const BUCKETS=['AVAILABLE','POSITION','RESERVED'] as const;
const ROUTES:Record<MarginAction,readonly [MarginBucket,MarginBucket]>={
  RESERVE:['AVAILABLE','RESERVED'],
  RELEASE:['RESERVED','AVAILABLE'],
  ALLOCATE:['RESERVED','POSITION'],
  UNALLOCATE:['POSITION','AVAILABLE'],
};
function evmAddress(raw:unknown, label:string){
  if(typeof raw!=='string')throw new MarginLedgerError(`${label} must be an EVM address`);
  try{const value=getAddress(raw).toLowerCase();if(value===ZERO)throw Error();return value;}
  catch{throw new MarginLedgerError(`${label} invalid or zero EVM address`);}
}
function identity(input:IsolatedMarginAccountInput, domainInput:OrderSigningDomainInput){
  if(!input||typeof input!=='object'||typeof input.market!=='string'||
      input.market.length>32||!MARKET.test(input.market))throw new MarginLedgerError('invalid market');
  const domain=validateOrderSigningDomain(domainInput);
  return [domain.chainId,domain.verifyingContract.toLowerCase(),input.market,
    evmAddress(input.collateralToken,'collateralToken'),evmAddress(input.account,'account')] as const;
}
function amount(value:unknown):bigint {
  try{return uint256(value,'amount',true);}
  catch{throw new MarginLedgerError('amount must be a positive canonical uint256 decimal');}
}
function parseBalance(value:unknown):bigint{
  try{return uint256(String(value),'persisted margin balance');}
  catch{throw new MarginLedgerError('stored margin balance invalid');}
}
function balances(rows:readonly {bucket:MarginBucket;balance:string}[]):MarginBalances{
  const values=new Map<MarginBucket,bigint>();
  for(const row of rows){
    if(!BUCKETS.includes(row.bucket as typeof BUCKETS[number])||values.has(row.bucket)){
      throw new MarginLedgerError('unexpected margin bucket or duplicate bucket');
    }
    values.set(row.bucket,parseBalance(row.balance));
  }
  const available=values.get('AVAILABLE')??0n;
  const reserved=values.get('RESERVED')??0n;
  const position=values.get('POSITION')??0n;
  const total=available+reserved+position;
  if(total>MAX_UINT256)throw new MarginLedgerError('total margin balance overflow');
  return {available:available.toString(),reserved:reserved.toString(),
    positionMargin:position.toString(),total:total.toString()};
}
/** Read-only balance lookup, no auto-created funds or ledger rows. */
export async function getIsolatedMarginBalances(
  db:SqlRunner,domain:OrderSigningDomainInput,input:IsolatedMarginAccountInput,
):Promise<MarginBalances>{
  const args=identity(input,domain);
  const found=await db.query(
    `SELECT bucket,balance FROM perp_margin_balances WHERE chain_id=$1 AND verifying_contract=$2
     AND market=$3 AND collateral_token=$4 AND account=$5`,args,
  );
  return balances(found.rows as Array<{bucket:MarginBucket;balance:string}>);
}
/**
 * Atomic double-entry transfer within a single user's isolated collateral account.
 * NO issuance/withdrawal/external-account debit; client cannot select transfer buckets.
 * Idempotency token is unique per (domain, market, collateral token) across accounts.
 */
export async function transferIsolatedMargin(
  transactions:OrderTransactionManager,domain:OrderSigningDomainInput,raw:MarginOperationInput,
):Promise<MarginOperationReceipt>{
  const args=identity(raw,domain);
  if(typeof raw.operationId!=='string'||!OP_ID.test(raw.operationId)){
    throw new MarginLedgerError('invalid immutable operationId');
  }
  if(!Object.hasOwn(ROUTES,raw.action))throw new MarginLedgerError('unsupported margin action');
  const route=ROUTES[raw.action];
  const value=amount(raw.amount);
  return transactions.withTransaction(async db=>{
    const opKey=[...args.slice(0,4),raw.operationId] as const;
    const inserted=await db.query(
      `INSERT INTO perp_margin_operations
         (chain_id,verifying_contract,market,collateral_token,operation_id,account,action,from_bucket,to_bucket,amount)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (chain_id,verifying_contract,market,collateral_token,operation_id) DO NOTHING
       RETURNING operation_id`,
      [...opKey,args[4],raw.action,...route,value.toString()],
    );
    const replayed=inserted.rows.length===0;
    if(replayed){
      const record=await db.query(
        `SELECT account,action,from_bucket,to_bucket,amount FROM perp_margin_operations
         WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4 AND operation_id=$5`,opKey,
      );
      const prev=record.rows[0] as {account:string;action:string;from_bucket:string;to_bucket:string;amount:string}|undefined;
      if(!prev||prev.account!==args[4]||prev.action!==raw.action||prev.from_bucket!==route[0]||
         prev.to_bucket!==route[1]||prev.amount!==value.toString()){
        throw new MarginLedgerError('operationId reused with conflicting payload');
      }
      const legs=await db.query(
        `SELECT leg,account,bucket,signed_delta FROM perp_margin_entries
         WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4 AND operation_id=$5 ORDER BY leg`,opKey,
      );
      const pair=legs.rows as Array<{leg:number;account:string;bucket:string;signed_delta:string}>;
      if(pair.length!==2||pair[0].leg!==0||pair[1].leg!==1||
         pair[0].account!==args[4]||pair[1].account!==args[4]||
         pair[0].bucket!==route[0]||pair[1].bucket!==route[1]||
         pair[0].signed_delta!==`-${value}`||pair[1].signed_delta!==value.toString()){
        throw new MarginLedgerError('stored posting pair integrity mismatch');
      }
      return {operationId:raw.operationId,action:raw.action,amount:value.toString(),
        fromBucket:route[0],toBucket:route[1],balances:await getIsolatedMarginBalances(db,domain,raw),replayed:true};
    }
    // Create only empty bucket rows. This cannot seed available margin.
    for(const bucket of BUCKETS){
      await db.query(
        `INSERT INTO perp_margin_balances
          (chain_id,verifying_contract,market,collateral_token,account,bucket,balance)
         VALUES($1,$2,$3,$4,$5,$6,'0') ON CONFLICT DO NOTHING`,[...args,bucket],
      );
    }
    const found=await db.query(
      `SELECT bucket,balance FROM perp_margin_balances WHERE chain_id=$1 AND verifying_contract=$2
       AND market=$3 AND collateral_token=$4 AND account=$5 ORDER BY bucket FOR UPDATE`,args,
    );
    const list=found.rows as Array<{bucket:MarginBucket;balance:string}>;
    if(list.length!==3)throw new MarginLedgerError('expected exactly three margin buckets');
    const before=balances(list);
    const map=new Map(list.map(row=>[row.bucket,parseBalance(row.balance)]));
    const from=map.get(route[0]);const to=map.get(route[1]);
    if(from===undefined||to===undefined||from<value)throw new MarginLedgerError('insufficient available margin in source bucket');
    if(to+value>MAX_UINT256)throw new MarginLedgerError('receiving margin bucket overflow');
    for(const [bucket,newBalance,oldBalance] of [
      [route[0],from-value,from],[route[1],to+value,to],
    ] as Array<[MarginBucket,bigint,bigint]>){
      const result=await db.query(
        `UPDATE perp_margin_balances SET balance=$6,version=version+1
         WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 AND collateral_token=$4
           AND account=$5 AND bucket=$7 AND balance=$8 RETURNING bucket`,
        [...args,newBalance.toString(),bucket,oldBalance.toString()],
      );
      if(result.rows.length!==1)throw new MarginLedgerError('concurrent balance mutation detected');
    }
    for(const [leg,bucket,delta] of [
      [0,route[0],`-${value}`],[1,route[1],value.toString()],
    ] as Array<[number,MarginBucket,string]>){
      await db.query(
        `INSERT INTO perp_margin_entries
           (chain_id,verifying_contract,market,collateral_token,operation_id,leg,account,bucket,signed_delta)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[...opKey,leg,args[4],bucket,delta],
      );
    }
    const after=await getIsolatedMarginBalances(db,domain,raw);
    if(after.total!==before.total)throw new MarginLedgerError('double-entry conservation invariant violated');
    return {operationId:raw.operationId,action:raw.action,amount:value.toString(),
      fromBucket:route[0],toBucket:route[1],balances:after,replayed:false};
  });
}
