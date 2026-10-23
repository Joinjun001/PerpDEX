import test from "node:test";
import assert from "node:assert/strict";
import { hashTypedData } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { OrderValidationError } from "../src/orders/order.ts";
import {
  OrderSigningDomainError,
  buildOrderTypedData,
  verifyOrderSignature,
  validateOrderSigningDomain,
} from "../src/orders/signature.ts";

const NOW = 1_800_000_000;
const CONTRACT = "0x1111111111111111111111111111111111111111";
const OTHER_CONTRACT = "0x2222222222222222222222222222222222222222";
const DOMAIN = { chainId: 11155111, verifyingContract: CONTRACT };

// All wallets below are ephemeral process-local test accounts. Never real funds or user credentials.
function fixture() {
  const account = privateKeyToAccount(generatePrivateKey());
  const order = {
    account: account.address,
    market: "ETH-USDC",
    side: "BUY",
    price: "2500000000",
    quantity: "1000000000000000000",
    nonce: "43",
    expiresAt: NOW + 3600,
  };
  return { account, order };
}

test("EIP-712 schema has stable domain and signed uint256/side fields", () => {
  const { order } = fixture();
  const typed = buildOrderTypedData(order, DOMAIN, NOW);
  assert.equal(typed.domain.name, "PerpDEX");
  assert.equal(typed.domain.version, "1");
  assert.equal(typed.domain.chainId, 11155111);
  assert.equal(typed.primaryType, "Order");
  assert.equal(typed.message.price, 2500000000n);
  assert.equal(typed.message.quantity, 1000000000000000000n);
  assert.equal(typed.message.side, 0);
  assert.equal(typed.message.nonce, 43n);
  assert.equal(typed.message.expiresAt, BigInt(NOW + 3600));
  assert.equal(typed.types.Order.length, 7);
  assert.equal(buildOrderTypedData({ ...order, side: "SELL" }, DOMAIN, NOW).message.side, 1);
});

test("EOA signed order verifies and unsigned payload mutations fail", async () => {
  const { account, order } = fixture();
  const typed = buildOrderTypedData(order, DOMAIN, NOW);
  const sig = await account.signTypedData(typed);
  assert.equal(await verifyOrderSignature(order, DOMAIN, sig, NOW), true);

  for (const changed of [
    { ...order, market: "BTC-USDC" },
    { ...order, price: "2500000001" },
    { ...order, quantity: "1000000000000000001" },
    { ...order, side: "SELL" },
    { ...order, nonce: "44" },
    { ...order, expiresAt: NOW + 3601 },
  ]) {
    assert.equal(await verifyOrderSignature(changed, DOMAIN, sig, NOW), false);
  }
});

test("chain ID, verifying contract and owner account are signed", async () => {
  const { account, order } = fixture();
  const sig = await account.signTypedData(buildOrderTypedData(order, DOMAIN, NOW));
  assert.equal(await verifyOrderSignature(order, { ...DOMAIN, chainId: 1 }, sig, NOW), false);
  assert.equal(await verifyOrderSignature(order, { ...DOMAIN, verifyingContract: OTHER_CONTRACT }, sig, NOW), false);
  const other = privateKeyToAccount(generatePrivateKey());
  assert.equal(await verifyOrderSignature({ ...order, account: other.address }, DOMAIN, sig, NOW), false);
});

test("invalid signatures and wrong signer fail", async () => {
  const { order } = fixture();
  const another = privateKeyToAccount(generatePrivateKey());
  const sig = await another.signTypedData(buildOrderTypedData(order, DOMAIN, NOW));
  assert.equal(await verifyOrderSignature(order, DOMAIN, sig, NOW), false);
  assert.equal(await verifyOrderSignature(order, DOMAIN, "invalid", NOW), false);
  assert.equal(await verifyOrderSignature(order, DOMAIN, "0xabcd", NOW), false);
  assert.equal(await verifyOrderSignature(order, DOMAIN, null, NOW), false);
});

test("expired orders are rejected before signature recovery", async () => {
  const { order } = fixture();
  await assert.rejects(
    verifyOrderSignature({ ...order, expiresAt: NOW }, DOMAIN, "0xdead", NOW),
    (e: unknown) => e instanceof OrderValidationError && e.field === "expiresAt",
  );
});

test("domain validation rejects invalid chain IDs, addresses and zero address", () => {
  for (const chainId of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1"]) {
    assert.throws(() => validateOrderSigningDomain({ ...DOMAIN, chainId }), OrderSigningDomainError);
  }
  for (const verifyingContract of ["nonsense", CONTRACT.slice(0, -2), "0x0000000000000000000000000000000000000000", null]) {
    assert.throws(() => validateOrderSigningDomain({ ...DOMAIN, verifyingContract }), OrderSigningDomainError);
  }
});

test("values beyond uint256 are rejected before hashing", () => {
  const { order } = fixture();
  const invalid = { ...order, price: (1n << 256n).toString() };
  assert.throws(() => buildOrderTypedData(invalid, DOMAIN, NOW), /uint256 overflow/);
});

test("typed data normalizes case before hashing but changes with domain", () => {
  const { order } = fixture();
  const first = buildOrderTypedData(order, DOMAIN, NOW);
  const normalized = buildOrderTypedData({ ...order, market: "eth-usdc", account: order.account.toLowerCase() }, DOMAIN, NOW);
  assert.equal(hashTypedData(first), hashTypedData(normalized));
  assert.notEqual(hashTypedData(first), hashTypedData(buildOrderTypedData(order, { ...DOMAIN, chainId: 1 }, NOW)));
});
