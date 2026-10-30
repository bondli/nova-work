import type { BuyCoupon, BuyMember, CartItem, PricingResult } from '@shared/types/buy'

/** 金额统一保留两位小数，避免浮点误差累积 */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** 单行小计：吊牌价 × 数量 × 折扣率 */
export function lineSubtotal(item: CartItem): number {
  return roundMoney((item.price * item.qty * item.discount) / 10)
}

/** 商品件数 */
export function cartItemCount(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.qty, 0)
}

export interface PricingOptions {
  member: BuyMember | null
  coupon: BuyCoupon | null
  /** 店铺优惠券，可缺省 */
  storeCoupon?: BuyCoupon | null
  /** 积分抵扣开关 */
  usePoints: boolean
  /** 余额抵扣开关 */
  useBalance: boolean
}

/**
 * 收款金额计算（规则沿用旧实现）：
 * 商品折扣 → 会员券 → 店铺券 → 积分（100 分抵 ¥1）→ 余额，逐层扣减且不透支。
 */
export function calculatePricing(cart: CartItem[], options: PricingOptions): PricingResult {
  const itemCount = cartItemCount(cart)
  const originalTotal = roundMoney(cart.reduce((sum, item) => sum + item.price * item.qty, 0))
  const discountedTotal = roundMoney(cart.reduce((sum, item) => sum + lineSubtotal(item), 0))
  const lineDiscount = roundMoney(originalTotal - discountedTotal)

  const couponDiscount =
    options.coupon && discountedTotal >= options.coupon.threshold
      ? roundMoney(Math.min(options.coupon.amount, discountedTotal))
      : 0

  const afterCoupon = roundMoney(Math.max(0, discountedTotal - couponDiscount))
  const storeCouponDiscount =
    options.storeCoupon && afterCoupon >= options.storeCoupon.threshold
      ? roundMoney(Math.min(options.storeCoupon.amount, afterCoupon))
      : 0

  let remaining = roundMoney(Math.max(0, afterCoupon - storeCouponDiscount))
  let pointsDeduction = 0
  let pointsUsed = 0

  if (options.usePoints && options.member && remaining > 0) {
    pointsUsed = Math.min(options.member.points, Math.floor(remaining * 100))
    pointsDeduction = roundMoney(pointsUsed / 100)
    remaining = roundMoney(remaining - pointsDeduction)
  }

  let balanceDeduction = 0
  if (options.useBalance && options.member && remaining > 0) {
    balanceDeduction = roundMoney(Math.min(options.member.balance, remaining))
    remaining = roundMoney(remaining - balanceDeduction)
  }

  const payable = Math.max(0, remaining)

  return {
    itemCount,
    originalTotal,
    lineDiscount,
    couponDiscount,
    storeCouponDiscount,
    pointsDeduction,
    pointsUsed,
    balanceDeduction,
    totalDiscount: roundMoney(originalTotal - payable),
    payable
  }
}
