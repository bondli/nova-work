import type {
  BalanceRecord,
  Member,
  MemberBalanceInput,
  MemberCoupon,
  MemberFilters,
  MemberLevel,
  MemberListResult,
  MemberOrder,
  MemberPayment,
  MemberPointInput,
  MemberProfileInput,
  MemberSummary,
  NewMemberInput,
  PointRecord,
  RechargeInput
} from '@shared/types/member'
import { posGet, posPost } from '@renderer/lib/pos'

/**
 * 会员域数据访问层（D6 已接入 nova-pos-server）。
 * 会员以手机号作为稳定 ID；列表只取主体字段，详情再补齐订单与流水。
 */

interface ServerMember {
  id: number
  phone: string
  name: string | null
  level: string | null
  point: number | null
  balance: number | null
  actual: number | null
  coupon: number | null
  birthday: string | null
  createdAt: string
  updatedAt: string
}

interface ServerOrder {
  orderSn: string
  orderItems: number | null
  orderAmount: number | null
  orderActualAmount: number | null
  payType?: string | null
  createdAt: string
}

interface ServerScore {
  id: number
  point: number
  type: string
  reason: string | null
  createdAt: string
}

interface ServerBalance {
  id: number
  value: number
  type: string
  reason: string | null
  createdAt: string
}

interface ServerCoupon {
  id: number
  couponDesc: string | null
  couponCondition: number | null
  couponValue: number
  couponStatus: string
  couponExpiredTime: string | null
  createdAt?: string
}

interface ServerList<T> {
  count: number
  data: T[]
}

const LEVELS: readonly MemberLevel[] = ['normal', 'silver', 'gold', 'super']

const PAYMENT_TO_SERVER: Record<MemberPayment, string> = {
  wechat: 'weixin',
  alipay: 'alipay',
  cash: 'cash',
  card: 'card',
  other: 'other'
}

/** 服务端支付方式 → 桌面端枚举 */
const PAYMENT_BY_SERVER: Record<string, MemberPayment> = {
  weixin: 'wechat',
  alipay: 'alipay',
  cash: 'cash',
  card: 'card',
  other: 'other'
}

/** 积分流水的变动类型文案，取值与老系统 Detail/point.tsx 的 enum 一致 */
const SCORE_TYPE_LABEL: Record<string, string> = {
  earn: '购物赚取',
  use: '购物抵扣',
  refund: '退货回滚',
  exchange: '换货退补',
  manualAdd: '手动增加',
  manualReduce: '手动减少',
  income: '充值获得'
}

/** 余额流水的变动类型文案，取值与老系统 Detail/balance.tsx 的 enum 一致 */
const BALANCE_TYPE_LABEL: Record<string, string> = {
  use: '消费',
  income: '充值',
  send: '充值赠送',
  refund: '退货返还',
  manualAdd: '手动增加',
  manualReduce: '手动减少'
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function toLevel(level: string | null): MemberLevel {
  return LEVELS.includes(level as MemberLevel) ? (level as MemberLevel) : 'normal'
}

/** 头像底色：按手机号散列，保证同一会员颜色稳定 */
function colorHex(seed: string): string {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return `hsl(${hash} 52% 56%)`
}

/** 服务端时间 2026-10-26 19:50:14 → 10-26 19:50 */
function formatTime(value: string | null): string {
  if (!value) return '—'
  const text = String(value)
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.replace('T', ' ').slice(5, 16)
  return text
}

/** 服务端时间 → YYYY-MM-DD HH:mm，用于创建时间 / 获取时间列 */
function formatFull(value: string | null | undefined): string {
  if (!value) return '—'
  const text = String(value).replace('T', ' ')
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 16) : text
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return String(value).slice(0, 10)
}

/** 会员主体，详情相关数组由调用方补齐 */
function toMember(item: ServerMember): Member {
  const joinedAt = formatDate(item.createdAt)
  return {
    id: item.phone,
    name: item.name || item.phone,
    phone: item.phone,
    level: toLevel(item.level),
    points: item.point ?? 0,
    balance: item.balance ?? 0,
    totalSpent: item.actual ?? 0,
    orderCount: 0,
    lastVisit: '—',
    birthday: item.birthday ? formatDate(item.birthday) : '',
    couponCount: item.coupon ?? 0,
    createdAt: formatFull(item.createdAt),
    joinedAt,
    joinedLabel: joinedAt.slice(0, 7),
    colorHex: colorHex(item.phone),
    orders: [],
    pointRecords: [],
    balanceRecords: [],
    coupons: []
  }
}

function toMemberOrder(order: ServerOrder): MemberOrder {
  return {
    no: order.orderSn,
    time: formatTime(order.createdAt).slice(0, 11),
    itemCount: order.orderItems ?? 0,
    orderAmount: order.orderAmount ?? 0,
    amount: order.orderActualAmount ?? 0,
    payment: PAYMENT_BY_SERVER[order.payType ?? ''] ?? 'cash'
  }
}

function toPointRecord(record: ServerScore): PointRecord {
  return {
    id: String(record.id),
    time: formatFull(record.createdAt),
    change: record.point,
    type: SCORE_TYPE_LABEL[record.type] ?? record.type,
    reason: record.reason || '积分变动'
  }
}

function toBalanceRecord(record: ServerBalance): BalanceRecord {
  return {
    id: String(record.id),
    time: formatFull(record.createdAt),
    change: record.value,
    type: record.type === 'use' ? 'consume' : 'recharge',
    typeText: BALANCE_TYPE_LABEL[record.type] ?? record.type,
    reason: record.reason || '余额变动'
  }
}

