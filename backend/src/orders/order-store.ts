import type { SqlRunner } from "./nonce-registry.ts";
import type { OrderInput } from "./order.ts";
import type { OrderSigningDomainInput } from "./signature.ts";
import { validateOrderSigningDomain } from "./signature.ts";

export interface PublicOrder {
  orderId: string;
  account: string;
  nonce: string;
  market: string;
  side: string;
  price: string;
  quantity: string;
  filledQuantity: string;
  expiresAt: number;
  status: string;
  createdAt: string;
}

interface DatabasePublicOrder {
  order_id: string;
  account: string;
  nonce: string;
  market: string;
  side: string;
  price: string;
  quantity: string;
  filled_quantity: string;
  expires_at: number | string;
  status: string;
  created_at: string;
}

function publicOrder(row: DatabasePublicOrder): PublicOrder {
  return {
    orderId: row.order_id,
    account: row.account,
    nonce: row.nonce,
    market: row.market,
    side: row.side,
    price: row.price,
    quantity: row.quantity,
    filledQuantity: row.filled_quantity,
    expiresAt: Number(row.expires_at),
    status: row.status,
    createdAt: row.created_at,
  };
}

// Reusable for REST APIs, matching, and background workers.
// The caller MUST supply the SAME transaction-scoped SQL connection used to claim the nonce.
export class PostgresOrderStore {
  private readonly db: SqlRunner;
  constructor(db: SqlRunner) {
    this.db = db;
  }

  async insert(input: {
    order: OrderInput;
    orderId: string;
    signature: string;
    domain: OrderSigningDomainInput;
  }): Promise<void> {
    const { order, orderId, signature } = input;
    const domain = validateOrderSigningDomain(input.domain);
    await this.db.query(
      `INSERT INTO orders (
        chain_id, verifying_contract, account, nonce,
        order_id, market, side, price, quantity, expires_at, signature, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'OPEN')`,
      [
        domain.chainId, domain.verifyingContract.toLowerCase(), order.account.toLowerCase(),
        order.nonce, orderId, order.market, order.side,
        order.price, order.quantity, order.expiresAt, signature.toLowerCase(),
      ],
    );
  }

  /**
   * Guarded status transition for an authorized cancel service.
   * Filled quantity is deliberately preserved: partial fills remain settled.
   */
  async cancelActive(input: {
    account: string;
    nonce: string;
    domain: OrderSigningDomainInput;
  }): Promise<{ status: "CANCELED"; quantity: string; filled_quantity: string } | null> {
    const domain = validateOrderSigningDomain(input.domain);
    const result = await this.db.query(
      `UPDATE orders SET status='CANCELED', updated_at=NOW()
       WHERE chain_id=$1 AND verifying_contract=$2 AND account=$3 AND nonce=$4
         AND status IN ('OPEN','PARTIALLY_FILLED')
       RETURNING status, quantity, filled_quantity`,
      [domain.chainId, domain.verifyingContract.toLowerCase(), input.account.toLowerCase(), input.nonce],
    );
    return (result.rows[0] as { status: "CANCELED"; quantity: string; filled_quantity: string } | undefined) ?? null;
  }

  /**
   * Public order projection. Never SELECT signature or other credentials.
   * Queries are scoped to a trusted server EIP-712 domain, not request data.
   */
  async findPublicById(orderId: string, domainInput: OrderSigningDomainInput): Promise<PublicOrder | null> {
    const domain = validateOrderSigningDomain(domainInput);
    const result = await this.db.query(
      `SELECT order_id, account, nonce, market, side, price, quantity,
              filled_quantity, expires_at, status, created_at::TEXT AS created_at
       FROM orders
       WHERE chain_id=$1 AND verifying_contract=$2 AND order_id=$3`,
      [domain.chainId, domain.verifyingContract.toLowerCase(), orderId.toLowerCase()],
    );
    const row = result.rows[0] as DatabasePublicOrder | undefined;
    return row ? publicOrder(row) : null;
  }

  /**
   * Stable ordering for offset-based pagination: newest first, then account
   * and nonce as immutable tie breakers. Read one extra row for hasMore.
   */
  async listPublic(input: {
    domain: OrderSigningDomainInput;
    market?: string;
    status?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: PublicOrder[]; hasMore: boolean }> {
    const domain = validateOrderSigningDomain(input.domain);
    const values: unknown[] = [domain.chainId, domain.verifyingContract.toLowerCase()];
    let sql = `SELECT order_id, account, nonce, market, side, price, quantity,
                      filled_quantity, expires_at, status, created_at::TEXT AS created_at
               FROM orders WHERE chain_id=$1 AND verifying_contract=$2`;
    if (input.market) {
      values.push(input.market);
      sql += " AND market=$" + values.length;
    }
    if (input.status) {
      values.push(input.status);
      sql += " AND status=$" + values.length;
    }
    values.push(input.limit + 1, input.offset);
    sql += " ORDER BY created_at DESC, account ASC, nonce ASC LIMIT $" + (values.length - 1) + " OFFSET $" + values.length;
    const result = await this.db.query(sql, values);
    const rows = result.rows as DatabasePublicOrder[];
    return {
      items: rows.slice(0, input.limit).map(publicOrder),
      hasMore: rows.length > input.limit,
    };
  }

  async findByNonce(input: {
    account: string;
    nonce: string;
    domain: OrderSigningDomainInput;
  }) {
    const domain = validateOrderSigningDomain(input.domain);
    const result = await this.db.query(
      `SELECT order_id, market, side, price, quantity, filled_quantity, status, expires_at
       FROM orders WHERE chain_id=$1 AND verifying_contract=$2 AND account=$3 AND nonce=$4`,
      [domain.chainId, domain.verifyingContract.toLowerCase(), input.account.toLowerCase(), input.nonce],
    );
    return (result.rows[0] as Record<string, unknown> | undefined) ?? null;
  }
}
