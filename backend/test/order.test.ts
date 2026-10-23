import assert from "node:assert/strict";
import test from "node:test";

import {
  OrderStateTransitionError,
  OrderValidationError,
  canTransitionOrderStatus,
  canonicalOrderPayload,
  createDeterministicOrderId,
  transitionOrderStatus,
  validateCreateOrder,
} from "../src/orders/order.ts";

const NOW = 2_000_000_000;

function validOrder() {
  return {
    account: "0xAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    market: "eth-usdc",
    side: "buy",
    price: "2500000000",
    quantity: "1000000000000000000",
    nonce: "0",
    expiresAt: NOW + 300,
  };
}

test("valid order input is normalized without number precision loss", () => {
  const order = validateCreateOrder(validOrder(), NOW);

  assert.deepEqual(order, {
    account: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    market: "ETH-USDC",
    side: "BUY",
    price: "2500000000",
    quantity: "1000000000000000000",
    nonce: "0",
    expiresAt: NOW + 300,
  });
  assert.equal(Object.isFrozen(order), true);
});

test("invalid runtime order fields are rejected with their field name", () => {
  const cases: Array<[keyof ReturnType<typeof validOrder>, unknown]> = [
    ["account", "0x0000000000000000000000000000000000000000"],
    ["account", "not-an-address"],
    ["market", "ETH USDC"],
    ["side", "HOLD"],
    ["price", "0"],
    ["price", "1.5"],
    ["quantity", "0"],
    ["nonce", "-1"],
    ["expiresAt", NOW],
  ];

  for (const [field, invalidValue] of cases) {
    const input = { ...validOrder(), [field]: invalidValue };

    assert.throws(
      () => validateCreateOrder(input, NOW),
      (error: unknown) =>
        error instanceof OrderValidationError && error.field === field,
      `expected ${field} to be rejected`,
    );
  }
});

test("arbitrarily large integer strings remain exact", () => {
  const huge = "340282366920938463463374607431768211455";
  const order = validateCreateOrder(
    {
      ...validOrder(),
      price: huge,
      quantity: huge,
      nonce: huge,
    },
    NOW,
  );

  assert.equal(order.price, huge);
  assert.equal(order.quantity, huge);
  assert.equal(order.nonce, huge);
});

test("order status allows only forward lifecycle transitions", () => {
  const allowed = [
    ["OPEN", "PARTIALLY_FILLED"],
    ["OPEN", "FILLED"],
    ["OPEN", "CANCELED"],
    ["OPEN", "EXPIRED"],
    ["PARTIALLY_FILLED", "FILLED"],
    ["PARTIALLY_FILLED", "CANCELED"],
    ["PARTIALLY_FILLED", "EXPIRED"],
  ] as const;

  for (const [from, to] of allowed) {
    assert.equal(canTransitionOrderStatus(from, to), true);
    assert.equal(transitionOrderStatus(from, to), to);
  }
});

test("terminal and backward order status transitions are rejected", () => {
  const rejected = [
    ["OPEN", "OPEN"],
    ["PARTIALLY_FILLED", "OPEN"],
    ["PARTIALLY_FILLED", "PARTIALLY_FILLED"],
    ["FILLED", "OPEN"],
    ["FILLED", "CANCELED"],
    ["CANCELED", "OPEN"],
    ["EXPIRED", "OPEN"],
  ] as const;

  for (const [from, to] of rejected) {
    assert.equal(canTransitionOrderStatus(from, to), false);
    assert.throws(
      () => transitionOrderStatus(from, to),
      (error: unknown) =>
        error instanceof OrderStateTransitionError &&
        error.from === from &&
        error.to === to,
      `expected ${from} -> ${to} to be rejected`,
    );
  }
});

test("canonical payload uses normalized values and fixed field order", () => {
  const order = validateCreateOrder(validOrder(), NOW);

  assert.equal(
    canonicalOrderPayload(order),
    "perpdex-order-v1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:ETH-USDC:BUY:2500000000:1000000000000000000:0:2000000300",
  );
});

test("deterministic order ID is stable and changes with canonical fields", () => {
  const order = validateCreateOrder(validOrder(), NOW);
  const sameOrder = validateCreateOrder({ ...validOrder() }, NOW);
  const nextNonce = validateCreateOrder({ ...validOrder(), nonce: "1" }, NOW);

  const orderId = createDeterministicOrderId(order);
  assert.match(orderId, /^0x[0-9a-f]{64}$/);
  assert.equal(orderId, createDeterministicOrderId(sameOrder));
  assert.notEqual(orderId, createDeterministicOrderId(nextNonce));
});

test("runtime validation rejects unsafe timestamps and malformed field types", () => {
  const cases: Array<[keyof ReturnType<typeof validOrder>, unknown]> = [
    ["account", null],
    ["market", "A".repeat(33)],
    ["side", 1],
    ["price", 1],
    ["quantity", "01"],
    ["nonce", "1e3"],
    ["expiresAt", NOW - 1],
    ["expiresAt", NOW + 0.5],
    ["expiresAt", Number.MAX_SAFE_INTEGER + 1],
  ];

  for (const [field, invalidValue] of cases) {
    assert.throws(
      () => validateCreateOrder({ ...validOrder(), [field]: invalidValue }, NOW),
      (error: unknown) =>
        error instanceof OrderValidationError && error.field === field,
      `expected invalid ${field} to be rejected`,
    );
  }

  assert.throws(
    () => validateCreateOrder(null, NOW),
    (error: unknown) =>
      error instanceof OrderValidationError && error.field === "account",
  );
  assert.equal(validateCreateOrder({ ...validOrder(), expiresAt: NOW + 1 }, NOW).expiresAt, NOW + 1);
});

test("deterministic order ID changes when any canonical identity field changes", () => {
  const base = validOrder();
  const baseId = createDeterministicOrderId(validateCreateOrder(base, NOW));
  const variants = [
    { account: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
    { market: "BTC-USDC" },
    { side: "SELL" },
    { price: "2500000001" },
    { quantity: "1000000000000000001" },
    { nonce: "1" },
    { expiresAt: NOW + 301 },
  ];

  for (const variant of variants) {
    const order = validateCreateOrder({ ...base, ...variant }, NOW);
    assert.notEqual(
      createDeterministicOrderId(order),
      baseId,
      `expected distinct ID for ${Object.keys(variant)[0]}`,
    );
  }

  const normalized = validateCreateOrder({ ...base, account: base.account.toLowerCase(), market: "ETH-USDC", side: "BUY" }, NOW);
  assert.equal(createDeterministicOrderId(normalized), baseId);
});
