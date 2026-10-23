import { getAddress } from "viem";
import type { OrderInput } from "./order.ts";
import { validateOrderSigningDomain } from "./signature.ts";
import type { OrderSigningDomainInput } from "./signature.ts";

// pg.Pool and PGlite both expose this async single-statement interface.
export interface SqlRunner {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: unknown[]; rowCount?: number | null }>;
}

export type NonceStatus = "USED" | "CANCELED" | "EXPIRED";

export class NonceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonceValidationError";
  }
}

export class NonceAlreadyUsedError extends Error {
  constructor() {
    super("order nonce already consumed, canceled, or expired");
    this.name = "NonceAlreadyUsedError";
  }
}

const MAX_UINT256 = (1n << 256n) - 1n;
const ZERO = "0x0000000000000000000000000000000000000000";

function canonicalNonce(input: string): string {
  if (typeof input !== "string" || !/^(0|[1-9][0-9]*)$/.test(input)) {
    throw new NonceValidationError("nonce must be canonical unsigned decimal string");
  }
  if (BigInt(input) > MAX_UINT256) throw new NonceValidationError("nonce exceeds uint256");
  return input;
}

function key(input: { account: string; nonce: string }, domainInput: OrderSigningDomainInput) {
  const domain = validateOrderSigningDomain(domainInput);
  let account: string;
  try {
    account = getAddress(input.account).toLowerCase();
  } catch {
    throw new NonceValidationError("invalid signer address");
  }
  if (account === ZERO) throw new NonceValidationError("zero signer address");
  return [domain.chainId, domain.verifyingContract.toLowerCase(), account, canonicalNonce(input.nonce)] as const;
}

function validateOrderId(value: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new NonceValidationError("orderId must be a 32-byte hex digest");
  }
  return value.toLowerCase();
}

/**
 * PostgreSQL PRIMARY KEY and INSERT ... ON CONFLICT guarantee that only one
 * claimant can consume each (domain, signer, nonce), even across API replicas.
 *
 * No in-memory cache is used. A consumed/canceled/expired nonce is NEVER freed.
 * Caller must verify the signature before consume() and authorize cancel().
 */
export class PostgresNonceRegistry {
  private readonly db: SqlRunner;

  constructor(db: SqlRunner) {
    this.db = db;
  }

  async consume(order: OrderInput, domain: OrderSigningDomainInput, orderId: string): Promise<boolean> {
    const parts = key(order, domain);
    if (!Number.isSafeInteger(order.expiresAt) || order.expiresAt <= Math.floor(Date.now() / 1000)) {
      // The caller may verify against a fixed now for unit tests, but a DB consume
      // must always reject already expired orders at commit-request time.
      throw new NonceValidationError("cannot consume an expired order");
    }
    const result = await this.db.query(
      `INSERT INTO order_nonces
        (chain_id, verifying_contract, account, nonce, order_id, expires_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,'USED')
       ON CONFLICT (chain_id, verifying_contract, account, nonce) DO NOTHING
       RETURNING nonce`,
      [...parts, validateOrderId(orderId), order.expiresAt],
    );
    return result.rows.length === 1;
  }

  /**
   * Internal only: caller MUST authenticate the account's cancellation intent.
   * INSERT first marks unused nonce as canceled. An already accepted order can
   * transition USED->CANCELED but stays permanently reserved.
   */
  async cancel(input: { account: string; nonce: string }, domain: OrderSigningDomainInput): Promise<boolean> {
    const result = await this.db.query(
      `INSERT INTO order_nonces
        (chain_id, verifying_contract, account, nonce, status)
       VALUES ($1,$2,$3,$4,'CANCELED')
       ON CONFLICT (chain_id, verifying_contract, account, nonce)
       DO UPDATE SET status='CANCELED', updated_at=NOW()
       WHERE order_nonces.status='USED'
       RETURNING nonce`,
      key(input, domain),
    );
    return result.rows.length === 1;
  }

  /** Expire an already consumed order; preserve its permanent nonce tombstone. */
  async expire(input: { account: string; nonce: string }, domain: OrderSigningDomainInput, nowSeconds = Math.floor(Date.now() / 1000)): Promise<boolean> {
    if (!Number.isSafeInteger(nowSeconds)) throw new NonceValidationError("invalid nowSeconds");
    const result = await this.db.query(
      `UPDATE order_nonces SET status='EXPIRED', updated_at=NOW()
       WHERE chain_id=$1 AND verifying_contract=$2 AND account=$3 AND nonce=$4
         AND status='USED' AND expires_at <= $5
       RETURNING nonce`,
      [...key(input, domain), nowSeconds],
    );
    return result.rows.length === 1;
  }

  async status(input: { account: string; nonce: string }, domain: OrderSigningDomainInput): Promise<NonceStatus | null> {
    const result = await this.db.query(
      `SELECT status FROM order_nonces
       WHERE chain_id=$1 AND verifying_contract=$2 AND account=$3 AND nonce=$4`,
      key(input, domain),
    );
    return (result.rows[0] as { status: NonceStatus } | undefined)?.status ?? null;
  }
}
