import type { SqlRunner } from "./nonce-registry.ts";
import type { OrderInput } from "./order.ts";
import type { OrderSigningDomainInput } from "./signature.ts";
import { validateOrderSigningDomain } from "./signature.ts";

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
