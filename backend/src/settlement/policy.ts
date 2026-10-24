import { getAddress, keccak256, recoverTypedDataAddress, toHex } from 'viem';
import type { Hex } from 'viem';
import type { OrderSigningDomainInput } from '../orders/signature.ts';
import { validateOrderSigningDomain } from '../orders/signature.ts';
import type { OrderTransactionManager } from '../orders/order-transactions.ts';
import type { SettlementSourceFill } from './fill-source.ts';
import { listSettlementSourceFills, settlementTradeId } from './fill-source.ts';
import { getSettlementOutboxEntry, type SettlementOutboxEntry } from './outbox.ts';

/** Policy MUST come from a trusted operator configuration, never a public HTTP body. */
export interface SettlementPolicyInput {
  policyId: string;
  revision: number;
  status: 'APPROVED' | 'DRAFT' | 'REVOKED';
  chainId: number;
  verifyingContract: string;
  market: string;
  vault: string;
  token: string;
  tokenDecimals: number;
  transferDirection: 'BUYER_TO_SELLER' | 'SELLER_TO_BUYER';
  settlementModel: 'EXPLICIT_APPROVED_TRANSFER';
  marginModel: 'EXTERNAL_RISK_ENGINE';
  feeModel: 'EXTERNALLY_ACCOUNTED';
  feeBps: number;
  maxAmountBaseUnits: string;
  approver: string;
  validFrom: number;
  validUntil: number;
}

/** Signed by the policy's trusted approver over the EXACT fill and payment. */
export interface SettlementApprovalInput {
  amountBaseUnits: string;
  deadline: number;
  signature: string;
}

export interface SettlementInstruction {
  tradeId: `0x${string}`;
  fillId: string;
  market: string;
  chainId: number;
  vault: string;
  token: string;
  from: string;
  to: string;
  amount: string;
  tokenDecimals: number;
  policyHash: `0x${string}`;
  approvalDeadline: number;
}

export class SettlementPolicyError extends Error {
  constructor(message: string) { super(message); this.name = 'SettlementPolicyError'; }
}

const MAX_UINT256 = (1n << 256n) - 1n;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const MARKET = /^[A-Z0-9]+(?:[-_/][A-Z0-9]+)*$/;
const TRADE = /^0x[0-9a-f]{64}$/;
const ZERO = '0x0000000000000000000000000000000000000000';

function positiveAmount(input: unknown, name: string): bigint {
  if (typeof input !== 'string' || !DECIMAL.test(input)) throw new SettlementPolicyError(`${name}: canonical decimal required`);
  const value = BigInt(input);
  if (value === 0n || value > MAX_UINT256) throw new SettlementPolicyError(`${name}: positive uint256 required`);
  return value;
}
function integer(value: unknown, name: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new SettlementPolicyError(`${name}: invalid safe integer`);
  }
  return value as number;
}
function address(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new SettlementPolicyError(`${name}: address required`);
  try {
    const a = getAddress(value).toLowerCase();
    if (a === ZERO) throw new Error('zero');
    return a;
  } catch { throw new SettlementPolicyError(`${name}: invalid or zero address`); }
}
function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SettlementPolicyError(`${name}: object required`);
  return value as Record<string, unknown>;
}
function normalizedPolicy(raw: unknown, trustedDomain: OrderSigningDomainInput, nowSeconds: number) {
  integer(nowSeconds, 'nowSeconds', 0, Number.MAX_SAFE_INTEGER);
  const value = object(raw, 'policy');
  const domain = validateOrderSigningDomain(trustedDomain);
  if (value.status !== 'APPROVED') throw new SettlementPolicyError('policy has no trusted approval');
  if (typeof value.policyId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value.policyId)) throw new SettlementPolicyError('policyId invalid');
  const revision = integer(value.revision, 'revision', 1, 1000000);
  const chainId = integer(value.chainId, 'chainId', 1, Number.MAX_SAFE_INTEGER);
  const verifyingContract = address(value.verifyingContract, 'verifyingContract');
  if (chainId !== domain.chainId || verifyingContract !== domain.verifyingContract.toLowerCase()) {
    throw new SettlementPolicyError('policy signing domain mismatch');
  }
  if (typeof value.market !== 'string' || value.market.length > 32 || !MARKET.test(value.market)) throw new SettlementPolicyError('market invalid');
  const vault = address(value.vault, 'vault');
  const token = address(value.token, 'token');
  if (vault === token) throw new SettlementPolicyError('vault and asset must differ');
  const approver = address(value.approver, 'approver');
  const tokenDecimals = integer(value.tokenDecimals, 'tokenDecimals', 0, 36);
  const feeBps = integer(value.feeBps, 'feeBps', 0, 10000);
  if (value.settlementModel !== 'EXPLICIT_APPROVED_TRANSFER' ||
      value.marginModel !== 'EXTERNAL_RISK_ENGINE' || value.feeModel !== 'EXTERNALLY_ACCOUNTED') {
    throw new SettlementPolicyError('unsupported or missing accounting/risk model');
  }
  if (value.transferDirection !== 'BUYER_TO_SELLER' && value.transferDirection !== 'SELLER_TO_BUYER') {
    throw new SettlementPolicyError('transferDirection must be explicit');
  }
  const maxAmountBaseUnits = positiveAmount(value.maxAmountBaseUnits, 'maxAmountBaseUnits');
  const validFrom = integer(value.validFrom, 'validFrom', 1, Number.MAX_SAFE_INTEGER);
  const validUntil = integer(value.validUntil, 'validUntil', 1, Number.MAX_SAFE_INTEGER);
  if (validFrom > nowSeconds || validUntil <= nowSeconds || validUntil <= validFrom) {
    throw new SettlementPolicyError('policy is not currently valid');
  }
  return {policyId:value.policyId, revision, status:'APPROVED' as const, chainId, verifyingContract,
    market:value.market, vault, token, tokenDecimals, transferDirection:value.transferDirection,
    settlementModel:value.settlementModel, marginModel:value.marginModel, feeModel:value.feeModel,
    feeBps, maxAmountBaseUnits:maxAmountBaseUnits.toString(), approver, validFrom, validUntil};
}

