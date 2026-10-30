/**
 * 数据域共享类型。
 * 现阶段由渲染层 mock 数据填充，后续接入 nova-pos-server 时字段保持不变。
 */

/** 数据页顶部 6 个事实指标 */
export interface AnalyticsSummary {
  /** 订单金额，单位元 */
  orderAmount: number
  /** 余额消耗，单位元 */
  balanceSpent: number
  orderCount: number
  soldItems: number
  /** 商品库存件数 */
  stock: number
  /** 会员余额，单位元 */
  memberBalance: number
}

/** 月营业额，金额单位元；利润率是百分数（35.6 表示 35.6%） */
export interface MonthlyRevenue {
  /** YYYY-MM */
  month: string
  sales: number
  cost: number
  profitRate: number
}

/** 日营业额，与 demo 的按天视图一致固定 30 根柱 */
export interface DailyRevenue {
  /** 1~30 */
  day: number
  /** 当日销售额，单位元 */
  amount: number
}

/** 导购员月营业额，仅金额（对齐老系统 SalerChart） */
export interface SalerMonthlyRevenue {
  /** YYYY-MM */
  month: string
  sales: number
}

/** 数据页一次查询返回的事实快照 */
export interface AnalyticsSnapshot {
  summary: AnalyticsSummary
  /** 与所选区间等长、紧邻在上一个的时间窗汇总，用于环比 */
  previousSummary: AnalyticsSummary
  /** 近 12 个月营业额 */
  months: MonthlyRevenue[]
  /** 当前登录导购近 12 个月营业额 */
  salerMonths: SalerMonthlyRevenue[]
  /** 数据截止时间 HH:mm */
  cutoff: string
}
