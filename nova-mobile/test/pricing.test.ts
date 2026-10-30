import { describe, expect, it } from 'vitest';

import { cartItemCount, calculatePricing, lineSubtotalCents } from '@/src/lib/pricing';
import type { BuyCoupon, BuyMember, CartItem } from '@/src/lib/types';

/** 与桌面端 pricing.test 同一组用例，金额以分为单位 */
function item(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: 'p1',
    sku: 'DB-2026-1088-M',
    styleNo: 'DB-2026-1088',
    name: '法式收腰连衣裙',
    color: '黑色',
    size: 'M',
    priceCents: 10000,
    qty: 1,
    discount: 10,
    ...overrides,
  };
}

function member(overrides: Partial<BuyMember> = {}): BuyMember {
  return {
    id: 'm1',
    name: '陈女士',
    phone: '13812346688',
    level: 'gold',
    points: 2680,
    balance: 860,
    coupons: [],
    ...overrides,
  };
}

const FULL_COUPON: BuyCoupon = {
  id: 'c1',
  name: '满 500 减 80',
  threshold: 500,
  amount: 80,
  expiresAt: '2026-11-30',
};

const baseOptions = {
  member: null,
  coupon: null,
  storeCoupon: null,
  usePoints: false,
  useBalance: false,
};

describe('lineSubtotalCents / cartItemCount', () => {
  it('单行小计 = 吊牌价 × 数量 × 折扣', () => {
    expect(lineSubtotalCents(item({ priceCents: 39900, qty: 1, discount: 6 }))).toBe(23940);
    expect(lineSubtotalCents(item({ priceCents: 45900, qty: 2, discount: 6 }))).toBe(55080);
    expect(lineSubtotalCents(item({ priceCents: 29900, qty: 1, discount: 10 }))).toBe(29900);
  });

  it('件数按数量累加', () => {
    expect(cartItemCount([item({ qty: 1 }), item({ qty: 2 })])).toBe(3);
  });
});

describe('calculatePricing', () => {
  it('无会员、无券时按商品折扣结算', () => {
    const result = calculatePricing([item({ priceCents: 20000, qty: 2, discount: 8 })], baseOptions);

    expect(result.itemCount).toBe(2);
    expect(result.originalCents).toBe(40000);
    expect(result.lineDiscountCents).toBe(8000);
    expect(result.couponDiscountCents).toBe(0);
    expect(result.payableCents).toBe(32000);
    expect(result.totalDiscountCents).toBe(8000);
  });

  it('折后金额未达券门槛时不抵扣', () => {
    const result = calculatePricing([item({ priceCents: 50000, discount: 9 })], {
      ...baseOptions,
      coupon: FULL_COUPON,
    });

    expect(result.couponDiscountCents).toBe(0);
    expect(result.payableCents).toBe(45000);
  });

  it('折后金额达门槛时按券面额抵扣', () => {
    const result = calculatePricing([item({ priceCents: 100000, discount: 8 })], {
      ...baseOptions,
      coupon: FULL_COUPON,
    });

    expect(result.couponDiscountCents).toBe(8000);
    expect(result.payableCents).toBe(72000);
  });

  it('券面额大于折后金额时封顶到金额本身', () => {
    const result = calculatePricing([item({ priceCents: 52000, discount: 10 })], {
      ...baseOptions,
      coupon: FULL_COUPON,
    });

    expect(result.couponDiscountCents).toBe(8000);
    expect(result.payableCents).toBe(44000);
  });

  it('店铺券在会员券之后抵扣', () => {
    const result = calculatePricing([item({ priceCents: 100000 })], {
      ...baseOptions,
      coupon: FULL_COUPON,
      storeCoupon: { id: 's1', name: '满 200 减 20', threshold: 200, amount: 20, expiresAt: '' },
    });

    expect(result.couponDiscountCents).toBe(8000);
    expect(result.storeCouponDiscountCents).toBe(2000);
    expect(result.payableCents).toBe(90000);
  });

  it('100 积分抵 ¥1，按可用积分封顶抵扣', () => {
    const result = calculatePricing([item({ priceCents: 10000 })], {
      ...baseOptions,
      member: member(),
      usePoints: true,
    });

    expect(result.pointsUsed).toBe(2680);
    expect(result.pointsDeductionCents).toBe(2680);
    expect(result.balanceDeductionCents).toBe(0);
    expect(result.payableCents).toBe(7320);
  });

  it('积分不足时按可用积分抵扣，余额兜底', () => {
    const result = calculatePricing([item({ priceCents: 10000 })], {
      ...baseOptions,
      member: member({ points: 100, balance: 5 }),
      usePoints: true,
      useBalance: true,
    });

    expect(result.pointsUsed).toBe(100);
    expect(result.pointsDeductionCents).toBe(100);
    expect(result.balanceDeductionCents).toBe(500);
    expect(result.payableCents).toBe(9400);
  });

  it('积分不会超额抵扣', () => {
    const result = calculatePricing([item({ priceCents: 1001 })], {
      ...baseOptions,
      member: member({ points: 1000, balance: 0 }),
      usePoints: true,
    });

    expect(result.pointsUsed).toBe(1000);
    expect(result.payableCents).toBe(1);
  });

  it('余额不足时只扣可用余额，不透支', () => {
    const result = calculatePricing([item({ priceCents: 10000 })], {
      ...baseOptions,
      member: member({ points: 0, balance: 30 }),
      useBalance: true,
    });

    expect(result.balanceDeductionCents).toBe(3000);
    expect(result.payableCents).toBe(7000);
  });

  it('关闭积分与余额开关后不使用权益', () => {
    const result = calculatePricing([item({ priceCents: 10000 })], {
      ...baseOptions,
      member: member(),
    });

    expect(result.pointsUsed).toBe(0);
    expect(result.payableCents).toBe(10000);
  });

  it('权益叠加后应收为 0，且不产生负数', () => {
    const result = calculatePricing([item({ priceCents: 39900, discount: 6 }), item({ priceCents: 10000 })], {
      ...baseOptions,
      member: member({ points: 100000, balance: 100000 }),
      coupon: FULL_COUPON,
      usePoints: true,
      useBalance: true,
    });

    expect(result.payableCents).toBe(0);
    expect(result.totalDiscountCents).toBe(result.originalCents);
  });

  it('对齐买单页初始清单：折扣 → 券 → 积分 → 余额', () => {
    const cart = [
      item({ priceCents: 39900, qty: 1, discount: 6 }),
      item({ priceCents: 45900, qty: 2, discount: 6 }),
      item({ priceCents: 29900, qty: 1, discount: 6 }),
    ];
    const coupon: BuyCoupon = {
      id: 'c0',
      name: '满 800 减 60',
      threshold: 800,
      amount: 60,
      expiresAt: '2026-12-31',
    };

    const result = calculatePricing(cart, {
      ...baseOptions,
      member: member(),
      coupon,
      usePoints: true,
      useBalance: true,
    });

    expect(result.itemCount).toBe(4);
    expect(result.originalCents).toBe(161600);
    expect(result.lineDiscountCents).toBe(64640);
    expect(result.couponDiscountCents).toBe(6000);
    expect(result.pointsUsed).toBe(2680);
    expect(result.balanceDeductionCents).toBe(86000);
    expect(result.payableCents).toBe(2280);
    expect(result.totalDiscountCents).toBe(159320);
  });
});