function toMemberCoupon(coupon: ServerCoupon): MemberCoupon {
  const expired =
    coupon.couponExpiredTime !== null &&
    new Date(coupon.couponExpiredTime).getTime() < Date.now()
  const status: MemberCoupon['status'] =
    coupon.couponStatus === 'used'
      ? 'used'
      : coupon.couponStatus === 'active' && !expired
        ? 'available'
        : 'expired'

  return {
    id: String(coupon.id),
    name: coupon.couponDesc || '优惠券',
    value: `¥${Number(coupon.couponValue ?? 0).toFixed(2)}`,
    expiresAt: formatFull(coupon.couponExpiredTime),
    obtainedAt: formatFull(coupon.createdAt),
    status
  }
}

/**
 * 会员列表：老系统筛选条件（创建时间区间 / 手机号 / 等级 / 本月生日 / 排序）+ 分页。
 * 本月生日只在「是」时下发，排序留空时服务端按创建时间倒序。
 */
export async function fetchMembers(filters: MemberFilters): Promise<MemberListResult> {
  const [list, summary] = await Promise.all([
    posGet<ServerList<ServerMember>>('/member/list', {
      phone: filters.phone.trim() || undefined,
      level: filters.level === 'all' ? undefined : filters.level,
      monthBirthday: filters.monthBirthday === '1' ? '1' : undefined,
      orderby: filters.orderby || undefined,
      startDate: filters.start,
      endDate: filters.end,
      pageSize: filters.pageSize,
      current: filters.page
    }),
    posGet<MemberSummary>('/member/summary')
  ])

  return {
    rows: (list.data ?? []).map(toMember),
    total: list.count ?? 0,
    summary
  }
}

/** 单个会员详情：主体 + 最近订单 + 积分 / 余额 / 优惠券流水 */
export async function fetchMember(id: string): Promise<Member | null> {
  const member = await posGet<ServerMember>('/member/detail', { phone: id })
  if (!member?.phone) return null

  const [orders, scores, balances, coupons] = await Promise.all([
    posGet<ServerList<ServerOrder>>('/order/queryList', {
      userPhone: member.phone,
      orderType: 'normal',
      pageSize: 10,
      current: 1
    }),
    posGet<ServerList<ServerScore>>('/member/queryScoreList', { phone: member.phone }),
    posGet<ServerList<ServerBalance>>('/member/queryBalanceList', { phone: member.phone }),
    posGet<ServerList<ServerCoupon>>('/member/queryCouponList', { phone: member.phone })
  ])

  const result = toMember(member)
  result.orderCount = orders.count ?? 0
  result.orders = (orders.data ?? []).map(toMemberOrder)
  result.pointRecords = (scores.data ?? []).map(toPointRecord)
  result.balanceRecords = (balances.data ?? []).map(toBalanceRecord)
  result.coupons = (coupons.data ?? []).map(toMemberCoupon)
  const firstOrder = result.orders[0]
  if (firstOrder) {
    result.lastVisit = firstOrder.time.slice(0, 5)
  }
  return result
}

/** 新增会员：手机号必填，重复手机号由主进程转成 CONFLICT 错误抛出 */
export async function createMember(input: NewMemberInput): Promise<void> {
  await posPost('/member/create', {
    phone: input.phone.trim(),
    name: input.name.trim(),
    birthday: input.birthday || null
  })
}

/** 修改会员基本信息：老系统「基本信息」区块，手机号只读 */
export async function updateMemberProfile(input: MemberProfileInput): Promise<void> {
  await posPost('/member/update', {
    phone: input.phone,
    name: input.name.trim(),
    birthday: input.birthday || null
  })
}

/** 手动调整积分：changePoint 恒为正数，方向由 type 决定 */
export async function updateMemberPoint(input: MemberPointInput): Promise<void> {
  await posPost('/member/updateScore', {
    phone: input.phone,
    changePoint: input.changePoint,
    type: input.type,
    reason: input.reason.trim()
  })
}

/** 手动调整余额：changeBalance 恒为正数，方向由 type 决定，与老系统 Editor 的「余额」区块一致 */
export async function updateMemberBalance(input: MemberBalanceInput): Promise<void> {
  await posPost('/member/updateBalance', {
    phone: input.phone,
    changeBalance: input.changeBalance,
    type: input.type,
    reason: input.reason.trim()
  })
}

/**
 * 会员充值：充值金额与赠送余额一并入账，服务端同时写入余额 / 积分流水与收入单。
 * 赠送类型为「商品吊牌价值」时余额不加、改为发放优惠券。
 */
export async function rechargeMember(input: RechargeInput): Promise<Member> {
  const amount = round2(input.amount)
  const gift = round2(input.gift)
  if (amount <= 0) throw new Error('充值金额需大于 0')

  const remark = input.remark.trim()

  await posPost('/member/incomeBalance', {
    phone: input.memberId,
    inComeBalance: amount,
    sendValue: gift,
    sendValueType: input.sendValueType ?? 'balance',
    reason: remark,
    salerId: input.salerId,
    salerName: input.salerName,
    payType: PAYMENT_TO_SERVER[input.payment]
  })

  const member = await fetchMember(input.memberId)
  if (!member) throw new Error('会员不存在，请刷新后重试')
  return member
}
