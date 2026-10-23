import { getAddress, isHex, recoverTypedDataAddress, size } from "viem";
import type { Address, Hex } from "viem";
import { validateCreateOrder } from "./order.ts";
import type { CreateOrderInput, OrderInput } from "./order.ts";

export interface OrderSigningDomainInput {
  chainId: number;
  verifyingContract: string;
}

export class OrderSigningDomainError extends Error {
  readonly field: "chainId" | "verifyingContract";
  constructor(field: "chainId" | "verifyingContract", message: string) {
    super(`${field}: ${message}`);
    this.name = "OrderSigningDomainError";
    this.field = field;
  }
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_UINT256 = (1n << 256n) - 1n;

// This schema is a public signature contract. Changing a type/name/order requires versioning.
// EIP-712 side encoding: BUY=0, SELL=1.
export const ORDER_EIP712_TYPES = {
  Order: [
    { name: "account", type: "address" },
    { name: "market", type: "string" },
    { name: "side", type: "uint8" },
    { name: "price", type: "uint256" },
    { name: "quantity", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "expiresAt", type: "uint256" },
  ],
} as const;

function validatedVerifyingContract(value: unknown): Address {
  if (typeof value !== "string") {
    throw new OrderSigningDomainError("verifyingContract", "EVM address required");
  }
  let contract: Address;
  try {
    contract = getAddress(value);
  } catch {
    throw new OrderSigningDomainError("verifyingContract", "valid checksum-compatible EVM address required");
  }
  if (contract.toLowerCase() === ZERO_ADDRESS) {
    throw new OrderSigningDomainError("verifyingContract", "zero address cannot verify signatures");
  }
  return contract;
}

export function validateOrderSigningDomain(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OrderSigningDomainError("chainId", "signing domain required");
  }
  const input = value as Record<string, unknown>;
  if (!Number.isSafeInteger(input.chainId) || (input.chainId as number) <= 0) {
    throw new OrderSigningDomainError("chainId", "positive safe integer required");
  }
  return Object.freeze({
    name: "PerpDEX" as const,
    version: "1" as const,
    chainId: input.chainId as number,
    verifyingContract: validatedVerifyingContract(input.verifyingContract),
  });
}

function asUint256(value: string, field: "price" | "quantity" | "nonce"): bigint {
  const number = BigInt(value);
  if (number > MAX_UINT256) {
    throw new RangeError(`${field}: uint256 overflow`);
  }
  return number;
}

/**
 * Provides the canonical typed data signed by EOA wallets.
 * The API layer MUST supply chainId/verifyingContract from trusted server configuration,
 * never from a request-supplied domain.
 */
export function buildOrderTypedData(
  input: unknown,
  domainInput: OrderSigningDomainInput,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const order: OrderInput = validateCreateOrder(input, nowSeconds);
  const domain = validateOrderSigningDomain(domainInput);

  return {
    domain,
    types: ORDER_EIP712_TYPES,
    primaryType: "Order" as const,
    message: {
      account: getAddress(order.account),
      market: order.market,
      side: order.side === "BUY" ? 0 : 1,
      price: asUint256(order.price, "price"),
      quantity: asUint256(order.quantity, "quantity"),
      nonce: asUint256(order.nonce, "nonce"),
      expiresAt: BigInt(order.expiresAt),
    },
  };
}

/**
 * Validates EOA signatures only. Smart contract wallets (ERC-1271) are not supported here.
 * Replay protection requires a separate atomic, persistent nonce consumer in M2-T2.
 */
export async function verifyOrderSignature(
  input: CreateOrderInput,
  domainInput: OrderSigningDomainInput,
  signature: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const typed = buildOrderTypedData(input, domainInput, nowSeconds);
  if (typeof signature !== "string" || !isHex(signature)) return false;
  const signatureBytes = size(signature as Hex);
  if (signatureBytes !== 65 && signatureBytes !== 64) return false;
  try {
    const recovered = await recoverTypedDataAddress({
      ...typed,
      signature: signature as Hex,
    });
    return recovered.toLowerCase() === typed.message.account.toLowerCase();
  } catch {
    return false;
  }
}
