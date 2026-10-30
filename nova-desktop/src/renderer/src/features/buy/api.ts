import type { BuyCoupon, BuyMember, BuyProduct, CartItem, PaymentReceipt, PaymentMethod, PricingResult } from '@shared/types/buy'
import type { Member, MemberLevel } from '@shared/types/member'
import { posGet, posPost } from '@renderer/lib/pos'
import { colorHex } from '@renderer/lib/product-color'

/**
 * 买单域数据访问层（D6 已接入 nova-pos-server）。
 * 扫码查商品、会员权益、导购与下单全部走真实接口。
 */

interface ServerInventory {
  id: number
  sn: string
  sku: string
  name: string
  color: string
  size: string
  originalPrice: string | number | null
  counts: number | null
}

interface ServerMember {
  phone: string
  name: string | null
  level: string | null
  point: number | null
  balance: number | null
  /** 生日，YYYY-MM-DD */
  birthday?: string | null
}

interface ServerCoupon {
  id: number
  couponDesc: string | null
  couponCondition: number | null
  couponValue: number
  couponStatus: string
  couponExpiredTime: string | null
}

interface ServerMemberList {
  count: number
  data: ServerMember[]
}

interface ServerCouponList {
  count: number
  data: ServerCoupon[]
}

interface ServerOrderList {
  count: number
  data: Array<{ createdAt: string }>
}

const LEVELS: readonly MemberLevel[] = ['normal', 'silver', 'gold', 'super']

const PAYMENT_TO_SERVER: Record<PaymentMethod, string> = {
  wechat: 'weixin',
  alipay: 'alipay',
  cash: 'cash',
  card: 'card',
  other: 'other'
}

