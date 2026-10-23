import {validateOrderSigningDomain} from "../orders/signature.ts";
import type {OrderSigningDomainInput} from "../orders/signature.ts";
import type {OrderTransactionManager} from "../orders/order-transactions.ts";
import type {SqlRunner} from "../orders/nonce-registry.ts";
import {matchIncomingOrder} from "./engine.ts";
import type {BookOrder, MatchResult, MatchFill} from "./engine.ts";

export class OrderBookStateError extends Error {
  constructor(message:string) {super(message);this.name="OrderBookStateError";}
}

export interface StoredOrderKey {
  account:string;
  nonce:string;
}

function identity(key:StoredOrderKey, domainInput:OrderSigningDomainInput) {
  const domain=validateOrderSigningDomain(domainInput);
  if(typeof key.account!=="string" || !/^0x[0-9a-fA-F]{40}$/.test(key.account) ||
     typeof key.nonce!=="string" || !/^(0|[1-9][0-9]*)$/.test(key.nonce)) {
    throw new OrderBookStateError("invalid persisted order lookup key");
  }
  return [domain.chainId,domain.verifyingContract.toLowerCase(),key.account.toLowerCase(),key.nonce] as const;
}

function rowToBook(row:Record<string,unknown>):BookOrder {
  return {
    orderId:String(row.order_id),
    market:String(row.market),
    side:row.side as BookOrder["side"],
    price:String(row.price),
    quantity:String(row.quantity),
    filledQuantity:String(row.filled_quantity),
    status:row.status as BookOrder["status"],
    expiresAt:Number(row.expires_at),
    arrivalSequence:String(row.arrival_sequence),
  };
}

/** Used only on a transaction-scoped SqlRunner. Locks held until COMMIT/ROLLBACK. */
async function lockMarket(db:SqlRunner, chainId:number, contract:string, market:string) {
  const found=await db.query(
    `SELECT last_sequence FROM order_book_counters
     WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3 FOR UPDATE`,
    [chainId,contract,market],
  );
  if(found.rows.length!==1)throw new OrderBookStateError("market counter not initialized");
  return BigInt(String((found.rows[0] as {last_sequence:string}).last_sequence));
}

/**
 * Explicit book admission. MUST be invoked for an already persisted, signed
 * order. Book registration (not untrusted HTTP arrival time) defines price/time
 * priority. The public POST API integrates this operation via one transaction.
 */
