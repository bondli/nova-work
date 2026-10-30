import assert from 'node:assert/strict';

import { calculateOrderItemPrices } from '../service/orderPricing';

const buyResult = calculateOrderItemPrices({
  items: [
    { originalPrice: 100, counts: 1 },
    { originalPrice: 150, counts: 2 },
  ],
  orderActualAmount: 200,
  useBalance: 20,
});

assert.equal(buyResult.originalAmount, 400);
assert.equal(buyResult.orderAmount, 240);
assert.equal(buyResult.negotiatedAmount, 220);
assert.equal(buyResult.items[0].actualPrice, 55);
assert.equal(buyResult.items[0].discount, 0.55);
assert.equal(buyResult.items[1].actualPrice, 82.5);
assert.equal(buyResult.items[1].discount, 0.55);

const giftResult = calculateOrderItemPrices({
  items: [
    { originalPrice: 100, counts: 1 },
    { originalPrice: 200, counts: 1, isGived: true },
  ],
  orderActualAmount: 60,
  useBalance: 0,
});

assert.equal(giftResult.originalAmount, 300);
assert.equal(giftResult.orderAmount, 60);
assert.equal(giftResult.items[1].actualPrice, 0);
assert.equal(giftResult.items[1].discount, 0);

const legacyGiftResult = calculateOrderItemPrices({
  items: [
    { originalPrice: 100, counts: 1, actualPrice: 60 },
    { originalPrice: 200, counts: 1, actualPrice: 0 },
  ],
  orderActualAmount: 60,
  useBalance: 0,
});

assert.equal(legacyGiftResult.originalAmount, 300);
assert.equal(legacyGiftResult.orderAmount, 60);
assert.equal(legacyGiftResult.items[1].actualPrice, 0);
assert.equal(legacyGiftResult.items[1].discount, 0);

const recalculatedResult = calculateOrderItemPrices({
  items: [
    { originalPrice: 100, counts: 0 },
    { originalPrice: 150, counts: 2 },
  ].filter((item) => item.counts > 0),
  orderActualAmount: 160,
  useBalance: 20,
});

assert.equal(recalculatedResult.originalAmount, 300);
assert.equal(recalculatedResult.orderAmount, 180);
assert.equal(recalculatedResult.items[0].actualPrice, 90);
assert.equal(recalculatedResult.items[0].discount, 0.6);

const exchangeResult = calculateOrderItemPrices({
  items: [
    { originalPrice: 100, counts: 0 },
    { originalPrice: 150, counts: 2 },
    { originalPrice: 200, counts: 1 },
  ].filter((item) => item.counts > 0),
  orderActualAmount: 280,
  useBalance: 20,
});

assert.equal(exchangeResult.originalAmount, 500);
assert.equal(exchangeResult.orderAmount, 300);
assert.equal(exchangeResult.items[0].actualPrice, 90);
assert.equal(exchangeResult.items[1].actualPrice, 120);

const refundResult = calculateOrderItemPrices({
  items: [
    { originalPrice: 100, counts: 1 },
    { originalPrice: 150, counts: 0 },
  ].filter((item) => item.counts > 0),
  orderActualAmount: 50,
  useBalance: 10,
});

assert.equal(refundResult.originalAmount, 100);
assert.equal(refundResult.orderAmount, 60);
assert.equal(refundResult.items[0].actualPrice, 60);
assert.equal(refundResult.items[0].discount, 0.6);

const modifyResult = calculateOrderItemPrices({
  items: [
    { originalPrice: 100, counts: 1 },
    { originalPrice: 150, counts: 2 },
  ],
  orderActualAmount: 180,
  useBalance: 0,
});

assert.equal(modifyResult.originalAmount, 400);
assert.equal(modifyResult.orderAmount, 240);
assert.equal(modifyResult.items[0].actualPrice, 45);
assert.equal(modifyResult.items[0].discount, 0.45);
assert.equal(modifyResult.items[1].actualPrice, 67.5);
assert.equal(modifyResult.items[1].discount, 0.45);