function toLevel(level: string | null): MemberLevel {
  return LEVELS.includes(level as MemberLevel) ? (level as MemberLevel) : 'normal'
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** 商品查询结果：库存 <= 0 时允许继续超卖，由调用方提示 */
export interface LookupResult {
  product: BuyProduct
  /** 当前库存数，可能为 0 或负数 */
  stock: number
}

/** 扫码 / 输入款号查商品：先精确 SKU，再按款号命中同款任一有货 SKU */
export async function lookupProduct(keyword: string): Promise<LookupResult> {
  const value = keyword.trim()
  if (!value) throw new Error('请输入款号或 SKU')

  let item: ServerInventory | null = null
  try {
    item = await posGet<ServerInventory | null>('/inventory/queryDetailBySku', { sku: value })
  } catch {
    item = null
  }

  if (!item?.sku) {
    const list = await posGet<{ count: number; data: ServerInventory[] }>('/inventory/queryList', {
      sn: value,
      pageSize: 10,
      current: 1
    })
    const candidates = list.data ?? []
    item = candidates.find((row) => (row.counts ?? 0) > 0) ?? candidates[0] ?? null
  }

  if (!item?.sku) throw new Error('未找到该款号或 SKU，请核对后重试')

  return {
    product: {
      id: String(item.id),
      name: item.name,
      styleNo: item.sn,
      sku: item.sku,
      color: item.color,
      size: item.size,
      spec: `${item.color} / ${item.size}`,
      price: Number(item.originalPrice ?? 0),
      colorHex: colorHex(item.color)
    },
    // 门店实体可能仍有货，库存为 0 时由收银员决定是否继续售卖
    stock: item.counts ?? 0
  }
}

/** 按关键字搜索会员，供收银台选择 */
export async function searchMembers(keyword: string): Promise<Member[]> {
  const list = await posGet<ServerMemberList>('/member/list', {
    keyword: keyword.trim() || undefined,
    pageSize: 20,
    current: 1
  })
  return (list.data ?? []).map((item) => ({
    id: item.phone,
    name: item.name || item.phone,
    phone: item.phone,
    level: toLevel(item.level),
    points: item.point ?? 0,
    balance: item.balance ?? 0,
    totalSpent: 0,
    orderCount: 0,
    lastVisit: '—',
    joinedAt: '—',
    joinedLabel: '—',
    colorHex: colorHex(item.phone),
    orders: [],
    pointRecords: [],
    balanceRecords: [],
    coupons: []
  }))
}

/** 收银台新增会员：手机号未注册时写入会员表，服务端同时发放入会权益券 */
export async function createMember(phone: string): Promise<void> {
  const created = await posPost<{ phone?: string; error?: string }>('/member/create', {
    phone,
    // 入会只由手机号发起，昵称先用手机号占位，后续可在会员中心补全
    name: phone
  })
  // 服务端对已存在手机号返回 { error: 'member had exists' }，其余错误才视为失败
  if (created?.error && created.error !== 'member had exists') {
    throw new Error('会员创建失败，请稍后重试')
  }
}

/** 收银台会员：只保留积分、余额与可用券 */
export async function loadBuyMember(id: string): Promise<BuyMember | null> {
  const [member, coupons, orders] = await Promise.all([
    posGet<ServerMember>('/member/detail', { phone: id }),
    posGet<ServerCouponList>('/member/queryCouponList', { phone: id }),
    posGet<ServerOrderList>('/order/queryList', {
      userPhone: id,
      orderType: 'normal',
      pageSize: 1,
      current: 1
    })
  ])
  if (!member?.phone) return null

  const available = (coupons.data ?? [])
    .filter((coupon) => coupon.couponStatus === 'active')
    .filter(
      (coupon) =>
        !coupon.couponExpiredTime ||
        new Date(coupon.couponExpiredTime).getTime() >= Date.now()
    )
    .map<BuyCoupon>((coupon) => ({
      id: String(coupon.id),
      name: coupon.couponDesc || `¥${coupon.couponValue} 优惠券`,
      threshold: coupon.couponCondition ?? 0,
      amount: coupon.couponValue,
      expiresAt: (coupon.couponExpiredTime ?? '').slice(0, 10)
    }))

  const lastOrder = orders.data?.[0]?.createdAt
  return {
    id: member.phone,
    name: member.name || member.phone,
    phone: member.phone,
    level: toLevel(member.level),
    points: member.point ?? 0,
    balance: member.balance ?? 0,
    lastVisit: lastOrder ? String(lastOrder).slice(5, 10) : '—',
    birthday: member.birthday ?? null,
    coupons: available
  }
}

/** 按当前应收金额查询可用店铺优惠券（服务端已按门槛过滤） */
export async function loadStoreCoupons(amount: number): Promise<BuyCoupon[]> {
  if (amount <= 0) return []
  const coupons = await posGet<ServerCoupon[]>('/buy/getStoreCoupon', { amount })
  return (coupons ?? []).map<BuyCoupon>((coupon) => ({
    id: String(coupon.id),
    name: coupon.couponDesc || `¥${coupon.couponValue} 优惠券`,
    threshold: coupon.couponCondition ?? 0,
    amount: coupon.couponValue,
    expiresAt: (coupon.couponExpiredTime ?? '').slice(0, 10)
  }))
}

export interface SaleInput {
  cart: CartItem[]
  member: BuyMember | null
  pricing: PricingResult
  payment: PaymentMethod
  received: number
  clerk: { id: number; name: string }
  note: string
  couponId: string | null
  /** 店铺优惠券，未选为 null */
  storeCoupon: BuyCoupon | null
}

/** 提交订单：服务端写入订单、商品、库存流水与会员资产 */
export async function submitSale(input: SaleInput): Promise<PaymentReceipt> {
  const buyer = input.member
    ? {
        phone: input.member.phone,
        usePoint: input.pricing.pointsUsed,
        useBalance: input.pricing.balanceDeduction,
        useCoupon: input.pricing.couponDiscount,
        useCouponId: input.couponId ? Number(input.couponId) : null
      }
    : {}

  const body = {
    buyer,
    storeSaler: input.clerk,
    waitSales: {
      brief: {
        counts: input.pricing.itemCount,
        totalAmount: round2(input.pricing.originalTotal),
        payAmount: round2(input.pricing.originalTotal - input.pricing.lineDiscount),
        // 实收可能低于应收（议价 / 抹零），订单以实际收到的金额为准
        actualAmount: round2(Math.min(Math.max(input.received, 0), input.pricing.payable)),
        payType: PAYMENT_TO_SERVER[input.payment],
        remark: input.note.trim()
      },
      list: input.cart.map((item) => {
        // 颜色 / 尺码优先取独立字段，历史上只存了 spec 的挂单按 / 拆分兜底
        const [specColor = '', specSize = ''] = item.spec.split('/').map((part) => part.trim())
        const color = item.color ?? specColor
        const size = item.size ?? specSize
        return {
          sn: item.styleNo,
          sku: item.sku,
          name: item.name,
          color,
          size,
          originalPrice: item.price,
          counts: item.qty,
          actualPrice: round2((item.price * item.discount) / 10)
        }
      })
    },
    storeCoupons: input.storeCoupon
      ? [
          {
            id: Number(input.storeCoupon.id),
            couponValue: input.storeCoupon.amount,
            couponDesc: input.storeCoupon.name
          }
        ]
      : []
  }

  const order = await posPost<{ orderSn: string; orderActualAmount: number }>('/buy/submit', body)
  if (!order?.orderSn) throw new Error('下单失败，请稍后重试')

  return {
    orderNo: order.orderSn,
    payment: input.payment,
    payable: round2(order.orderActualAmount ?? input.pricing.payable),
    received: input.received,
    pointsEarned: Math.floor(order.orderActualAmount ?? 0),
    balanceUsed: input.pricing.balanceDeduction,
    itemCount: input.pricing.itemCount
  }
}
