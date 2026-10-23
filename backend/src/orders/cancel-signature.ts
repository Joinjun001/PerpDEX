import { getAddress, isHex, recoverTypedDataAddress, size } from "viem";
import type { Hex } from "viem";
import { validateOrderSigningDomain } from "./signature.ts";
import type { OrderSigningDomainInput } from "./signature.ts";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_UINT256 = (1n << 256n) - 1n;
const DECIMAL = /^(0|[1-9][0-9]*)$/;

/**
 * Cancellation is an independent EIP-712 message; an order signature cannot
 * authorize a cancel request. Domain is supplied by trusted server config.
 */
export const ORDER_CANCEL_EIP712_TYPES = {
  CancelOrder: [
    { name: "account", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export interface CancelOrderInput {
  account: string;
  nonce: string;
  deadline: number;
}

export class CancelValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CancelValidationError";
  }
}

export class InvalidCancelSignatureError extends Error {
  constructor() {
    super("invalid EIP-712 cancel signature");
    this.name = "InvalidCancelSignatureError";
  }
}

export function validateCancelOrder(
  raw: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
): CancelOrderInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new CancelValidationError("cancel request must be an object");
  }
  const value = raw as Record<string, unknown>;
  if (typeof value.account !== "string") {
    throw new CancelValidationError("account must be an EVM address");
  }
  let account: string;
  try {
    account = getAddress(value.account).toLowerCase();
  } catch {
    throw new CancelValidationError("invalid EVM account");
  }
  if (account === ZERO_ADDRESS) throw new CancelValidationError("zero account is not allowed");
  if (typeof value.nonce !== "string" || !DECIMAL.test(value.nonce) ||
      BigInt(value.nonce) > MAX_UINT256) {
    throw new CancelValidationError("nonce must be a canonical uint256 decimal string");
  }
  if (!Number.isSafeInteger(nowSeconds) ||
      !Number.isSafeInteger(value.deadline) ||
      (value.deadline as number) <= nowSeconds) {
    throw new CancelValidationError("deadline must be a future safe integer Unix timestamp");
  }
  return Object.freeze({
    account,
    nonce: value.nonce,
    deadline: value.deadline as number,
  });
}

export function buildCancelTypedData(
  raw: unknown,
  trustedDomain: OrderSigningDomainInput,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const cancel = validateCancelOrder(raw, nowSeconds);
  return {
    domain: validateOrderSigningDomain(trustedDomain),
    types: ORDER_CANCEL_EIP712_TYPES,
    primaryType: "CancelOrder" as const,
    message: {
      account: getAddress(cancel.account),
      nonce: BigInt(cancel.nonce),
      deadline: BigInt(cancel.deadline),
    },
  };
}

export async function verifyCancelSignature(
  raw: CancelOrderInput,
  trustedDomain: OrderSigningDomainInput,
  signature: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const typed = buildCancelTypedData(raw, trustedDomain, nowSeconds);
  if (typeof signature !== "string" || !isHex(signature)) return false;
  const length = size(signature as Hex);
  if (length !== 64 && length !== 65) return false;
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
