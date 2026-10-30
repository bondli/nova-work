/**
 * 买单域共享类型。
 * 折扣、权益抵扣等纯计算集中在 lib/pricing.ts，页面与后台复用。
 */

import type { MemberLevel } from './member'
import type { PaymentMethod } from './order'

/** 购物车项 */
export interface CartItem {
  id: string
  name: string
  styleNo: string
  sku: string
  /** 颜色，缺失时由 spec 兜底（历史挂单） */
  color?: string
  /** 尺码，缺失时由 spec 兜底（历史挂单） */
  size?: string
  /** 颜色 / 尺码 展示串，兼容历史挂单 */
  spec: string
  /** 吊牌单价，单位元 */
  price: number
  qty: number
  /** 折扣，1~10，6.0 表示六折 */
  discount: number
  colorHex: string
}

/** 扫码/输入款号后命中的商品 */
export type BuyProduct = Omit<CartItem, 'qty' | 'discount'>

/** 买单会员（只保留收款所需权益字段） */
export interface BuyMember {
  id: string
  name: string
  phone: string
  level: MemberLevel
  points: number
  balance: number
  /** 最近到店，MM/DD */
  lastVisit: string
  /** 生日，YYYY-MM-DD；用于「本月生日」提示 */
  birthday?: string | null
  coupons: BuyCoupon[]
}

/** 会员优惠券 */
export interface BuyCoupon {
  id: string
  name: string
  /** 使用门槛（折后金额） */
  threshold: number
  /** 抵扣金额 */
  amount: number
  expiresAt: string
}

/** 挂单快照 */
export interface HeldOrder {
  cart: CartItem[]
  member: BuyMember | null
  clerk: string
  note: string
  /** ISO 时间 */
  heldAt: string
}

/** 应收金额计算结果 */
export interface PricingResult {
  itemCount: number
  /** 吊牌总价 */
  originalTotal: number
  /** 商品折扣优惠 */
  lineDiscount: number
  /** 会员优惠券抵扣 */
  couponDiscount: number
  /** 店铺优惠券抵扣 */
  storeCouponDiscount: number
  /** 积分抵扣金额 */
  pointsDeduction: number
  /** 消耗积分 */
  pointsUsed: number
  /** 余额抵扣金额 */
  balanceDeduction: number
  /** 总优惠 = 吊牌价 - 应收 */
  totalDiscount: number
  payable: number
}

/** 收款成功回执 */
export interface PaymentReceipt {
  orderNo: string
  payment: PaymentMethod
  payable: number
  received: number
  /** 本次获得积分 */
  pointsEarned: number
  /** 余额抵扣 */
  balanceUsed: number
  itemCount: number
}

export type { PaymentMethod }
