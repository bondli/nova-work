/**
 * 三个固定定时任务的周期、文案与提示词。
 * 只做纯计算，方便单测；调度器与会话列表复用同一套口径。
 */
import { addDays, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns'
import type { AgentSessionStatus, AgentSessionType } from '@shared/types/analysis'
import type { TaskScheduleSettings } from '@shared/types/settings'

/** 固定任务的定义：id 同时是会话 id */
export interface TaskDefinition {
  id: 'task-daily' | 'task-weekly' | 'task-monthly'
  type: Extract<AgentSessionType, 'daily' | 'weekly' | 'monthly'>
  title: string
}

export const TASK_DEFINITIONS: TaskDefinition[] = [
  { id: 'task-daily', type: 'daily', title: '店铺经营日报' },
  { id: 'task-weekly', type: 'weekly', title: '店铺经营周报' },
  { id: 'task-monthly', type: 'monthly', title: '店铺经营月报' }
]

/** 取某类任务的执行时间（HH:MM） */
export function scheduleTimeOf(
  type: TaskDefinition['type'],
  schedule: TaskScheduleSettings
): string {
  return schedule[type]
}

/** 会话卡片与顶栏展示的时间文案 */
export function formatScheduleLabel(
  type: TaskDefinition['type'],
  schedule: TaskScheduleSettings
): string {
  const time = scheduleTimeOf(type, schedule)
  if (type === 'daily') return `每晚 ${time}`
  if (type === 'weekly') return `每周一 ${time}`
  return `每月 1 日 ${time}`
}

/** 任务当天的执行时刻；当天不执行（周报非周一、月报非 1 号）返回 null */
export function resolveOccurrence(
  type: TaskDefinition['type'],
  schedule: TaskScheduleSettings,
  now: Date
): Date | null {
  if (type === 'weekly' && now.getDay() !== 1) return null
  if (type === 'monthly' && now.getDate() !== 1) return null

  const [hourText, minuteText] = scheduleTimeOf(type, schedule).split(':')
  const occurrence = new Date(now)
  occurrence.setHours(Number(hourText), Number(minuteText), 0, 0)
  return occurrence
}

/**
 * 判断任务此刻是否应当触发：
 * 当天是执行日、已过执行时间、当前没在运行，且今天这一轮还没跑过。
 */
export function isTaskDue(params: {
  type: TaskDefinition['type']
  schedule: TaskScheduleSettings
  now: Date
  status: AgentSessionStatus
  lastRunAt?: string
}): boolean {
  const occurrence = resolveOccurrence(params.type, params.schedule, params.now)
  if (!occurrence || params.now.getTime() < occurrence.getTime()) return false
  if (params.status === 'running') return false
  if (params.lastRunAt) {
    const lastRunAt = new Date(params.lastRunAt)
    if (!Number.isNaN(lastRunAt.getTime()) && lastRunAt.getTime() >= occurrence.getTime()) {
      return false
    }
  }
  return true
}

/** 本次报告的数据范围：日报今天、周报上周、月报上月 */
export function resolveTaskRange(
  type: TaskDefinition['type'],
  now: Date
): { start: string; end: string; rangeLabel: string } {
  if (type === 'daily') {
    const value = format(now, 'yyyy-MM-dd')
    return { start: value, end: value, rangeLabel: format(now, 'MM/dd') }
  }

  if (type === 'weekly') {
    const lastWeek = subWeeks(now, 1)
    const start = startOfWeek(lastWeek, { weekStartsOn: 1 })
    const end = endOfWeek(lastWeek, { weekStartsOn: 1 })
    return {
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
      rangeLabel: `${format(start, 'MM/dd')} - ${format(end, 'MM/dd')}`
    }
  }

  const lastMonth = subMonths(now, 1)
  const start = startOfMonth(lastMonth)
  const end = endOfMonth(lastMonth)
  return {
    start: format(start, 'yyyy-MM-dd'),
    end: format(end, 'yyyy-MM-dd'),
    rangeLabel: `${format(start, 'MM/dd')} - ${format(end, 'MM/dd')}`
  }
}

/** 定时任务的提示词：明确数据范围、工具与产物路径，不让模型反问 */
export function buildScheduledPrompt(type: TaskDefinition['type'], now: Date): string {
  const { start, end } = resolveTaskRange(type, now)
  const label = format(now, 'yyyy-MM-dd')

  if (type === 'daily') {
    return [
      `现在是每日定时分析，请直接生成 ${start} 的店铺经营日报，不要向我提问。`,
      '1. 调用 get_business_overview 获取当日营业额、单量、客单价、连带率、会员占比、退款率，并与前一天对比；',
      '2. 调用 query_sales_trend（day 粒度）看日内走势，调用 query_inventory、query_slow_moving、query_members、query_marketing 找异常；',
      `3. 用 publish_artifact 发布 HTML 日报到 artifacts/店铺经营日报-${label}.html，包含核心指标卡、趋势、异常清单与 3 条明日待办；`,
      '4. 最后用不超过 80 字总结今天最需要关注的问题。'
    ].join('\n')
  }

  if (type === 'weekly') {
    return [
      `现在是每周定时分析，请直接生成 ${start} 至 ${end} 的店铺经营周报，不要向我提问。`,
      '1. 调用 get_business_overview 获取上周总览，并与前一周对比；',
      '2. 调用 query_sales_trend（week 粒度）看周内走势，调用 query_staff_performance 看导购表现，调用 query_inventory、query_slow_moving、query_members 找问题；',
      `3. 用 publish_artifact 发布 HTML 周报到 artifacts/店铺经营周报-${start}-${end}.html，包含指标对比、导购排名、库存与会员问题、下周 3 条行动建议；`,
      '4. 最后用不超过 80 字总结本周结论。'
    ].join('\n')
  }

  return [
    `现在是每月定时分析，请直接生成 ${start} 至 ${end} 的店铺经营月报，不要向我提问。`,
    '1. 调用 get_business_overview 获取上月总览，并与前一月对比；',
    '2. 调用 query_sales_trend（month 粒度）看月度走势，调用 query_staff_performance、query_inventory、query_slow_moving、query_members、query_marketing 复盘结构性问题；',
    `3. 用 publish_artifact 发布 HTML 月报到 artifacts/店铺经营月报-${start}-${end}.html，包含月度指标、结构变化、异常与下月 3 条经营建议；`,
    '4. 最后用不超过 80 字总结本月结论。'
  ].join('\n')
}

/** 通知副标题：报告日期或范围 + 内容提示 */
export function buildNotificationDescription(
  type: TaskDefinition['type'],
  now: Date
): string {
  const { rangeLabel } = resolveTaskRange(type, now)
  if (type === 'daily') return `${format(now, 'yyyy-MM-dd')} · 含异常提醒与明日建议`
  if (type === 'weekly') return `${rangeLabel} · 上周经营回顾`
  return `${rangeLabel} · 上月经营复盘`
}

/** 昨天的范围，供工具层复用（保留导出以兼容既有调用） */
export function yesterdayDate(now = new Date()): string {
  return format(addDays(now, -1), 'yyyy-MM-dd')
}
