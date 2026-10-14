import assert from "node:assert/strict";
import test from "node:test";

import {
  OrderValidationError,
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
