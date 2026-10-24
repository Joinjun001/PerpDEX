import { randomUUID } from "node:crypto";
import type { SqlRunner } from "../orders/nonce-registry.ts";
import type { OrderTransactionManager } from "../orders/order-transactions.ts";
import type { OrderSigningDomainInput } from "../orders/signature.ts";
import { validateOrderSigningDomain } from "../orders/signature.ts";
import { listSettlementSourceFills, type SettlementSourceFill } from "./fill-source.ts";

export type OutboxStatus = 'PENDING_POLICY' | 'PREPARING' | 'RETRYABLE' | 'WAITING_POLICY';
export interface SettlementOutboxEntry {
  fillId: string;
  tradeId: string;
  market: string;
  status: OutboxStatus;
  attemptCount: number;
  leaseToken: string | null;
  lastError: string | null;
}
export class SettlementOutboxError extends Error {
  constructor(message: string) { super(message); this.name = 'SettlementOutboxError'; }
}

const FILL = /^(0|[1-9][0-9]*)$/;
const MAX_ID = (1n << 63n) - 1n;
function canonicalId(value: unknown, allowZero = false): string {
  if (typeof value !== 'string' || !FILL.test(value)) throw new SettlementOutboxError('fillId must be canonical decimal');
  const n = BigInt(value);
  if (n > MAX_ID || (!allowZero && n === 0n)) throw new SettlementOutboxError('fillId out of range');
  return n.toString();
}
function boundedInteger(value: number, field: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new SettlementOutboxError(`${field} out of range`);
  return value;
}
function scope(trustedDomain: OrderSigningDomainInput) {
  const domain = validateOrderSigningDomain(trustedDomain);
  return [domain.chainId, domain.verifyingContract.toLowerCase()] as const;
}
function parseRow(row: any): SettlementOutboxEntry {
  if (!row) throw new SettlementOutboxError('outbox record is missing');
  const fillId = canonicalId(String(row.fill_id));
  if (!['PENDING_POLICY','PREPARING','RETRYABLE','WAITING_POLICY'].includes(row.status)) {
    throw new SettlementOutboxError('unknown outbox state');
  }
  return {fillId, tradeId:row.trade_id, market:row.market, status:row.status,
    attemptCount:Number(row.attempt_count), leaseToken:row.lease_token ?? null, lastError:row.last_error ?? null};
}

/** Atomically inserts a validated, committed fill exactly once. No auto-approval. */
export async function enqueueSettlementFill(
  transactions: OrderTransactionManager,
  trustedDomain: OrderSigningDomainInput,
  fillIdInput: string,
): Promise<SettlementOutboxEntry> {
  const fillId = canonicalId(fillIdInput);
  const [chainId, contract] = scope(trustedDomain);
  return transactions.withTransaction(async db => {
    // Read a single validated ledger row; never trust caller-provided trade details.
    const prev = (BigInt(fillId) - 1n).toString();
    const matched = await listSettlementSourceFills(db, trustedDomain, {afterFillId: prev, limit: 1});
    const fill: SettlementSourceFill | undefined = matched[0];
    if (!fill || fill.fillId !== fillId) throw new SettlementOutboxError('no valid committed fill for this signing domain');
    await db.query(
      `INSERT INTO settlement_outbox (fill_id, chain_id, verifying_contract, market, trade_id)
       SELECT fill_id, chain_id, verifying_contract, market, $4
       FROM order_fills
       WHERE fill_id=$3 AND chain_id=$1 AND verifying_contract=$2 AND market=$5
       ON CONFLICT (fill_id) DO NOTHING`,
      [chainId, contract, fillId, fill.tradeId, fill.market],
    );
    const stored = await db.query(
      `SELECT * FROM settlement_outbox WHERE chain_id=$1 AND verifying_contract=$2 AND fill_id=$3`,
      [chainId, contract, fillId],
    );
    const entry = parseRow(stored.rows[0]);
    if (entry.tradeId !== fill.tradeId || entry.market !== fill.market) {
      throw new SettlementOutboxError('existing outbox record conflicts with immutable fill');
    }
    return entry;
  });
}

/** Enqueue a bounded page from a trusted source; same fill can be replayed safely. */
export async function enqueueSettlementPage(
  transactions: OrderTransactionManager,
  trustedDomain: OrderSigningDomainInput,
  options: { afterFillId?: string; limit?: number } = {},
): Promise<SettlementOutboxEntry[]> {
  const [chainId, contract] = scope(trustedDomain);
  return transactions.withTransaction(async db => {
    const fills = await listSettlementSourceFills(db, trustedDomain, options);
    const out: SettlementOutboxEntry[] = [];
    for (const fill of fills) {
      await db.query(
        `INSERT INTO settlement_outbox (fill_id, chain_id, verifying_contract, market, trade_id)
         SELECT fill_id, chain_id, verifying_contract, market, $4
         FROM order_fills
         WHERE fill_id=$3 AND chain_id=$1 AND verifying_contract=$2 AND market=$5
         ON CONFLICT (fill_id) DO NOTHING`,
        [chainId, contract, fill.fillId, fill.tradeId, fill.market],
      );
      const selected = await db.query(
        'SELECT * FROM settlement_outbox WHERE chain_id=$1 AND verifying_contract=$2 AND fill_id=$3',
        [chainId, contract, fill.fillId],
      );
      const entry = parseRow(selected.rows[0]);
      if (entry.tradeId !== fill.tradeId || entry.market !== fill.market) throw new SettlementOutboxError('outbox ledger mismatch');
      out.push(entry);
    }
    return out;
  });
}