export async function registerSignedOrderInBookWithRunner(
  key:StoredOrderKey, trustedDomain:OrderSigningDomainInput,
  db:SqlRunner,
  nowSeconds=Math.floor(Date.now()/1000),
):Promise<{market:string;arrivalSequence:string}> {
  const [chainId,contract,account,nonce]=identity(key,trustedDomain);
  if(!Number.isSafeInteger(nowSeconds))throw new OrderBookStateError("invalid current time");
  // Must be supplied a transaction-bound SqlRunner by its caller.
  {
    // Immutable order data can be read before the market lock. No row lock is
    // taken here, avoiding inverted lock order with matching/cancellation.
    const found=await db.query(
      `SELECT market FROM orders WHERE chain_id=$1 AND verifying_contract=$2
       AND account=$3 AND nonce=$4`,[chainId,contract,account,nonce],
    );
    const market=(found.rows[0] as {market:string}|undefined)?.market;
    if(!market)throw new OrderBookStateError("order not persisted");
    await db.query(
      `INSERT INTO order_book_counters(chain_id,verifying_contract,market,last_sequence)
       VALUES ($1,$2,$3,0) ON CONFLICT DO NOTHING`,[chainId,contract,market],
    );
    const last=await lockMarket(db,chainId,contract,market);
    const rows=await db.query(
      `SELECT o.order_id,o.market,o.status,o.expires_at,b.arrival_sequence
       FROM orders o LEFT JOIN order_book_entries b
         ON b.chain_id=o.chain_id AND b.verifying_contract=o.verifying_contract
        AND b.account=o.account AND b.nonce=o.nonce
       WHERE o.chain_id=$1 AND o.verifying_contract=$2 AND o.account=$3 AND o.nonce=$4
       FOR UPDATE OF o`,[chainId,contract,account,nonce],
    );
    const record=rows.rows[0] as {
      order_id:string;market:string;status:string;expires_at:number|string;
      arrival_sequence:string|null
    }|undefined;
    if(!record || record.market!==market)throw new OrderBookStateError("persisted market changed");
    if(record.arrival_sequence!==null)return {market,arrivalSequence:String(record.arrival_sequence)};
    if(!["OPEN","PARTIALLY_FILLED"].includes(record.status) || Number(record.expires_at)<=nowSeconds)
      throw new OrderBookStateError("terminal or expired order cannot join the book");
    if(last >= (1n<<63n)-1n)throw new OrderBookStateError("market admission sequence exhausted");
    const updated=await db.query(
      `UPDATE order_book_counters SET last_sequence=last_sequence+1
       WHERE chain_id=$1 AND verifying_contract=$2 AND market=$3
       RETURNING last_sequence`,[chainId,contract,market],
    );
    const arrivalSequence=String((updated.rows[0] as {last_sequence:string}).last_sequence);
    await db.query(
      `INSERT INTO order_book_entries
       (chain_id,verifying_contract,market,account,nonce,order_id,arrival_sequence)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [chainId,contract,market,account,nonce,record.order_id,arrivalSequence],
    );
    return {market,arrivalSequence};
  }
}

export async function registerSignedOrderInBook(
  key:StoredOrderKey, trustedDomain:OrderSigningDomainInput,
  transactions:OrderTransactionManager,
  nowSeconds=Math.floor(Date.now()/1000),
):Promise<{market:string;arrivalSequence:string}> {
  return transactions.withTransaction(db => registerSignedOrderInBookWithRunner(key,trustedDomain,db,nowSeconds));
}

export interface MatchCommitResult {
  market:string;
  incoming:BookOrder;
  fills:MatchFill[];
  totalFilled:string;
  remainingQuantity:string;
}

/**
 * Book lock -> order row locks -> pure computation -> guarded order updates ->
 * fill ledger, all in ONE transaction. Never expose as an unauthenticated API.
 * Registered, earlier makers only; distinct accounts exclude direct self-trades.
 */
export async function matchRegisteredOrderWithRunner(
  key:StoredOrderKey,trustedDomain:OrderSigningDomainInput,
  db:SqlRunner,
  nowSeconds=Math.floor(Date.now()/1000),
):Promise<MatchCommitResult> {
  const [chainId,contract,account,nonce]=identity(key,trustedDomain);
  if(!Number.isSafeInteger(nowSeconds) || nowSeconds<0)
    throw new OrderBookStateError("invalid current time");

  // The caller owns the enclosing transaction and its commit/rollback.
  {
    const entry=await db.query(
      `SELECT market FROM order_book_entries
       WHERE chain_id=$1 AND verifying_contract=$2 AND account=$3 AND nonce=$4`,
      [chainId,contract,account,nonce],
    );
    const market=(entry.rows[0] as {market:string}|undefined)?.market;
    if(!market)throw new OrderBookStateError("order not registered in the book");
    await lockMarket(db,chainId,contract,market);

    // Lock all book order rows in stable admission order. A concurrent cancel
    // takes the SAME order row lock, so its status is rechecked after waiting.
    const entries=await db.query(
      `SELECT o.account,o.nonce,o.order_id,o.market,o.side,o.price,
              o.quantity,o.filled_quantity,o.status,o.expires_at,b.arrival_sequence
       FROM order_book_entries b JOIN orders o
         ON o.chain_id=b.chain_id AND o.verifying_contract=b.verifying_contract
        AND o.account=b.account AND o.nonce=b.nonce
       WHERE b.chain_id=$1 AND b.verifying_contract=$2 AND b.market=$3
       ORDER BY b.arrival_sequence ASC FOR UPDATE OF o`,
      [chainId,contract,market],
    );
    const records=entries.rows as Array<Record<string,unknown>>;
    const takerRow=records.find(row=>
      String(row.account)===account && String(row.nonce)===nonce
    );
    if(!takerRow)throw new OrderBookStateError("registered order missing");
    const incoming=rowToBook(takerRow);
    const makers=records.filter(row=>
      row!==takerRow &&
      BigInt(String(row.arrival_sequence))<BigInt(incoming.arrivalSequence) &&
      String(row.account)!==account
    ).map(rowToBook);

    const computed:MatchResult=matchIncomingOrder(incoming,makers,nowSeconds);
    if(computed.fills.length===0) {
      return {market,incoming:computed.incoming,fills:[],totalFilled:"0",
        remainingQuantity:computed.remainingQuantity};
    }

    const originalById=new Map(records.map(row=>[String(row.order_id),row]));
    const changed=[computed.incoming,...computed.resting].filter(current=>{
      const prior=originalById.get(current.orderId)!;
      return String(prior.filled_quantity)!==current.filledQuantity;
    });
    for(const current of changed) {
      const prior=originalById.get(current.orderId)!;
      const update=await db.query(
        `UPDATE orders SET filled_quantity=$1,status=$2,updated_at=NOW()
         WHERE chain_id=$3 AND verifying_contract=$4 AND account=$5 AND nonce=$6
           AND order_id=$7 AND status=$8 AND filled_quantity=$9
         RETURNING nonce`,
        [current.filledQuantity,current.status,chainId,contract,
         String(prior.account),String(prior.nonce),current.orderId,
         String(prior.status),String(prior.filled_quantity)],
      );
      if(update.rows.length!==1)throw new OrderBookStateError("concurrent order state conflict");
    }

    for(const fill of computed.fills) {
      await db.query(
        `INSERT INTO order_fills
         (chain_id,verifying_contract,market,maker_order_id,taker_order_id,
          buy_order_id,sell_order_id,price,quantity)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [chainId,contract,market,fill.makerOrderId,fill.takerOrderId,
         fill.buyOrderId,fill.sellOrderId,fill.price,fill.quantity],
      );
    }
    return {market,incoming:computed.incoming,fills:computed.fills,
      totalFilled:computed.totalFilled,remainingQuantity:computed.remainingQuantity};
  }
}

export async function matchRegisteredOrder(
  key:StoredOrderKey,trustedDomain:OrderSigningDomainInput,
  transactions:OrderTransactionManager,
  nowSeconds=Math.floor(Date.now()/1000),
):Promise<MatchCommitResult> {
  return transactions.withTransaction(db => matchRegisteredOrderWithRunner(key,trustedDomain,db,nowSeconds));
}
