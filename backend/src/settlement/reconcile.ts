import { keccak256, toHex } from 'viem';
import type { OrderSigningDomainInput } from '../orders/signature.ts';
import { validateOrderSigningDomain } from '../orders/signature.ts';
import type { OrderTransactionManager } from '../orders/order-transactions.ts';
import type { SqlRunner } from '../orders/nonce-registry.ts';
import { getSettlementIntent, type StoredSettlementIntent } from './dry-run.ts';

export type ReconciliationStatus = 'UNCONFIRMED'|'RECHECK_REQUIRED'|'MOCK_VERIFIED'|'MOCK_FAILED'|'UNKNOWN';
export interface MockSettledEvent {
  tradeId: string;
  token: string;
  from: string;
  to: string;
  amount: string;
}
export interface MockReceipt {
  chainId: number;
  vault: string;
  tradeId: string;
  transactionHash: string;
  blockHash: string;
  blockNumber: string;
  confirmations: number;
  outcome: 'SUCCESS'|'REVERTED';
  event: MockSettledEvent | null;
  settledTrades: boolean;
}
export type MockObservation =
  | {kind:'MISSING'}
  | {kind:'PENDING'}
  | {kind:'UNAVAILABLE'}
  | {kind:'RECEIPT'; receipt:MockReceipt};
export class SettlementReconciliationError extends Error {
  constructor(message:string){super(message);this.name='SettlementReconciliationError';}
}
/** In-memory fixture only; intentionally cannot accept URLs, keys, or RPC providers. */
export class InMemoryMockReceiptProvider {
  readonly mode='MOCK_READONLY' as const;
  private readonly records=new Map<string,MockObservation>();
  set(tradeId:string,observation:MockObservation):void{
    if(!HEX.test(tradeId))throw new SettlementReconciliationError('invalid tradeId');
    this.records.set(tradeId,structuredClone(observation));
  }
  async read(tradeId:string):Promise<MockObservation>{
    return structuredClone(this.records.get(tradeId)??{kind:'MISSING'});
  }
}
export interface SettlementReconciliation {
  fillId:string;
  tradeId:string;
  status:ReconciliationStatus;
  source:'MOCK_READONLY';
  txHash:string|null;
  blockHash:string|null;
  blockNumber:string|null;
  evidenceHash:string|null;
  observationCount:number;
  lastError:string|null;
}
const HEX=/^0x[0-9a-f]{64}$/;
const ADDRESS=/^0x[0-9a-f]{40}$/;
const DECIMAL=/^[1-9][0-9]*$/;
const MAX_FILL=(1n<<63n)-1n;
function fillId(value:string):string{
  if(typeof value!=='string'||!DECIMAL.test(value)||BigInt(value)>MAX_FILL){
    throw new SettlementReconciliationError('invalid fillId');
  }
  return value;
}
function scope(domainInput:OrderSigningDomainInput){
  const domain=validateOrderSigningDomain(domainInput);
  return [domain.chainId,domain.verifyingContract.toLowerCase()] as const;
}
function parse(row:Record<string,unknown>):SettlementReconciliation{
  if(!['UNCONFIRMED','RECHECK_REQUIRED','MOCK_VERIFIED','MOCK_FAILED','UNKNOWN'].includes(row.status as string)
    ||row.source!=='MOCK_READONLY')throw new SettlementReconciliationError('stored reconciliation invalid');
  return {fillId:String(row.fill_id),tradeId:String(row.trade_id),status:row.status as ReconciliationStatus,
    source:'MOCK_READONLY',txHash:row.tx_hash as string|null,blockHash:row.block_hash as string|null,
    blockNumber:row.block_number===null?null:String(row.block_number),
    evidenceHash:row.evidence_hash as string|null,observationCount:Number(row.observation_count),
    lastError:row.last_error as string|null};
}
export async function getSettlementReconciliation(
  db:SqlRunner,domain:OrderSigningDomainInput,fillIdInput:string,
):Promise<SettlementReconciliation|null>{
  const [chainId,contract]=scope(domain);
  const found=await db.query('SELECT * FROM settlement_reconciliations WHERE chain_id=$1 AND verifying_contract=$2 AND fill_id=$3',
    [chainId,contract,fillId(fillIdInput)]);
  return found.rows.length?parse(found.rows[0] as Record<string,unknown>):null;
}

