import { randomUUID } from 'node:crypto';
import { encodeFunctionData, keccak256, toHex } from 'viem';
import type { OrderSigningDomainInput } from '../orders/signature.ts';
import { validateOrderSigningDomain } from '../orders/signature.ts';
import type { OrderTransactionManager } from '../orders/order-transactions.ts';
import type { SqlRunner } from '../orders/nonce-registry.ts';
import { prepareSettlementInstructionFromLedger, type SettlementPolicyInput,
  type SettlementApprovalInput, type SettlementInstruction } from './policy.ts';

export type IntentStatus = 'PREPARED'|'SIMULATING'|'SIMULATED'|'UNKNOWN';
export interface StoredSettlementIntent {
  fillId: string;
  tradeId: string;
  instructionHash: string;
  status: IntentStatus;
  instruction: SettlementInstruction;
  resultHash: string | null;
}
export interface DryRunResult {
  tradeId: string;
  instructionHash: string;
  simulatedCallHash: string;
  calldata: `0x${string}`;
  status: 'SIMULATED';
}
export class SettlementIntentError extends Error {
  constructor(message: string) { super(message); this.name='SettlementIntentError'; }
}
const UINT_63=(1n<<63n)-1n;
const ID=/^[1-9][0-9]*$/;
const HASH=/^0x[0-9a-f]{64}$/;
const SETTLE_ABI=[{type:'function',name:'settle',stateMutability:'nonpayable',inputs:[
  {name:'token',type:'address'},{name:'from',type:'address'},
  {name:'to',type:'address'},{name:'amount',type:'uint256'},
  {name:'tradeId',type:'bytes32'}],outputs:[]}] as const;

function scoped(domainInput:OrderSigningDomainInput){
  const domain=validateOrderSigningDomain(domainInput);
  return [domain.chainId,domain.verifyingContract.toLowerCase()] as const;
}
function validFillId(fillId:unknown):string{
  if(typeof fillId!=='string'||!ID.test(fillId)||BigInt(fillId)>UINT_63)throw new SettlementIntentError('invalid fillId');
  return fillId;
}
function canonicalInstruction(input:SettlementInstruction):SettlementInstruction{
  // The ordered tuple is the only stored representation used by the dry-run.
  if(!input||!HASH.test(input.tradeId)||!HASH.test(input.policyHash)||
    typeof input.market!=='string'||!/^[A-Z0-9]+(?:[-_/][A-Z0-9]+)*$/.test(input.market)||input.market.length>32||
    !Number.isSafeInteger(input.chainId)||input.chainId<=0||
    !Number.isSafeInteger(input.tokenDecimals)||input.tokenDecimals<0||input.tokenDecimals>36||
    !Number.isSafeInteger(input.approvalDeadline)||input.approvalDeadline<=0||
    !ID.test(input.amount)||BigInt(input.amount)>(1n<<256n)-1n)throw new SettlementIntentError('invalid instruction');
  const addresses=[input.vault,input.token,input.from,input.to];
  if(addresses.some(s=>typeof s!=='string'||!/^0x[0-9a-f]{40}$/.test(s))||input.from===input.to)throw new SettlementIntentError('invalid instruction participants');
  return {tradeId:input.tradeId,fillId:validFillId(input.fillId),market:input.market,
    chainId:input.chainId,vault:input.vault,token:input.token,from:input.from,to:input.to,
    amount:input.amount,tokenDecimals:input.tokenDecimals,policyHash:input.policyHash,
    approvalDeadline:input.approvalDeadline};
}
function serialize(instruction:SettlementInstruction){
  const value=canonicalInstruction(instruction);
  const bytes=JSON.stringify([value.tradeId,value.fillId,value.market,value.chainId,value.vault,value.token,
    value.from,value.to,value.amount,value.tokenDecimals,value.policyHash,value.approvalDeadline]);
  return {value,hash:keccak256(toHex(bytes))};
}
function parseStored(row:Record<string,unknown>):StoredSettlementIntent {
  if(!row)throw new SettlementIntentError('settlement intent missing');
  if(!['PREPARED','SIMULATING','SIMULATED','UNKNOWN'].includes(row.status as string))throw new SettlementIntentError('unknown intent status');
  const raw=typeof row.instruction_json==='string'?JSON.parse(row.instruction_json):row.instruction_json;
  const instruction=canonicalInstruction(raw as SettlementInstruction);
  const {hash}=serialize(instruction);
  if(hash!==row.instruction_hash||instruction.tradeId!==row.trade_id||instruction.fillId!==String(row.fill_id)){
    throw new SettlementIntentError('stored instruction integrity mismatch');
  }
  return {fillId:instruction.fillId,tradeId:instruction.tradeId,instructionHash:hash,
    status:row.status as IntentStatus,instruction,resultHash:row.result_hash as string|null};
}

async function readRow(db:SqlRunner,scope:readonly [number,string],fillId:string){
  const found=await db.query('SELECT * FROM settlement_intents WHERE chain_id=$1 AND verifying_contract=$2 AND fill_id=$3',
    [scope[0],scope[1],fillId]);
  return found.rows.length?parseStored(found.rows[0] as Record<string,unknown>):null;
}

