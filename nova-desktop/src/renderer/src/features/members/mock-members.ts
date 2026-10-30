import type {
  Member,
  MemberCoupon,
  MemberLevel,
  MemberOrder,
  BalanceRecord,
  PointRecord
} from '@shared/types/member'

/**
 * 会员 mock 数据。
 * 固定种子生成 1,286 位会员、86 位超级会员，会员余额合计 ¥86,420，与 demo 指标卡一致。
 */

const MEMBER_COUNT = 1286
const TARGET_BALANCE = 86420

const SURNAMES = [
  '陈',
  '王',
  '李',
  '张',
  '刘',
  '赵',
  '孙',
  '周',
  '吴',
  '郑',
  '冯',
  '许',
  '何',
  '林',
  '郭',
  '罗',
  '梁',
  '高',
  '徐',
  '马'
] as const

/** 头像底色，与 demo 一致 */
const AVATAR_COLORS = ['#4f46e5', '#0f766e', '#b45309', '#6b7280', '#1e3a8a'] as const

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** 从索引派生分散的伪随机整数，避免列表里出现明显的等差数列 */
function scattered(index: number, salt: number, span: number): number {
  let hash = Math.imul(index + salt, 2654435761)
  hash ^= hash >>> 15
  hash = Math.imul(hash, 2246822519)
  hash ^= hash >>> 13
  return (hash >>> 0) % span
}

/** 会员等级：每 15 位出现 1 位超级会员，共 86 位 */
function resolveLevel(index: number): MemberLevel {
  if ((index + 7) % 15 === 0) return 'super'
  if ((index + 4) % 7 === 0) return 'gold'
  if ((index + 1) % 4 === 0) return 'silver'
  return 'normal'
}

/** 基准日期：mock 数据统一以 2026-10-26 为今天 */
function baseDate(offsetDays: number): Date {
  return new Date(2026, 9, 26 - offsetDays)
}

function formatVisit(offsetDays: number): string {
  const date = baseDate(offsetDays)
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatMonth(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

/** 会员订单摘要：时间与金额按索引稳定生成 */
function createOrders(index: number, visitOffset: number): MemberOrder[] {
  return Array.from({ length: 3 }, (_, orderIndex) => {
    const date = baseDate(visitOffset + orderIndex * 3)
    const amount = 260 + ((index * 137 + orderIndex * 211) % 1500)
    return {
      no: `DB${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(
        index * 3 + orderIndex + 1,
        4
      )}`,
      time: `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(10 + (index % 10))}:${pad(
        (index * 7 + orderIndex * 13) % 60
      )}`,
      itemCount: 1 + ((index + orderIndex) % 4),
      amount: round2(amount + 0.5)
    }
  })
}

function createPointRecords(index: number): PointRecord[] {
  const change = 40 + (index % 120)
  return [
    {
      id: `${index}-point-1`,
      time: `10-${pad(23 - (index % 10))} 18:20`,
      change,
      reason: '消费获得'
    },
    {
      id: `${index}-point-2`,
      time: `10-${pad(12 - (index % 8))} 11:06`,
      change: -30,
      reason: '积分抵扣'
    },
    {
      id: `${index}-point-3`,
      time: '09-28 09:40',
      change: 100,
      reason: '生日赠送'
    }
  ]
}

function createBalanceRecords(index: number): BalanceRecord[] {
  return [
    {
      id: `${index}-balance-1`,
      time: `10-${pad(23 - (index % 10))} 18:20`,
      change: -120,
      type: 'consume',
      reason: '订单消费'
    },
    {
      id: `${index}-balance-2`,
      time: `10-${pad(16 - (index % 8))} 15:42`,
      change: 500,
      type: 'recharge',
      reason: '微信充值'
    },
    {
      id: `${index}-balance-3`,
      time: '09-30 10:12',
      change: -80,
      type: 'consume',
      reason: '订单消费'
    }
  ]
}

function createCoupons(index: number): MemberCoupon[] {
  return [
    {
      id: `${index}-coupon-1`,
      name: '秋冬焕新券',
      value: '满 300 减 50',
      expiresAt: '2026-11-30',
      status: 'available'
    },
    {
      id: `${index}-coupon-2`,
      name: '会员生日礼',
      value: '8 折券',
      expiresAt: '2026-12-31',
      status: index % 3 === 0 ? 'used' : 'available'
    },
    {
      id: `${index}-coupon-3`,
      name: '国庆亲子专场',
      value: '满 500 减 80',
      expiresAt: '2026-10-07',
      status: 'expired'
    }
  ]
}

function createMembers(): Member[] {
  return Array.from({ length: MEMBER_COUNT }, (_, index) => {
    const visitOffset = scattered(index, 23, 61)
    const joinedAt = formatDate(new Date(2026, 0, 1 + scattered(index, 19, 290)))
    const surname = SURNAMES[index % SURNAMES.length] as string

    return {
      id: `M${pad(index + 1, 5)}`,
      name: `${surname}${index % 3 === 0 ? '先生' : '女士'}`,
      phone: `138${String(10000000 + scattered(index, 3, 90000000))}`,
      level: resolveLevel(index),
      points: 30 + scattered(index, 7, 5980),
      // 少数高余额会员用于展示金卡/超级会员画像；每 23 位保留一个零余额账户
      balance:
        (index + 11) % 23 === 0
          ? 0
          : 10 + scattered(index, 11, 110) + (index % 211 === 0 ? 900 : 0),
      totalSpent: 1200 + scattered(index, 13, 42000),
      orderCount: 3 + scattered(index, 17, 45),
      lastVisit: formatVisit(visitOffset),
      joinedAt,
      joinedLabel: formatMonth(new Date(joinedAt)),
      colorHex: AVATAR_COLORS[index % AVATAR_COLORS.length] as string,
      orders: createOrders(index, visitOffset),
      pointRecords: createPointRecords(index),
      balanceRecords: createBalanceRecords(index),
      coupons: createCoupons(index)
    }
  })
}

export const MOCK_MEMBERS: Member[] = createMembers()

/** 把会员余额合计校准到 demo 数值，保证指标卡完全一致 */
function normalizeBalance(members: Member[]): void {
  let diff = TARGET_BALANCE - members.reduce((sum, member) => sum + member.balance, 0)

  for (let pass = 0; pass < 40 && diff !== 0; pass += 1) {
    for (const member of members) {
      if (diff === 0) break
      if (diff > 0) {
        // 零余额账户保留，用于呈现未充值会员
        if (member.balance === 0) continue
        member.balance += 1
        diff -= 1
      } else if (member.balance > 0) {
        member.balance -= 1
        diff += 1
      }
    }
  }
}

normalizeBalance(MOCK_MEMBERS)