/** Canonical hash binds all economic settings to the risk approval signature. */
export function settlementPolicyHash(
  policy: SettlementPolicyInput, trustedDomain: OrderSigningDomainInput, nowSeconds = Math.floor(Date.now()/1000),
): `0x${string}` {
  const p = normalizedPolicy(policy, trustedDomain, nowSeconds);
  return keccak256(toHex(JSON.stringify([
    p.policyId,p.revision,p.status,p.chainId,p.verifyingContract,p.market,p.vault,p.token,
    p.tokenDecimals,p.transferDirection,p.settlementModel,p.marginModel,p.feeModel,
    p.feeBps,p.maxAmountBaseUnits,p.approver,p.validFrom,p.validUntil,
  ])));
}

/** Exported for trusted risk approver signing integrations and offline unit tests. */
export function buildSettlementApprovalTypedData(
  fill: SettlementSourceFill, policy: SettlementPolicyInput,
  amountBaseUnits: string, deadline: number,
  trustedDomain: OrderSigningDomainInput,
  nowSeconds = Math.floor(Date.now()/1000),
) {
  const p = normalizedPolicy(policy, trustedDomain, nowSeconds);
  const normalized = validatedFill(fill, trustedDomain, p.market);
  const amount = positiveAmount(amountBaseUnits, 'amountBaseUnits');
  if (amount > BigInt(p.maxAmountBaseUnits)) throw new SettlementPolicyError('transfer exceeds policy maximum');
  const expires = integer(deadline, 'approval deadline', 1, Number.MAX_SAFE_INTEGER);
  if (expires <= nowSeconds || expires > p.validUntil) throw new SettlementPolicyError('approval expired or outlives policy');
  const from = p.transferDirection === 'BUYER_TO_SELLER' ? normalized.buyer : normalized.seller;
  const to = p.transferDirection === 'BUYER_TO_SELLER' ? normalized.seller : normalized.buyer;
  return {
    domain: {name:'PerpDEX Settlement Policy', version:'1', chainId:p.chainId, verifyingContract:p.vault as `0x${string}`},
    types: {SettlementApproval: [
      {name:'policyHash', type:'bytes32'}, {name:'tradeId', type:'bytes32'},
      {name:'fillId', type:'uint256'}, {name:'market', type:'string'},
      {name:'price', type:'uint256'}, {name:'quantity', type:'uint256'},
      {name:'token', type:'address'}, {name:'from', type:'address'}, {name:'to', type:'address'},
      {name:'amount', type:'uint256'}, {name:'deadline', type:'uint256'},
    ]} as const,
    primaryType: 'SettlementApproval' as const,
    message: {
      policyHash: settlementPolicyHash(policy, trustedDomain, nowSeconds),
      tradeId: normalized.tradeId as `0x${string}`, fillId: BigInt(normalized.fillId),
      market:normalized.market,price:BigInt(normalized.price),quantity:BigInt(normalized.quantity),
      token:p.token as `0x${string}`,from:from as `0x${string}`,to:to as `0x${string}`,
      amount,deadline:BigInt(expires),
    },
  };
}

