/**
 * 通用格式化工具：金额与日期。
 * 只做纯函数，不依赖任何 UI 组件，便于在表格、统计卡与测试中复用。
 */

interface MoneyOptions {
  /** 正数是否显示 + 号，默认不显示 */
  sign?: boolean
  /** 币种，当前单店仅支持人民币 */
  currency?: 'CNY'
  /** 小数位，默认两位；库存、营销等整数金额可传 0 */
  decimals?: number
}

/** 金额格式化：千分位 + 两位小数，人民币默认带 ¥ 前缀 */
export function formatMoney(value: number, options: MoneyOptions = {}): string {
  const decimals = options.decimals ?? 2
  const text = new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: options.currency ?? 'CNY',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value)

  return options.sign && value > 0 ? `+${text}` : text
}

/**
 * 日期格式化为 yyyy-MM-dd。
 * 使用本地时区取值，避免 toISOString 在 UTC+8 下出现日期偏移。
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 日期区间标签，与 demo 一致：`2026-10-01 → 2026-10-23` */
export function formatDateRange(start: Date, end: Date): string {
  return `${formatDate(start)} → ${formatDate(end)}`
}

/** 最近 N 天区间（含今天），用于筛选条默认值 */
export function createRecentRange(days: number, now = new Date()): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1))
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return { start, end }
}
