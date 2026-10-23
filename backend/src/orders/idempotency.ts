import {validateCreateOrder, createDeterministicOrderId} from "./order.ts";
import type {CreateOrderInput, OrderInput} from "./order.ts";
import {verifyOrderSignature, validateOrderSigningDomain} from "./signature.ts";
import type {OrderSigningDomainInput} from "./signature.ts";
import type {SqlRunner} from "./nonce-registry.ts";
import {InvalidOrderSignatureError} from "./order-auth.ts";
import {validateCancelOrder, verifyCancelSignature, InvalidCancelSignatureError} from "./cancel-signature.ts";
import type {CancelOrderInput} from "./cancel-signature.ts";
import type {CancelResult} from "./cancel-order.ts";

const compareSig=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();

export class PostgresIdempotencyReceipts {
  private readonly db:SqlRunner;
  constructor(db:SqlRunner) {this.db=db;}

  /**
   * A conflict is not proof of retry. The caller must authenticate the
   * request anew AND match all immutable order fields and the exact signature.
   * Current order status may have changed; return its current status.
   */
  async retryCreate(raw:CreateOrderInput,signature:string,domainInput:OrderSigningDomainInput):Promise<{
    orderId:string; status:string; order:OrderInput
  }|null> {
    const order=validateCreateOrder(raw);
    if(!await verifyOrderSignature(order,domainInput,signature))throw new InvalidOrderSignatureError();
    const domain=validateOrderSigningDomain(domainInput);
    const result=await this.db.query(
      `SELECT order_id, market, side, price, quantity, expires_at, signature, status
       FROM orders WHERE chain_id=$1 AND verifying_contract=$2 AND account=$3 AND nonce=$4`,
      [domain.chainId,domain.verifyingContract.toLowerCase(),order.account,order.nonce],
    );
    const found=result.rows[0] as {
      order_id:string; market:string; side:string; price:string; quantity:string;
      expires_at:string|number;signature:string;status:string;
    }|undefined;
    if(!found || found.order_id!==createDeterministicOrderId(order) ||
      !compareSig(found.signature,signature) ||
      found.market!==order.market || found.side!==order.side ||
      found.price!==order.price || found.quantity!==order.quantity ||
      Number(found.expires_at)!==order.expiresAt) return null;
    return {orderId:found.order_id,status:found.status,order};
  }

  /** A receipt is stored ONLY with a committed successful cancellation. */
  async recordCancel(request:CancelOrderInput, signature:string,
    domainInput:OrderSigningDomainInput,result:CancelResult):Promise<void> {
    const domain=validateOrderSigningDomain(domainInput);
    await this.db.query(
      `INSERT INTO order_cancel_receipts (
        chain_id,verifying_contract,account,nonce,deadline,signature,order_exists,remaining_quantity)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [domain.chainId,domain.verifyingContract.toLowerCase(),request.account.toLowerCase(),
       request.nonce,request.deadline,signature.toLowerCase(),result.orderExists,result.remainingQuantity],
    );
  }

  async retryCancel(raw:CancelOrderInput,signature:string,domainInput:OrderSigningDomainInput):Promise<CancelResult|null> {
    const request=validateCancelOrder(raw);
    if(!await verifyCancelSignature(request,domainInput,signature))throw new InvalidCancelSignatureError();
    const domain=validateOrderSigningDomain(domainInput);
    const result=await this.db.query(
      `SELECT deadline, signature, order_exists, remaining_quantity FROM order_cancel_receipts
       WHERE chain_id=$1 AND verifying_contract=$2 AND account=$3 AND nonce=$4`,
      [domain.chainId,domain.verifyingContract.toLowerCase(),request.account.toLowerCase(),request.nonce],
    );
    const stored=result.rows[0] as {
      deadline:string|number; signature:string;order_exists:boolean;remaining_quantity:string|null
    }|undefined;
    if(!stored || Number(stored.deadline)!==request.deadline || !compareSig(stored.signature,signature))return null;
    return stored.order_exists
      ? {status:"CANCELED",orderExists:true,remainingQuantity:stored.remaining_quantity!}
      : {status:"CANCELED",orderExists:false,remainingQuantity:null};
  }
}