type Decision={status:ReconciliationStatus;txHash:string|null;blockHash:string|null;
  blockNumber:string|null;evidenceHash:string|null;error:string|null};
function decide(observation:MockObservation,intent:StoredSettlementIntent,minConfirmations:number):Decision{
  const empty={txHash:null,blockHash:null,blockNumber:null,evidenceHash:null};
  if(observation.kind==='MISSING')return {status:'UNCONFIRMED',...empty,error:null};
  if(observation.kind==='PENDING')return {status:'RECHECK_REQUIRED',...empty,error:'mock receipt pending'};
  if(observation.kind==='UNAVAILABLE')return {status:'RECHECK_REQUIRED',...empty,error:'mock provider unavailable'};
  if(observation.kind!=='RECEIPT'||!observation.receipt||typeof observation.receipt!=='object'){
    throw new SettlementReconciliationError('invalid observation');
  }
  const r=observation.receipt;
  if(r.chainId!==intent.instruction.chainId||r.vault!==intent.instruction.vault||r.tradeId!==intent.tradeId||
    !HEX.test(r.transactionHash)||!HEX.test(r.blockHash)||!DECIMAL.test(r.blockNumber)||BigInt(r.blockNumber)>MAX_FILL||
    !Number.isSafeInteger(r.confirmations)||r.confirmations<0||r.confirmations>Number.MAX_SAFE_INTEGER||
    !['SUCCESS','REVERTED'].includes(r.outcome)||typeof r.settledTrades!=='boolean'){
    throw new SettlementReconciliationError('mock receipt domain, address or block metadata invalid');
  }
  if(r.outcome==='SUCCESS'){
    const e=r.event;
    if(!e||e.tradeId!==intent.tradeId||e.token!==intent.instruction.token||
       e.from!==intent.instruction.from||e.to!==intent.instruction.to||
       e.amount!==intent.instruction.amount||!r.settledTrades){
      throw new SettlementReconciliationError('mock Settled event or settledTrades inconsistent with approved instruction');
    }
  }else if(r.event!==null||r.settledTrades){
    throw new SettlementReconciliationError('mock reverted receipt conflicts with Settled event/state');
  }
  // Number of confirmations is deliberately not part of the immutable evidence fingerprint.
  const evidenceHash=keccak256(toHex(JSON.stringify([
    r.chainId,r.vault,r.tradeId,r.transactionHash,r.blockHash,r.blockNumber,r.outcome,r.event,r.settledTrades,
  ])));
  const meta={txHash:r.transactionHash,blockHash:r.blockHash,blockNumber:r.blockNumber,evidenceHash};
  if(r.confirmations<minConfirmations){
    return {status:'RECHECK_REQUIRED',...meta,error:'mock confirmations below required threshold'};
  }
  return {status:r.outcome==='SUCCESS'?'MOCK_VERIFIED':'MOCK_FAILED',...meta,error:null};
}

/**
 * Explicit read-only fixture reconciliation. No blockchain client is accepted.
 * A mock VERIFIED/FAILED state is never a live chain settlement assertion.
 */
