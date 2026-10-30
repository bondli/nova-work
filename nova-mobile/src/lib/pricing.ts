import type { BuyCoupon, BuyMember, CartItem, PricingResult } from './types';

/**
 * 收款金额计算，规则与桌面端 `lib/pricing` 完全一致（同一组单测用例）：
 * 商品折扣 → 会员券 → 店铺券 → 积分（100 分抵 ¥1）→ 余额，逐层扣减且不透支。
 * 入参金额单位为分，避免浮点误差。
 */

export function lineSubtotalCents(item: CartItem): number {
  return Math.round((item.priceCents * item.qty * item.discount) / 10);
}

export function cartItemCount(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.qty, 0);
}

export interface PricingOptions {
  member: BuyMember | null;
  coupon: BuyCoupon | null;
  storeCoupon: BuyCoupon | null;
  usePoints: boolean;
  useBalance: boolean;
}

const couponApplies = (coupon: BuyCoupon | null, baseCents: number): BuyCoupon | null => {
  if (!coupon) return null;
  return baseCents >= Math.round(coupon.threshold * 100) ? coupon : null;
};

export function calculatePricing(cart: CartItem[], options: PricingOptions): PricingResult {
  const itemCount = cartItemCount(cart);
  const originalCents = cart.reduce((sum, item) => sum + item.priceCents * item.qty, 0);
  const discountedCents = cart.reduce((sum, item) => sum + lineSubtotalCents(item), 0);
  const lineDiscountCents = originalCents - discountedCents;

  const memberCoupon = couponApplies(options.coupon, discountedCents);
  const couponDiscountCents = memberCoupon
    ? Math.min(Math.round(memberCoupon.amount * 100), discountedCents)
    : 0;

  const afterCoupon = Math.max(0, discountedCents - couponDiscountCents);
  const storeCoupon = couponApplies(options.storeCoupon, afterCoupon);
  const storeCouponDiscountCents = storeCoupon
    ? Math.min(Math.round(storeCoupon.amount * 100), afterCoupon)
    : 0;

  let remaining = Math.max(0, afterCoupon - storeCouponDiscountCents);
  let pointsDeductionCents = 0;
  let pointsUsed = 0;

  if (options.usePoints && options.member && remaining > 0) {
    pointsUsed = Math.min(options.member.points, remaining);
    pointsDeductionCents = pointsUsed;
    remaining -= pointsDeductionCents;
  }

  let balanceDeductionCents = 0;
  if (options.useBalance && options.member && remaining > 0) {
    balanceDeductionCents = Math.min(Math.round(options.member.balance * 100), remaining);
    remaining -= balanceDeductionCents;
  }

  const payableCents = Math.max(0, remaining);

  return {
    itemCount,
    originalCents,
    lineDiscountCents,
    couponDiscountCents,
    storeCouponDiscountCents,
    pointsDeductionCents,
    pointsUsed,
    balanceDeductionCents,
    totalDiscountCents: originalCents - payableCents,
    payableCents,
  };
}