/**
 * Claim ONE locally preparable record. A DB atomically serializes claims across
 * workers with SKIP LOCKED. Expired claims are recoverable, stale tokens are not.
 * No chain transaction or policy authorization occurs in this function.
 */
export async function claimSettlementPreparation(
  transactions: OrderTransactionManager,
  trustedDomain: OrderSigningDomainInput,
  leaseSeconds = 60,
): Promise<SettlementOutboxEntry | null> {
  boundedInteger(leaseSeconds, 'leaseSeconds', 1, 3600);
  const [chainId, contract] = scope(trustedDomain);
  const token = randomUUID();
  return transactions.withTransaction(async db => {
    const result = await db.query(
      `WITH candidate AS (
         SELECT fill_id FROM settlement_outbox
         WHERE chain_id=$1 AND verifying_contract=$2 AND (
           status='PENDING_POLICY'
           OR (status='RETRYABLE' AND retry_after <= NOW())
           OR (status='PREPARING' AND lease_expires_at <= NOW())
         )
         ORDER BY fill_id ASC LIMIT 1 FOR UPDATE SKIP LOCKED
       )
       UPDATE settlement_outbox o
       SET status='PREPARING', lease_token=$3,
           lease_expires_at=NOW()+($4 * INTERVAL '1 second'),
           retry_after=NULL, last_error=NULL, attempt_count=attempt_count+1,
           updated_at=NOW()
       FROM candidate WHERE o.fill_id=candidate.fill_id
       RETURNING o.*`,
      [chainId, contract, token, leaseSeconds],
    );
    return result.rows.length ? parseRow(result.rows[0]) : null;
  });
}

/**
 * Completes a LOCAL metadata check only. WAITING_POLICY means NOT approved.
 * Fencing token and DB lease expiry are checked atomically.
 */
export async function finishSettlementPreparation(
  transactions: OrderTransactionManager,
  trustedDomain: OrderSigningDomainInput,
  fillIdInput: string,
  token: string,
): Promise<boolean> {
  return changeClaimState(transactions, trustedDomain, fillIdInput, token, 'WAITING_POLICY', null, 0);
}

/** For local preparation failure. Retry is delayed; still no chain action. */
export async function retrySettlementPreparation(
  transactions: OrderTransactionManager,
  trustedDomain: OrderSigningDomainInput,
  fillIdInput: string,
  token: string,
  retrySeconds: number,
  reason: string,
): Promise<boolean> {
  boundedInteger(retrySeconds, 'retrySeconds', 1, 86400);
  if (typeof reason !== 'string' || reason.length < 1 || reason.length > 160) {
    throw new SettlementOutboxError('reason must contain 1..160 characters');
  }
  return changeClaimState(transactions, trustedDomain, fillIdInput, token, 'RETRYABLE', reason, retrySeconds);
}

async function changeClaimState(
  transactions: OrderTransactionManager, trustedDomain: OrderSigningDomainInput,
  fillIdInput: string, token: string, status: 'WAITING_POLICY'|'RETRYABLE',
  reason: string | null, retrySeconds: number,
): Promise<boolean> {
  const fillId = canonicalId(fillIdInput);
  if (typeof token !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    throw new SettlementOutboxError('invalid lease token');
  }
  const [chainId, contract] = scope(trustedDomain);
  return transactions.withTransaction(async db => {
    const changed = await db.query(
      `UPDATE settlement_outbox
       SET status=$5::VARCHAR(24), lease_token=NULL, lease_expires_at=NULL,
           retry_after=CASE WHEN $5::VARCHAR(24)='RETRYABLE' THEN NOW()+($6 * INTERVAL '1 second') ELSE NULL END,
           last_error=$7, updated_at=NOW()
       WHERE chain_id=$1 AND verifying_contract=$2 AND fill_id=$3
         AND status='PREPARING' AND lease_token=$4 AND lease_expires_at>NOW()
       RETURNING fill_id`,
      [chainId, contract, fillId, token, status, retrySeconds, reason],
    );
    return changed.rows.length === 1;
  });
}

export async function getSettlementOutboxEntry(
  db: SqlRunner, trustedDomain: OrderSigningDomainInput, fillIdInput: string,
): Promise<SettlementOutboxEntry | null> {
  const [chainId, contract] = scope(trustedDomain);
  const rows = await db.query(
    'SELECT * FROM settlement_outbox WHERE chain_id=$1 AND verifying_contract=$2 AND fill_id=$3',
    [chainId, contract, canonicalId(fillIdInput)],
  );
  return rows.rows.length ? parseRow(rows.rows[0]) : null;
}