/** Revalidates policy and approval against committed ledger before storing one immutable intent. */
export async function recordApprovedSettlementIntent(
  transactions:OrderTransactionManager,domain:OrderSigningDomainInput,fillId:string,
  policy:SettlementPolicyInput,approval:SettlementApprovalInput,
  nowSeconds=Math.floor(Date.now()/1000),
):Promise<StoredSettlementIntent>{
  const id=validFillId(fillId);
  // This check happens BEFORE each attempted insert, including duplicate retries.
  const instruction=await prepareSettlementInstructionFromLedger(transactions,domain,id,policy,approval,nowSeconds);
  const {value,hash}=serialize(instruction);
  const scope=scoped(domain);
  return transactions.withTransaction(async db=>{
    // INSERT...SELECT also gates on WAITING_POLICY within the write transaction.
    await db.query(
      `INSERT INTO settlement_intents
         (fill_id,chain_id,verifying_contract,trade_id,instruction_hash,instruction_json)
       SELECT fill_id,chain_id,verifying_contract,trade_id,$4,$5::jsonb
       FROM settlement_outbox
       WHERE fill_id=$3 AND chain_id=$1 AND verifying_contract=$2 AND status='WAITING_POLICY' AND trade_id=$6
       ON CONFLICT (fill_id) DO NOTHING RETURNING fill_id`,
      [...scope,id,hash,JSON.stringify(value),value.tradeId],
    );
    const stored=await readRow(db,scope,id);
    if(!stored || stored.instructionHash!==hash || stored.tradeId!==value.tradeId ||
        JSON.stringify(stored.instruction)!==JSON.stringify(value)){
      throw new SettlementIntentError('existing settlement intent conflicts with approved instruction or state');
    }
    return stored;
  });
}

export async function getSettlementIntent(
  db:SqlRunner,domain:OrderSigningDomainInput,fillId:string,
):Promise<StoredSettlementIntent|null>{return readRow(db,scoped(domain),validFillId(fillId));}

/**
 * Local-only dry-run. The transaction calldata is ENCODED, NEVER transmitted.
 * Simulating is a fenced durable boundary: interrupted attempts remain SIMULATING
 * until a separate reconciliation step quarantines them; no automatic resubmit.
 */
export async function executeSettlementDryRun(
  transactions:OrderTransactionManager,domain:OrderSigningDomainInput,fillId:string,
):Promise<DryRunResult>{
  const id=validFillId(fillId),scope=scoped(domain),token=randomUUID();
  const claimed=await transactions.withTransaction(async db=>{
    const result=await db.query(
      `UPDATE settlement_intents SET status='SIMULATING',simulation_token=$4,
         simulation_started_at=NOW(),updated_at=NOW()
       WHERE chain_id=$1 AND verifying_contract=$2 AND fill_id=$3 AND status='PREPARED'
       RETURNING *`,
      [...scope,id,token],
    );
    return result.rows.length?parseStored(result.rows[0] as Record<string,unknown>):null;
  });
  if(!claimed)throw new SettlementIntentError('dry-run already reserved, finished, or uncertain; manual reconciliation required');
  const calldata=encodeFunctionData({abi:SETTLE_ABI,functionName:'settle',args:[
    claimed.instruction.token as `0x${string}`,claimed.instruction.from as `0x${string}`,
    claimed.instruction.to as `0x${string}`,BigInt(claimed.instruction.amount),claimed.tradeId as `0x${string}`,
  ]});
  const resultHash=keccak256(calldata);
  const finished=await transactions.withTransaction(async db=>{
    const result=await db.query(
      `UPDATE settlement_intents SET status='SIMULATED',simulation_token=NULL,
          simulation_started_at=NULL,result_hash=$5,updated_at=NOW()
       WHERE chain_id=$1 AND verifying_contract=$2 AND fill_id=$3
         AND status='SIMULATING' AND simulation_token=$4
       RETURNING fill_id`,
      [...scope,id,token,resultHash],
    );
    return result.rows.length===1;
  });
  if(!finished)throw new SettlementIntentError('dry-run claim lost; status requires manual review');
  return {tradeId:claimed.tradeId,instructionHash:claimed.instructionHash,simulatedCallHash:resultHash,
    calldata,status:'SIMULATED'};
}

/**
 * Separate explicit recovery: quarantine an interrupted local simulation.
 * No resubmission or automatic transition from UNKNOWN to PREPARED is exposed.
 */
export async function quarantineInterruptedSimulation(
  transactions:OrderTransactionManager,domain:OrderSigningDomainInput,fillId:string,
  minAgeSeconds=60,
):Promise<boolean>{
  if(!Number.isSafeInteger(minAgeSeconds)||minAgeSeconds<1||minAgeSeconds>86400)throw new SettlementIntentError('invalid recovery age');
  const scope=scoped(domain),id=validFillId(fillId);
  return transactions.withTransaction(async db=>{
    const result=await db.query(
      `UPDATE settlement_intents SET status='UNKNOWN',simulation_token=NULL,
          simulation_started_at=NULL,updated_at=NOW()
       WHERE chain_id=$1 AND verifying_contract=$2 AND fill_id=$3 AND status='SIMULATING'
         AND simulation_started_at<=NOW()-($4 * INTERVAL '1 second')
       RETURNING fill_id`,[...scope,id,minAgeSeconds]);
    return result.rows.length===1;
  });
}
