import type {
  AnalyticsSnapshot,
  AnalyticsSummary,
  DailyRevenue,
  MonthlyRevenue,
  SalerMonthlyRevenue
} from '@shared/types/analytics'
import { posGet, posPost } from '@renderer/lib/pos'
import { getOrderShowStatus } from '@renderer/stores/order-show-status-store'

/**
 * 数据域数据访问层（D6 已接入 nova-pos-server）。
 * 指标卡按所选区间聚合，营业额按月统计，按天视图逐月拉取。
 */

interface ServerCoreData {
  orderCount: number
  orderAmount: number
  totalBalance: number
  inventoryCount: number
  memberCount: number
  saledItemCount: number
  memberBalance: number
}

interface ServerMonthChart {
  /** YYYY/MM */
  month: string
  amounts: number
  cost?: number
  rate?: number
}

interface ServerDayChart {
  /** 01 ~ 31 */
  day: string
  amounts: number
  cost: number
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function toMonth(serverMonth: string): string {
  return serverMonth.replace('/', '-')
}

function currentCutoff(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`
}

/** 隐藏订单时传 hidden，服务端据此只统计「正常」订单 */
function showStatusParam(): 'hidden' | undefined {
  return getOrderShowStatus() === 'hidden' ? 'hidden' : undefined
}

/** 取与当前区间等长、紧邻在上一个的时间窗，用于环比 */
function previousRange(start: string, end: string): [string, string] {
  const startDate = new Date(`${start}T00:00:00`)
  const endDate = new Date(`${end}T00:00:00`)
  const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1)
  const previousEnd = new Date(startDate)
  previousEnd.setDate(previousEnd.getDate() - 1)
  const previousStart = new Date(previousEnd)
  previousStart.setDate(previousStart.getDate() - (days - 1))
  return [toDateString(previousStart), toDateString(previousEnd)]
}

function toDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** 服务端汇总字段 → 数据页指标 */
function toSummary(core: ServerCoreData): AnalyticsSummary {
  return {
    orderAmount: round2(core.orderAmount ?? 0),
    balanceSpent: round2(core.totalBalance ?? 0),
    orderCount: core.orderCount ?? 0,
    soldItems: core.saledItemCount ?? 0,
    stock: core.inventoryCount ?? 0,
    memberBalance: round2(core.memberBalance ?? 0)
  }
}

/** 数据页一次查询返回的事实快照 */
export async function fetchAnalyticsSnapshot(start: string, end: string): Promise<AnalyticsSnapshot> {
  const showStatus = showStatusParam()
  const previous = previousRange(start, end)
  const [core, corePrevious, charts, salerCharts] = await Promise.all([
    posPost<ServerCoreData>('/data/getCoreData', {
      dateRange: [start, end],
      showStatus
    }),
    // 上一区间只用于卡片环比，口径与当前区间完全一致
    posPost<ServerCoreData>('/data/getCoreData', {
      dateRange: previous,
      showStatus
    }),
    posGet<ServerMonthChart[]>('/data/getOrderCharts', { showStatus }),
    posGet<Array<{ month: string; amounts: number }>>('/data/getSalerCharts', { showStatus })
  ])

  const summary = toSummary(core)

  const months: MonthlyRevenue[] = (charts ?? []).map((item) => ({
    month: toMonth(item.month),
    sales: round2(item.amounts ?? 0),
    cost: round2(item.cost ?? 0),
    profitRate: round2(item.rate ?? 0)
  }))

  // 导购员营业额：服务端固定返回当前登录导购近 12 个月
  const salerMonths: SalerMonthlyRevenue[] = (salerCharts ?? []).map((item) => ({
    month: toMonth(item.month),
    sales: round2(item.amounts ?? 0)
  }))

  return {
    summary,
    previousSummary: toSummary(corePrevious),
    months,
    cutoff: currentCutoff(),
    salerMonths
  }
}

/** 店铺某月按天营业额，进入按天视图时按需查询 */
export async function fetchStoreDaily(month: string): Promise<DailyRevenue[]> {
  const daily = await posGet<ServerDayChart[]>('/data/getStoreDailyCharts', {
    month,
    showStatus: showStatusParam()
  })
  return (daily ?? []).map((day) => ({
    day: Number(day.day),
    amount: round2(day.amounts ?? 0)
  }))
}

/** 当前导购某月按天营业额，进入按天视图时按需查询 */
export async function fetchSalerDaily(month: string): Promise<DailyRevenue[]> {
  const daily = await posGet<Array<{ day: string; amounts: number }>>(
    '/data/getSalerDailyCharts',
    { month, showStatus: showStatusParam() }
  )
  return (daily ?? []).map((day) => ({
    day: Number(day.day),
    amount: round2(day.amounts ?? 0)
  }))
}
