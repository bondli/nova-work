import { describe, expect, it } from 'vitest'
import type { BuyCoupon, BuyMember, CartItem } from '@shared/types/buy'
import { calculatePricing, cartItemCount, lineSubtotal, roundMoney } from './pricing'

/** 构造购物车项，默认六折 */
function item(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id: 'p1',
    name: '法式收腰连衣裙',
    styleNo: 'DB-2026-1088',
    sku: 'DB-2026-1088-M',
    spec: '黑色 / M',
    price: 100,
    qty: 1,
    discount: 10,
    colorHex: '#18181b',
    ...overrides
  }
}

/** 构造会员，默认金卡 2680 分 / ¥860 */
function member(overrides: Partial<BuyMember> = {}): BuyMember {
  return {
    id: 'm1',
    name: '陈女士',
    phone: '13812346688',
    level: 'gold',
    points: 2680,
    balance: 860,
    lastVisit: '10/18',
    coupons: [],
    ...overrides
  }
}

const FULL_COUPON: BuyCoupon = {
  id: 'c1',
  name: '满 500 减 80',
  threshold: 500,
  amount: 80,
  expiresAt: '2026-11-30'
}

describe('roundMoney / lineSubtotal', () => {
  it('两位小数四舍五入，规避浮点尾差', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3)
    expect(roundMoney(239.399999)).toBe(239.4)
  })

  it('单行小计 = 吊牌价 × 数量 × 折扣', () => {
    expect(lineSubtotal(item({ price: 399, qty: 1, discount: 6 }))).toBe(239.4)
    expect(lineSubtotal(item({ price: 459, qty: 2, discount: 6 }))).toBe(550.8)
    expect(lineSubtotal(item({ price: 299, qty: 1, discount: 10 }))).toBe(299)
  })

  it('件数按数量累加', () => {
    expect(cartItemCount([item({ qty: 1 }), item({ qty: 2 })])).toBe(3)
  })
})

describe('calculatePricing', () => {
  it('无会员、无券时按商品折扣结算', () => {
    const result = calculatePricing([item({ price: 200, qty: 2, discount: 8 })], {
      member: null,
      coupon: null,
      usePoints: true,
      useBalance: true
    })

    expect(result.itemCount).toBe(2)
    expect(result.originalTotal).toBe(400)
    expect(result.lineDiscount).toBe(80)
    expect(result.couponDiscount).toBe(0)
    expect(result.payable).toBe(320)
    expect(result.totalDiscount).toBe(80)
  })

  it('折后金额未达券门槛时不抵扣', () => {
    const result = calculatePricing([item({ price: 500, discount: 9 })], {
      member: null,
      coupon: FULL_COUPON,
      usePoints: false,
      useBalance: false
    })

    expect(result.couponDiscount).toBe(0)
    expect(result.payable).toBe(450)
  })

  it('折后金额达门槛时按券面额抵扣', () => {
    const result = calculatePricing([item({ price: 1000, discount: 8 })], {
      member: null,
      coupon: FULL_COUPON,
      usePoints: false,
      useBalance: false
    })

    expect(result.couponDiscount).toBe(80)
    expect(result.payable).toBe(720)
  })

  it('券面额大于折后金额时封顶到金额本身', () => {
    const result = calculatePricing([item({ price: 520, discount: 10 })], {
      member: null,
      coupon: FULL_COUPON,
      usePoints: false,
      useBalance: false
    })

    expect(result.couponDiscount).toBe(80)
    expect(result.payable).toBe(440)
  })

  it('100 积分抵 ¥1，按可用积分封顶抵扣', () => {
    const result = calculatePricing([item({ price: 100, discount: 10 })], {
      member: member(),
      coupon: null,
      usePoints: true,
      useBalance: false
    })

    expect(result.pointsUsed).toBe(2680)
    expect(result.pointsDeduction).toBe(26.8)
    expect(result.balanceDeduction).toBe(0)
    expect(result.payable).toBe(73.2)
  })

  it('积分不足时按可用积分抵扣，余额兜底', () => {
    const result = calculatePricing([item({ price: 100, discount: 10 })], {
      member: member({ points: 100, balance: 5 }),
      coupon: null,
      usePoints: true,
      useBalance: true
    })

    expect(result.pointsUsed).toBe(100)
    expect(result.pointsDeduction).toBe(1)
    expect(result.balanceDeduction).toBe(5)
    expect(result.payable).toBe(94)
  })

  it('积分向下取整，不产生超额抵扣', () => {
    const result = calculatePricing([item({ price: 10.01, discount: 10 })], {
      member: member({ points: 1000, balance: 0 }),
      coupon: null,
      usePoints: true,
      useBalance: false
    })

    // 10.01 元最多抵 1001 分，1000 分 = ¥10
    expect(result.pointsUsed).toBe(1000)
    expect(result.pointsDeduction).toBe(10)
    expect(result.payable).toBe(0.01)
  })

  it('余额不足时只扣可用余额，不透支', () => {
    const result = calculatePricing([item({ price: 100, discount: 10 })], {
      member: member({ points: 0, balance: 30 }),
      coupon: null,
      usePoints: false,
      useBalance: true
    })

    expect(result.balanceDeduction).toBe(30)
    expect(result.payable).toBe(70)
  })

  it('关闭积分与余额开关后不使用权益', () => {
    const result = calculatePricing([item({ price: 100, discount: 10 })], {
      member: member(),
      coupon: null,
      usePoints: false,
      useBalance: false
    })

    expect(result.pointsUsed).toBe(0)
    expect(result.pointsDeduction).toBe(0)
    expect(result.balanceDeduction).toBe(0)
    expect(result.payable).toBe(100)
  })

  it('权益叠加后应收为 0，且不产生负数', () => {
    const result = calculatePricing(
      [item({ price: 399, discount: 6 }), item({ price: 100, discount: 10 })],
      {
        member: member({ points: 100000, balance: 100000 }),
        coupon: FULL_COUPON,
        usePoints: true,
        useBalance: true
      }
    )

    expect(result.payable).toBe(0)
    expect(result.totalDiscount).toBe(result.originalTotal)
  })

  it('对齐买单页初始清单：折扣 → 券 → 积分 → 余额', () => {
    const cart = [
      item({ price: 399, qty: 1, discount: 6 }),
      item({ price: 459, qty: 2, discount: 6 }),
      item({ price: 299, qty: 1, discount: 6 })
    ]
    const coupon: BuyCoupon = {
      id: 'c0',
      name: '满 800 减 60',
      threshold: 800,
      amount: 60,
      expiresAt: '2026-12-31'
    }

    const result = calculatePricing(cart, {
      member: member(),
      coupon,
      usePoints: true,
      useBalance: true
    })

    expect(result.itemCount).toBe(4)
    expect(result.originalTotal).toBe(1616)
    expect(result.lineDiscount).toBe(646.4)
    expect(result.couponDiscount).toBe(60)
    expect(result.pointsUsed).toBe(2680)
    expect(result.pointsDeduction).toBe(26.8)
    expect(result.balanceDeduction).toBe(860)
    expect(result.payable).toBe(22.8)
    expect(result.totalDiscount).toBe(1593.2)
  })
})