export async function reconcileMockSettlement(
  transactions:OrderTransactionManager,domain:OrderSigningDomainInput,fillIdInput:string,
  provider:InMemoryMockReceiptProvider,minConfirmations=3,
):Promise<SettlementReconciliation>{
  if(!(provider instanceof InMemoryMockReceiptProvider)||provider.mode!=='MOCK_READONLY'){
    throw new SettlementReconciliationError('only the in-memory mock provider is allowed');
  }
  if(!Number.isSafeInteger(minConfirmations)||minConfirmations<1||minConfirmations>128){
    throw new SettlementReconciliationError('invalid confirmation threshold');
  }
  const id=fillId(fillIdInput),[chainId,contract]=scope(domain);
  const before=await transactions.withTransaction(db=>getSettlementIntent(db,domain,id));
  if(!before||!['SIMULATED','UNKNOWN'].includes(before.status)){
    throw new SettlementReconciliationError('mock reconciliation needs locally simulated or quarantined intent');
  }
  let observation:MockObservation;
  try{observation=await provider.read(before.tradeId);}
  catch{observation={kind:'UNAVAILABLE'};}
  const decision=decide(observation,before,minConfirmations);
  return transactions.withTransaction(async db=>{
    // Serialize concurrent observations and future changes to the underlying intent.
    const locked=await db.query(
      'SELECT fill_id FROM settlement_intents WHERE chain_id=$1 AND verifying_contract=$2 AND fill_id=$3 FOR UPDATE',
      [chainId,contract,id]);
    if(!locked.rows.length)throw new SettlementReconciliationError('settlement intent disappeared');
    const current=await getSettlementIntent(db,domain,id);
    if(!current||current.tradeId!==before.tradeId||current.instructionHash!==before.instructionHash||
       !['SIMULATED','UNKNOWN'].includes(current.status)){
      throw new SettlementReconciliationError('intent changed during observation');
    }
    const previous=await db.query(
      'SELECT * FROM settlement_reconciliations WHERE chain_id=$1 AND verifying_contract=$2 AND fill_id=$3 FOR UPDATE',
      [chainId,contract,id]);
    const old=previous.rows.length?parse(previous.rows[0] as Record<string,unknown>):null;
    if(old&&old.tradeId!==current.tradeId)throw new SettlementReconciliationError('stored reconciliation trade mismatch');
    // Existing final evidence is immutable: even matching transaction with fewer
    // confirmations is a regression that requires manual review.
    if(old&&['MOCK_VERIFIED','MOCK_FAILED'].includes(old.status)){
      if(old.status!==decision.status||old.evidenceHash!==decision.evidenceHash){
        throw new SettlementReconciliationError('terminal mock proof cannot regress or conflict');
      }
      return old;
    }
    // UNKNOWN is an irreversible quarantine; only manual recovery may resolve it.
    if(old?.status==='UNKNOWN')return old;
    let next=decision;
    if(old?.txHash&&decision.txHash&&old.txHash!==decision.txHash ||
       old?.blockHash&&decision.blockHash&&old.blockHash!==decision.blockHash){
      next={status:'UNKNOWN',txHash:old?.txHash??null,blockHash:old?.blockHash??null,
        blockNumber:old?.blockNumber??null,evidenceHash:old?.evidenceHash??null,
        error:'contradictory mock transaction or block evidence; manual review required'};
    }else if(old?.txHash&&!decision.txHash){
      // MISSING/UNAVAILABLE after seeing a receipt is not a negative chain proof.
      next={...decision,status:'RECHECK_REQUIRED',txHash:old.txHash,blockHash:old.blockHash,
        blockNumber:old.blockNumber,evidenceHash:old.evidenceHash,
        error:'previous mock receipt temporarily unavailable; manual recheck required'};
    }else if(old?.status==='RECHECK_REQUIRED'&&decision.status==='UNCONFIRMED'){
      next={...decision,status:'RECHECK_REQUIRED',error:'mock receipt still unconfirmed; recheck required'};
    }
    await db.query(
      `INSERT INTO settlement_reconciliations
        (fill_id,chain_id,verifying_contract,trade_id,status,tx_hash,block_hash,block_number,evidence_hash,last_error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (fill_id) DO UPDATE SET status=EXCLUDED.status,
         tx_hash=EXCLUDED.tx_hash,block_hash=EXCLUDED.block_hash,
         block_number=EXCLUDED.block_number,evidence_hash=EXCLUDED.evidence_hash,
         last_error=EXCLUDED.last_error,observation_count=settlement_reconciliations.observation_count+1,
         updated_at=NOW()`,
      [id,chainId,contract,current.tradeId,next.status,next.txHash,next.blockHash,next.blockNumber,next.evidenceHash,next.error],
    );
    const committed=await getSettlementReconciliation(db,domain,id);
    if(!committed)throw new SettlementReconciliationError('reconciliation insert failed');
    return committed;
  });
}
