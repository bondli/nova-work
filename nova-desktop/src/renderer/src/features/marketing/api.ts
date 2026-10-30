import type {
  Campaign,
  CampaignCoupon,
  CampaignDetail,
  CampaignFilters,
  CampaignInput,
  CampaignListResult,
  CampaignStatus,
  CampaignSummary,
  CampaignType
} from '@shared/types/campaign'
import { posGet, posPost } from '@renderer/lib/pos'

/**
 * 营销域数据访问层（D6 已接入 nova-pos-server）。
 * 旧库没有活动参与 / 核销统计，相关指标返回 null，由列表渲染成「—」，不伪造数据。
 */

interface ServerMarketing {
  id: number
  marketingName: string
  marketingDesc: string | null
  marketingTheme: string | null
  marketingImage: string | null
  marketingType: string
  marketingCondition: number | null
  marketingValue: number | null
  startTime: string | null
  endTime: string | null
}

interface ServerCoupon {
  id: number
  couponDesc: string | null
  couponCondition: number | null
  couponValue: number
  couponCount: number | null
  couponStatus: string
  couponExpiredTime: string | null
}

interface ServerList<T> {
  count: number
  data: T[]
}

/** 活动类型取值与老系统 marketingType 完全一致，无需再做一层映射 */
const TYPES: readonly CampaignType[] = ['full_reduce', 'full_send', 'full_gift']

function toType(value: string): CampaignType {
  return TYPES.includes(value as CampaignType) ? (value as CampaignType) : 'full_reduce'
}

function toDate(value: string | null): string | null {
  if (!value) return null
  return String(value).slice(0, 10)
}

function toTimestamp(value: string | null): number | null {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

/**
 * 活动状态：按服务端返回的完整时间戳判断。
 * 不能用日期补 23:59:59——下线接口会把 endTime 写成当前时刻，
 * 按当天结束时间比较会让活动一直停留在「进行中」。
 */
function resolveStatus(start: string | null, end: string | null): CampaignStatus {
  const now = Date.now()
  const startAt = toTimestamp(start)
  const endAt = toTimestamp(end)
  if (startAt === null || endAt === null) return 'ongoing'
  if (now < startAt) return 'upcoming'
  if (now > endAt) return 'ended'
  return 'ongoing'
}

function toCampaign(item: ServerMarketing): Campaign {
  const start = toDate(item.startTime)
  const end = toDate(item.endTime)
  const status = resolveStatus(item.startTime, item.endTime)
  return {
    id: String(item.id),
    name: item.marketingName,
    description: item.marketingDesc || '',
    type: toType(item.marketingType),
    status,
    periodLabel: start && end ? `${start} ~ ${end}` : '长期',
    start,
    end,
    participantLabel: status === 'upcoming' ? '预热' : '参与',
    participants: null,
    redeemed: null,
    drivenSales: null
  }
}

function toCampaignDetail(item: ServerMarketing): CampaignDetail {
  return {
    ...toCampaign(item),
    theme: item.marketingTheme || '',
    image: item.marketingImage || '',
    content: null
  }
}

function toCampaignCoupon(coupon: ServerCoupon): CampaignCoupon {
  return {
    id: String(coupon.id),
    name: coupon.couponDesc || '优惠券',
    condition: `¥${Number(coupon.couponCondition ?? 0).toFixed(2)}`,
    value: `¥${Number(coupon.couponValue ?? 0).toFixed(2)}`,
    count: coupon.couponCount,
    // 老系统详情券列表只有「有效 / 无效」两种状态
    status: coupon.couponStatus === 'active' ? '有效' : '无效',
    expiresAt: coupon.couponExpiredTime ? String(coupon.couponExpiredTime).slice(0, 16) : '—'
  }
}

/** 概览：只统计进行中活动数量，核销类指标无数据来源 */
function summarize(campaigns: Campaign[]): CampaignSummary {
  return {
    ongoingCount: campaigns.filter((campaign) => campaign.status === 'ongoing').length,
    monthRedeemed: 0,
    drivenSales: 0,
    redeemRate: 0
  }
}

/** 活动列表：活动名称 + 类型 + 活动时间 + 分页 */
export async function fetchCampaigns(filters: CampaignFilters): Promise<CampaignListResult> {
  const [list, all] = await Promise.all([
    posGet<ServerList<ServerMarketing>>('/marketing/list', {
      marketingName: filters.name.trim() || undefined,
      marketingType: filters.type === 'all' ? undefined : filters.type,
      startDate: filters.start,
      endDate: filters.end,
      pageSize: filters.pageSize,
      current: filters.page
    }),
    posGet<ServerList<ServerMarketing>>('/marketing/list', {
      pageSize: 200,
      current: 1
    })
  ])

  return {
    rows: (list.data ?? []).map(toCampaign),
    total: list.count ?? 0,
    summary: summarize((all.data ?? []).map(toCampaign))
  }
}

/** 原始活动记录，编辑回填与上下线改写时需要保留原字段 */
async function fetchRawCampaign(id: string): Promise<ServerMarketing | null> {
  const detail = await posGet<ServerMarketing | null>('/marketing/queryDetail', { id })
  return detail?.id ? detail : null
}

/** 活动详情，供编辑弹窗回填 */
export async function fetchCampaignDetail(id: string): Promise<CampaignDetail | null> {
  const raw = await fetchRawCampaign(id)
  return raw ? toCampaignDetail(raw) : null
}

/** 活动下属优惠券列表，供详情抽屉的券表使用 */
export async function fetchCampaignCoupons(id: string): Promise<CampaignCoupon[]> {
  const result = await posGet<ServerList<ServerCoupon>>('/marketing/queryCouponList', { id })
  return (result.data ?? []).map(toCampaignCoupon)
}

/** 新建活动：满减 / 满送会按活动内容生成对应的店铺优惠券 */
export async function createCampaign(input: CampaignInput): Promise<void> {
  await posPost('/marketing/create', input)
}

/** 修改活动：服务端不支持改活动类型，营销内容也不随之变更 */
export async function updateCampaign(id: string, input: CampaignInput): Promise<void> {
  await posPost(
    '/marketing/update',
    {
      marketingName: input.marketingName,
      marketingDesc: input.marketingDesc,
      startTime: input.startTime,
      endTime: input.endTime,
      marketingTheme: input.marketingTheme,
      marketingImage: input.marketingImage
    },
    { id }
  )
}

/** 上线 / 下线：已结束的活动重新排期 90 天，进行中则立即下线 */
export async function toggleCampaign(id: string): Promise<Campaign> {
  const current = await fetchRawCampaign(id)
  if (!current) throw new Error('活动不存在，请刷新后重试')

  const status = resolveStatus(current.startTime, current.endTime)
  if (status === 'ended') {
    const now = new Date()
    const end = new Date(now)
    end.setDate(end.getDate() + 90)
    // 重新排期时保留原有描述与图片，避免更新接口把它们清空
    await posPost(
      '/marketing/update',
      {
        marketingName: current.marketingName,
        marketingDesc: current.marketingDesc,
        marketingTheme: current.marketingTheme,
        marketingImage: current.marketingImage,
        startTime: now.toISOString(),
        endTime: end.toISOString()
      },
      { id }
    )
  } else {
    await posPost('/marketing/offline', { id })
  }

  const updated = await fetchRawCampaign(id)
  if (!updated) throw new Error('活动状态更新失败，请刷新后重试')
  return toCampaign(updated)
}

/** 删除活动，同时清理活动下属优惠券 */
export async function deleteCampaign(id: string): Promise<{ id: string }> {
  await posPost('/marketing/delete', { id })
  return { id }
}