function validatedFill(fill: SettlementSourceFill, trustedDomain: OrderSigningDomainInput, market: string) {
  const domain = validateOrderSigningDomain(trustedDomain);
  if (!fill || fill.chainId !== domain.chainId ||
      address(fill.verifyingContract,'fill.verifyingContract') !== domain.verifyingContract.toLowerCase() ||
      fill.market !== market || !TRADE.test(fill.tradeId)) throw new SettlementPolicyError('fill domain/market/trade mismatch');
  if (typeof fill.fillId !== 'string' || !/^[1-9][0-9]*$/.test(fill.fillId) || BigInt(fill.fillId) > (1n<<63n)-1n) {
    throw new SettlementPolicyError('fill identifier invalid');
  }
  if (fill.tradeId !== settlementTradeId(trustedDomain, fill.fillId)) {
    throw new SettlementPolicyError('tradeId does not correspond to the committed fill');
  }
  const buyer = address(fill.buyer,'buyer');
  const seller = address(fill.seller,'seller');
  if (buyer === seller) throw new SettlementPolicyError('self-settlement prohibited');
  positiveAmount(fill.price,'fill.price');
  positiveAmount(fill.quantity,'fill.quantity');
  return {...fill,buyer,seller};
}

/**
 * Only emits a data-only draft after verifying a signature from the explicitly
 * trusted policy approver. There is NO transaction sender or implicit approval.
 */
export async function verifyAndBuildSettlementInstruction(
  fill: SettlementSourceFill, outbox: SettlementOutboxEntry | null,
  policy: SettlementPolicyInput, approval: SettlementApprovalInput,
  trustedDomain: OrderSigningDomainInput,
  nowSeconds = Math.floor(Date.now()/1000),
): Promise<SettlementInstruction> {
  const record = object(approval,'approval');
  const p = normalizedPolicy(policy, trustedDomain, nowSeconds);
  const source = validatedFill(fill, trustedDomain, p.market);
  if (!outbox || outbox.status !== 'WAITING_POLICY' || outbox.fillId !== source.fillId ||
      outbox.tradeId !== source.tradeId || outbox.market !== source.market) {
    throw new SettlementPolicyError('matching policy-waiting outbox record required');
  }
  const typed = buildSettlementApprovalTypedData(source, policy, record.amountBaseUnits as string,
    record.deadline as number, trustedDomain, nowSeconds);
  if (typeof record.signature !== 'string' || !/^0x[0-9a-fA-F]{128,130}$/.test(record.signature)) {
    throw new SettlementPolicyError('approval signature required');
  }
  let recovered: string;
  try {
    recovered = (await recoverTypedDataAddress({...typed, signature:record.signature as Hex})).toLowerCase();
  } catch { throw new SettlementPolicyError('approval signature invalid'); }
  if (recovered !== p.approver) throw new SettlementPolicyError('approval signer not authorized');
  return {
    tradeId:source.tradeId, fillId:source.fillId, market:source.market,chainId:p.chainId,
    vault:p.vault,token:p.token,
    from:typed.message.from, to:typed.message.to,
    amount:typed.message.amount.toString(), tokenDecimals:p.tokenDecimals,
    policyHash:typed.message.policyHash, approvalDeadline:record.deadline as number,
  };
}

/**
 * Repo-only composition: read the real validated fill and domain-scoped Outbox
 * within a consistent transaction; no RPC, credentials or ledger mutation.
 */
export async function prepareSettlementInstructionFromLedger(
  transactions: OrderTransactionManager, trustedDomain: OrderSigningDomainInput,
  fillId: string, policy: SettlementPolicyInput, approval: SettlementApprovalInput,
  nowSeconds = Math.floor(Date.now()/1000),
): Promise<SettlementInstruction> {
  if (typeof fillId !== 'string' || !/^[1-9][0-9]*$/.test(fillId) || BigInt(fillId) > (1n<<63n)-1n) {
    throw new SettlementPolicyError('fillId invalid');
  }
  return transactions.withTransaction(async db => {
    const earlier = (BigInt(fillId)-1n).toString();
    const fill = (await listSettlementSourceFills(db, trustedDomain,{afterFillId:earlier,limit:1}))[0];
    if (!fill || fill.fillId !== fillId) throw new SettlementPolicyError('committed fill not found');
    const outbox = await getSettlementOutboxEntry(db, trustedDomain, fillId);
    return verifyAndBuildSettlementInstruction(fill,outbox,policy,approval,trustedDomain,nowSeconds);
  });
}
