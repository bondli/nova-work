/**
 * 零售经营工具集。
 * 每个工具：OpenAI function schema + zod 入参校验 + 只读 MySQL 查询。
 * 导购员会话在工具层剔除成本、进货价与毛利字段。
 */
import { execFile } from 'node:child_process'
import { format } from 'date-fns'
import { z } from 'zod'
import type { Role } from '@shared/types/auth'
import type { ArtifactMeta } from '@shared/types/analysis'
import { queryReadOnly, type SqlRow } from '../db/mysql'
import { describeArtifact, getWorkspaceDir, readWorkspaceFile, writeWorkspaceFile } from './workspace'
import { listMemories, upsertMemory } from './memory'

export interface ToolContext {
  sessionId: string
  role: Role
  messageId: string
  /** 发布产物时回调 runtime，由 runtime 推送 artifact.created */
  onArtifact: (artifact: ArtifactMeta) => void
}

export interface ToolExecutionResult {
  /** 工具卡上展示的一句话摘要 */
  summary: string
  /** 进入模型上下文的结构化结果 */
  data: unknown
}

export interface AgentToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute: (input: unknown, context: ToolContext) => Promise<ToolExecutionResult>
}

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD')
const dateRangeShape = { startDate: dateString, endDate: dateString }

/** 关联字段：导购员不可见的成本与利润字段 */
const COST_FIELD_PATTERN = /cost|purchase|grossmargin|profit/i

function parseInput<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? '参数不合法')
  }
  return parsed.data
}

function toNumber(value: unknown): number {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

/** 金额保留两位小数，比例保留四位（展示层再转百分比） */
function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function delta(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 1
  return round((current - previous) / previous, 4)
}

function stripCostFields(row: SqlRow): SqlRow {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !COST_FIELD_PATTERN.test(key))
  )
}

/** 返回给模型的列表最多 50 行，超出标记 truncated */
function trimRows(rows: SqlRow[], limit = 50): {
  rows: SqlRow[]
  returned: number
  truncated: boolean
} {
  const sliced = rows.slice(0, limit)
  return { rows: sliced, returned: sliced.length, truncated: rows.length > limit }
}

/** 区间总览：营业额、单量、客单价、连带率、会员占比、退款率、余额消耗 */
async function queryOverview(
  startDate: string,
  endDate: string
): Promise<{
  revenue: number
  orders: number
  avgTicket: number
  itemsPerOrder: number
  memberOrderRate: number
  refundRate: number
  memberBalanceConsumed: number
}> {
  const rows = await queryReadOnly(
    `SELECT
       COUNT(*) AS totalOrders,
       SUM(CASE WHEN orderStatus = 'refund' THEN 1 ELSE 0 END) AS refundOrders,
       SUM(CASE WHEN orderStatus <> 'refund' THEN orderActualAmount ELSE 0 END) AS revenue,
       SUM(CASE WHEN orderStatus <> 'refund' THEN orderItems ELSE 0 END) AS items,
       SUM(CASE WHEN orderStatus <> 'refund' AND userPhone <> '' THEN 1 ELSE 0 END) AS memberOrders,
       SUM(CASE WHEN orderStatus <> 'refund' THEN useBalance ELSE 0 END) AS balanceUsed
     FROM \`order\`
     WHERE createdAt >= ? AND createdAt < DATE_ADD(?, INTERVAL 1 DAY)`,
    [startDate, endDate]
  )

  const row = rows[0] ?? {}
  const totalOrders = toNumber(row.totalOrders)
  const refundOrders = toNumber(row.refundOrders)
  const paidOrders = totalOrders - refundOrders
  const revenue = toNumber(row.revenue)
  const items = toNumber(row.items)
  const memberOrders = toNumber(row.memberOrders)

  return {
    revenue: round(revenue),
    orders: paidOrders,
    avgTicket: paidOrders > 0 ? round(revenue / paidOrders) : 0,
    itemsPerOrder: paidOrders > 0 ? round(items / paidOrders, 2) : 0,
    memberOrderRate: paidOrders > 0 ? round(memberOrders / paidOrders, 4) : 0,
    refundRate: totalOrders > 0 ? round(refundOrders / totalOrders, 4) : 0,
    memberBalanceConsumed: round(toNumber(row.balanceUsed))
  }
}

/** 毛利率：只有管理员会话才查询成本 */
async function queryGrossMarginRate(startDate: string, endDate: string): Promise<number | null> {
  const rows = await queryReadOnly(
    `SELECT
       SUM(oi.actualPrice * oi.counts) AS sales,
       SUM(i.costPrice * oi.counts) AS cost
     FROM orderitems oi
     JOIN \`order\` o ON o.orderSn = oi.orderSn
     LEFT JOIN inventory i ON i.sku = oi.sku
     WHERE o.createdAt >= ? AND o.createdAt < DATE_ADD(?, INTERVAL 1 DAY)
       AND o.orderStatus <> 'refund'`,
    [startDate, endDate]
  )
  const row = rows[0] ?? {}
  const sales = toNumber(row.sales)
  const cost = toNumber(row.cost)
  if (sales <= 0) return null
  return round((sales - cost) / sales, 4)
}

const overviewTool: AgentToolDefinition = {
  name: 'get_business_overview',
  description: '查询指定区间的经营总览：营业额、单量、客单价、连带率、会员订单占比、退款率、余额消耗与毛利率（管理员）。',
  parameters: {
    type: 'object',
    properties: {
      startDate: { type: 'string', description: '开始日期 YYYY-MM-DD' },
      endDate: { type: 'string', description: '结束日期 YYYY-MM-DD' },
      compare: {
        type: 'string',
        enum: ['yesterday', 'lastWeek', 'lastMonth', 'none'],
        description: '对比基准，默认 yesterday'
      }
    },
    required: ['startDate', 'endDate']
  },
  async execute(input, context) {
    const params = parseInput(
      z.object({
        ...dateRangeShape,
        compare: z.enum(['yesterday', 'lastWeek', 'lastMonth', 'none']).default('yesterday')
      }),
      input
    )
    if (params.startDate > params.endDate) throw new Error('开始日期不能晚于结束日期')

    const current = await queryOverview(params.startDate, params.endDate)
    const grossMarginRate =
      context.role === 'admin'
        ? await queryGrossMarginRate(params.startDate, params.endDate)
        : null

    let comparePercent: { revenue: number; orders: number; avgTicket: number } | null = null
    if (params.compare !== 'none') {
      const days =
        Math.round(
          (new Date(`${params.endDate}T00:00:00`).getTime() -
            new Date(`${params.startDate}T00:00:00`).getTime()) /
            86_400_000
        ) + 1
      const previousEnd = new Date(`${params.startDate}T00:00:00`)
      previousEnd.setDate(previousEnd.getDate() - 1)
      const previousStart = new Date(previousEnd)
      previousStart.setDate(previousStart.getDate() - days + 1)
      const previous = await queryOverview(
        format(previousStart, 'yyyy-MM-dd'),
        format(previousEnd, 'yyyy-MM-dd')
      )
      comparePercent = {
        revenue: delta(current.revenue, previous.revenue),
        orders: delta(current.orders, previous.orders),
        avgTicket: delta(current.avgTicket, previous.avgTicket)
      }
    }

    return {
      summary: `营业额 ¥${current.revenue.toFixed(2)} · ${current.orders} 单`,
      data: {
        range: { start: params.startDate, end: params.endDate },
        metrics: { ...current, ...(grossMarginRate === null ? {} : { grossMarginRate }) },
        compare: comparePercent,
        dataUpdatedAt: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
      }
    }
  }
}

const salesTrendTool: AgentToolDefinition = {
  name: 'query_sales_trend',
  description: '按日/周/月查询销售趋势，返回每个时间点的营业额、订单数与件数。',
  parameters: {
    type: 'object',
    properties: {
      startDate: { type: 'string', description: '开始日期 YYYY-MM-DD' },
      endDate: { type: 'string', description: '结束日期 YYYY-MM-DD' },
      granularity: { type: 'string', enum: ['day', 'week', 'month'], description: '粒度，默认 day' }
    },
    required: ['startDate', 'endDate']
  },
  async execute(input) {
    const params = parseInput(
      z.object({
        ...dateRangeShape,
        granularity: z.enum(['day', 'week', 'month']).default('day')
      }),
      input
    )
    if (params.startDate > params.endDate) throw new Error('开始日期不能晚于结束日期')

    const bucket =
      params.granularity === 'month'
        ? "DATE_FORMAT(createdAt, '%Y-%m')"
        : params.granularity === 'week'
          ? "DATE_FORMAT(DATE_SUB(createdAt, INTERVAL WEEKDAY(createdAt) DAY), '%Y-%m-%d')"
          : "DATE_FORMAT(createdAt, '%Y-%m-%d')"

    const rows = await queryReadOnly(
      `SELECT ${bucket} AS period,
              SUM(orderActualAmount) AS revenue,
              COUNT(*) AS orders,
              SUM(orderItems) AS items
       FROM \`order\`
       WHERE createdAt >= ? AND createdAt < DATE_ADD(?, INTERVAL 1 DAY)
         AND orderStatus <> 'refund'
       GROUP BY period
       ORDER BY period`,
      [params.startDate, params.endDate]
    )

    const points = rows.slice(-90).map((row) => ({
      period: String(row.period ?? ''),
      revenue: round(toNumber(row.revenue)),
      orders: toNumber(row.orders),
      items: toNumber(row.items)
    }))

    return {
      summary: `${params.granularity} 粒度 · ${points.length} 个时间点`,
      data: { granularity: params.granularity, points, truncated: rows.length > 90 }
    }
  }
}

const ordersTool: AgentToolDefinition = {
  name: 'query_orders',
  description: '按日期区间查询订单列表，可按状态、支付方式、导购、关键词与金额筛选。',
  parameters: {
    type: 'object',
    properties: {
      startDate: { type: 'string', description: '开始日期 YYYY-MM-DD' },
      endDate: { type: 'string', description: '结束日期 YYYY-MM-DD' },
      status: { type: 'string', description: '订单状态：checked / uncheck / refund' },
      payType: { type: 'string', description: '支付方式：cash / weixin / alipay / card / other' },
      salerName: { type: 'string', description: '导购姓名' },
      keyword: { type: 'string', description: '订单号或会员手机号' },
      minAmount: { type: 'number', description: '最低实收金额' },
      maxAmount: { type: 'number', description: '最高实收金额' },
      limit: { type: 'number', description: '返回条数，默认 20，最大 50' }
    },
    required: ['startDate', 'endDate']
  },
  async execute(input) {
    const params = parseInput(
      z.object({
        ...dateRangeShape,
        status: z.string().trim().max(20).optional(),
        payType: z.string().trim().max(20).optional(),
        salerName: z.string().trim().max(40).optional(),
        keyword: z.string().trim().max(60).optional(),
        minAmount: z.number().nonnegative().optional(),
        maxAmount: z.number().nonnegative().optional(),
        limit: z.number().int().min(1).max(50).default(20)
      }),
      input
    )

    const conditions = [
      'createdAt >= ?',
      'createdAt < DATE_ADD(?, INTERVAL 1 DAY)'
    ]
    const values: unknown[] = [params.startDate, params.endDate]
    if (params.status) {
      conditions.push('orderStatus = ?')
      values.push(params.status)
    }
    if (params.payType) {
      conditions.push('payType = ?')
      values.push(params.payType)
    }
    if (params.salerName) {
      conditions.push('salerName = ?')
      values.push(params.salerName)
    }
    if (params.keyword) {
      conditions.push('(orderSn LIKE ? OR userPhone LIKE ?)')
      values.push(`%${params.keyword}%`, `%${params.keyword}%`)
    }
    if (params.minAmount !== undefined) {
      conditions.push('orderActualAmount >= ?')
      values.push(params.minAmount)
    }
    if (params.maxAmount !== undefined) {
      conditions.push('orderActualAmount <= ?')
      values.push(params.maxAmount)
    }

    const rows = await queryReadOnly(
      `SELECT orderSn, DATE_FORMAT(createdAt, '%Y-%m-%d %H:%i') AS time,
              orderItems, orderActualAmount, payType, salerName, orderStatus, userPhone
       FROM \`order\`
       WHERE ${conditions.join(' AND ')}
       ORDER BY createdAt DESC
       LIMIT ${params.limit}`,
      values
    )

    return {
      summary: `查询到 ${rows.length} 笔订单`,
      data: {
        orders: rows.map((row) => ({
          ...row,
          orderActualAmount: round(toNumber(row.orderActualAmount))
        }))
      }
    }
  }
}

const inventoryTool: AgentToolDefinition = {
  name: 'query_inventory',
  description: '查询库存，可按关键词、款号、SKU 与库存状态筛选。导购员结果不含成本价。',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '商品名称关键词' },
      styleNo: { type: 'string', description: '款号 sn' },
      sku: { type: 'string', description: 'SKU 条码' },
      stockStatus: { type: 'string', enum: ['all', 'low', 'out'], description: '库存状态' },
      limit: { type: 'number', description: '返回条数，默认 20，最大 50' }
    }
  },
  async execute(input, context) {
    const params = parseInput(
      z.object({
        keyword: z.string().trim().max(60).optional(),
        styleNo: z.string().trim().max(60).optional(),
        sku: z.string().trim().max(60).optional(),
        stockStatus: z.enum(['all', 'low', 'out']).default('all'),
        limit: z.number().int().min(1).max(50).default(20)
      }),
      input
    )

    const conditions = ['1 = 1']
    const values: unknown[] = []
    if (params.keyword) {
      conditions.push('name LIKE ?')
      values.push(`%${params.keyword}%`)
    }
    if (params.styleNo) {
      conditions.push('sn = ?')
      values.push(params.styleNo)
    }
    if (params.sku) {
      conditions.push('sku = ?')
      values.push(params.sku)
    }
    if (params.stockStatus === 'out') conditions.push('counts = 0')
    if (params.stockStatus === 'low') conditions.push('counts > 0 AND counts <= 5')

    const rows = await queryReadOnly(
      `SELECT sn AS styleNo, sku, name, color, size, counts AS stock,
              originalPrice AS price, costPrice, saleCounts, DATE_FORMAT(updatedAt, '%Y-%m-%d') AS lastChangedAt
       FROM inventory
       WHERE ${conditions.join(' AND ')}
       ORDER BY counts DESC
       LIMIT ${params.limit}`,
      values
    )

    const items = rows.map((row) => {
      const clean = context.role === 'admin' ? row : stripCostFields(row)
      return {
        ...clean,
        stock: toNumber(clean.stock),
        price: round(toNumber(clean.price))
      }
    })

    return { summary: `查询到 ${items.length} 个 SKU`, data: { items } }
  }
}

const slowMovingTool: AgentToolDefinition = {
  name: 'query_slow_moving',
  description: '查询滞销库存：指定天数内零动销且有库存的 SKU，按库存件数倒序。',
  parameters: {
    type: 'object',
    properties: {
      days: { type: 'number', description: '动销观察天数，默认 30' },
      limit: { type: 'number', description: '返回条数，默认 20，最大 50' }
    }
  },
  async execute(input, context) {
    const params = parseInput(
      z.object({
        days: z.number().int().min(1).max(180).default(30),
        limit: z.number().int().min(1).max(50).default(20)
      }),
      input
    )
    const since = format(new Date(Date.now() - params.days * 86_400_000), 'yyyy-MM-dd')

    const rows = await queryReadOnly(
      `SELECT * FROM (
         SELECT i.sn AS styleNo, i.sku, i.name, i.color, i.size,
                i.counts AS stock, i.originalPrice AS price, i.costPrice,
                COALESCE((
                  SELECT SUM(oi.counts) FROM orderitems oi
                  WHERE oi.sku = i.sku AND oi.createdAt >= ?
                ), 0) AS sold
         FROM inventory i
         WHERE i.counts > 0
       ) AS t
       WHERE t.sold = 0
       ORDER BY t.stock DESC
       LIMIT ${params.limit}`,
      [since]
    )

    const items = rows.map((row) => {
      const clean = context.role === 'admin' ? row : stripCostFields(row)
      return {
        ...clean,
        stock: toNumber(clean.stock),
        price: round(toNumber(clean.price)),
        stockAmount: round(toNumber(clean.stock) * toNumber(clean.price))
      }
    })

    return {
      summary: `近 ${params.days} 天零动销 ${items.length} 款`,
      data: { days: params.days, items }
    }
  }
}

const membersTool: AgentToolDefinition = {
  name: 'query_members',
  description: '查询会员列表，可按姓名/手机号、等级筛选，返回积分、余额、累计消费与券数。',
  parameters: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '姓名或手机号' },
      level: { type: 'string', description: '会员等级' },
      limit: { type: 'number', description: '返回条数，默认 20，最大 50' }
    }
  },
  async execute(input) {
    const params = parseInput(
      z.object({
        keyword: z.string().trim().max(60).optional(),
        level: z.string().trim().max(20).optional(),
        limit: z.number().int().min(1).max(50).default(20)
      }),
      input
    )
    const conditions = ['1 = 1']
    const values: unknown[] = []
    if (params.keyword) {
      conditions.push('(name LIKE ? OR phone LIKE ?)')
      values.push(`%${params.keyword}%`, `%${params.keyword}%`)
    }
    if (params.level) {
      conditions.push('level = ?')
      values.push(params.level)
    }

    const rows = await queryReadOnly(
      `SELECT id, name, phone, level, point, balance, coupon, actual,
              DATE_FORMAT(updatedAt, '%Y-%m-%d') AS lastActivityAt
       FROM member
       WHERE ${conditions.join(' AND ')}
       ORDER BY actual DESC
       LIMIT ${params.limit}`,
      values
    )

    return {
      summary: `查询到 ${rows.length} 位会员`,
      data: {
        members: rows.map((row) => ({
          ...row,
          point: toNumber(row.point),
          balance: round(toNumber(row.balance)),
          coupon: toNumber(row.coupon),
          actual: round(toNumber(row.actual))
        }))
      }
    }
  }
}

const marketingTool: AgentToolDefinition = {
  name: 'query_marketing',
  description: '查询营销活动及周期、门槛、优惠值与当前状态。',
  parameters: {
    type: 'object',
    properties: {
      startDate: { type: 'string', description: '活动开始日期下限 YYYY-MM-DD' },
      endDate: { type: 'string', description: '活动结束日期上限 YYYY-MM-DD' },
      limit: { type: 'number', description: '返回条数，默认 20，最大 50' }
    }
  },
  async execute(input) {
    const params = parseInput(
      z.object({
        startDate: dateString.optional(),
        endDate: dateString.optional(),
        limit: z.number().int().min(1).max(50).default(20)
      }),
      input
    )
    const conditions = ['1 = 1']
    const values: unknown[] = []
    if (params.startDate) {
      conditions.push('endTime >= ?')
      values.push(params.startDate)
    }
    if (params.endDate) {
      conditions.push('startTime < DATE_ADD(?, INTERVAL 1 DAY)')
      values.push(params.endDate)
    }

    const rows = await queryReadOnly(
      `SELECT id, marketingName AS name, marketingType AS type, marketingCondition AS \`condition\`,
              marketingValue AS value, startTime, endTime
       FROM marketing
       WHERE ${conditions.join(' AND ')}
       ORDER BY startTime DESC
       LIMIT ${params.limit}`,
      values
    )
    const now = Date.now()

    return {
      summary: `查询到 ${rows.length} 个活动`,
      data: {
        campaigns: rows.map((row) => {
          const start = new Date(String(row.startTime)).getTime()
          const end = new Date(String(row.endTime)).getTime()
          return {
            ...row,
            condition: round(toNumber(row.condition)),
            value: round(toNumber(row.value)),
            status: now < start ? 'pending' : now > end ? 'ended' : 'active'
          }
        })
      }
    }
  }
}

const staffTool: AgentToolDefinition = {
  name: 'query_staff_performance',
  description: '查询导购业绩：单量、销售额、客单价与退款额，仅用于经营分析内部判断。',
  parameters: {
    type: 'object',
    properties: {
      startDate: { type: 'string', description: '开始日期 YYYY-MM-DD' },
      endDate: { type: 'string', description: '结束日期 YYYY-MM-DD' },
      limit: { type: 'number', description: '返回条数，默认 10，最大 30' }
    },
    required: ['startDate', 'endDate']
  },
  async execute(input) {
    const params = parseInput(
      z.object({ ...dateRangeShape, limit: z.number().int().min(1).max(30).default(10) }),
      input
    )
    const rows = await queryReadOnly(
      `SELECT salerName,
              COUNT(*) AS orders,
              SUM(CASE WHEN orderStatus <> 'refund' THEN orderActualAmount ELSE 0 END) AS revenue,
              SUM(CASE WHEN orderStatus = 'refund' THEN orderActualAmount ELSE 0 END) AS refundAmount
       FROM \`order\`
       WHERE createdAt >= ? AND createdAt < DATE_ADD(?, INTERVAL 1 DAY)
         AND salerName <> ''
       GROUP BY salerName
       ORDER BY revenue DESC
       LIMIT ${params.limit}`,
      [params.startDate, params.endDate]
    )

    return {
      summary: `${rows.length} 位导购有业绩`,
      data: {
        staff: rows.map((row) => {
          const revenue = round(toNumber(row.revenue))
          const orders = toNumber(row.orders)
          return {
            salerName: row.salerName,
            orders,
            revenue,
            avgTicket: orders > 0 ? round(revenue / orders) : 0,
            refundAmount: round(toNumber(row.refundAmount))
          }
        })
      }
    }
  }
}

const queryDatabaseTool: AgentToolDefinition = {
  name: 'query_database',
  description:
    '兜底只读 SQL 查询。仅当内置工具无法覆盖时使用，必须为单条 SELECT 并说明原因；系统会自动限制 200 行、10 秒超时。',
  parameters: {
    type: 'object',
    properties: {
      sql: { type: 'string', description: '单条只读 SELECT，建议带时间范围或聚合' },
      reason: { type: 'string', description: '为什么内置工具无法满足' }
    },
    required: ['sql', 'reason']
  },
  async execute(input, context) {
    const params = parseInput(
      z.object({
        sql: z.string().min(1).max(5000),
        reason: z.string().trim().min(4, '请说明使用自定义 SQL 的原因').max(200)
      }),
      input
    )

    // 守卫在 mysql.ts 中再次执行；这里提前校验，便于把明确错误直接回给模型
    const rows = await queryReadOnly(params.sql)
    const cleaned = context.role === 'admin' ? rows : rows.map(stripCostFields)
    const result = trimRows(cleaned, 50)

    return {
      summary: `自定义 SQL 返回 ${result.returned} 行${result.truncated ? '（已截断）' : ''}`,
      data: {
        reason: params.reason,
        rows: result.rows,
        returned: result.returned,
        truncated: result.truncated
      }
    }
  }
}

const readTool: AgentToolDefinition = {
  name: 'read',
  description: '读取当前会话工作区内的文本文件，路径必须为相对路径。',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: '相对工作区路径' } },
    required: ['path']
  },
  async execute(input, context) {
    const params = parseInput(z.object({ path: z.string().trim().min(1) }), input)
    const content = await readWorkspaceFile(context.sessionId, params.path)
    return {
      summary: `读取 ${params.path} · ${content.length} 字符`,
      data: { path: params.path, content: content.slice(0, 8000) }
    }
  }
}

const writeTool: AgentToolDefinition = {
  name: 'write',
  description: '在当前会话工作区写入文本文件，路径必须为相对路径；报告建议写入 artifacts/ 目录。',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '相对工作区路径，例如 artifacts/今日经营日报.html' },
      content: { type: 'string', description: '文件内容' }
    },
    required: ['path', 'content']
  },
  async execute(input, context) {
    const params = parseInput(
      z.object({ path: z.string().trim().min(1).max(200), content: z.string().max(2_000_000) }),
      input
    )
    await writeWorkspaceFile(context.sessionId, params.path, params.content)
    return {
      summary: `已写入 ${params.path} · ${params.content.length} 字符`,
      data: { path: params.path, size: params.content.length }
    }
  }
}

const editTool: AgentToolDefinition = {
  name: 'edit',
  description:
    '编辑当前会话工作区内的文本文件：把 oldString 精确替换为 newString。默认要求 oldString 在文件中唯一，多处匹配需显式设置 replaceAll。',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '相对工作区路径' },
      oldString: { type: 'string', description: '要替换的原文本，需与文件内容完全一致' },
      newString: { type: 'string', description: '替换后的文本，可为空字符串表示删除' },
      replaceAll: { type: 'boolean', description: '是否替换所有匹配位置，默认 false' }
    },
    required: ['path', 'oldString', 'newString']
  },
  async execute(input, context) {
    const params = parseInput(
      z.object({
        path: z.string().trim().min(1).max(200),
        oldString: z.string().min(1, 'oldString 不能为空'),
        newString: z.string().max(2_000_000),
        replaceAll: z.boolean().default(false)
      }),
      input
    )

    const content = await readWorkspaceFile(context.sessionId, params.path)
    const matches = content.split(params.oldString).length - 1
    if (matches === 0) throw new Error(`文件中未找到指定内容：${params.path}`)
    if (matches > 1 && !params.replaceAll) {
      throw new Error(`指定内容出现 ${matches} 次，请补充上下文使其唯一，或设置 replaceAll = true`)
    }

    const next = params.replaceAll
      ? content.split(params.oldString).join(params.newString)
      : content.replace(params.oldString, params.newString)
    await writeWorkspaceFile(context.sessionId, params.path, next)

    return {
      summary: `已编辑 ${params.path} · 替换 ${matches} 处`,
      data: { path: params.path, replaced: matches }
    }
  }
}

/** 命令输出单段最多返回的字符数 */
const BASH_MAX_OUTPUT = 4000

interface BashResult {
  exitCode: number
  stdout: string
  stderr: string
  timedOut: boolean
}

function truncateOutput(text: string): string {
  if (text.length <= BASH_MAX_OUTPUT) return text
  return `${text.slice(0, BASH_MAX_OUTPUT)}\n...(输出已截断，共 ${text.length} 字符)`
}

/** 在指定目录执行 bash 命令；超时或非零退出码都作为正常结果返回给模型 */
function runBash(command: string, cwd: string, timeoutMs: number): Promise<BashResult> {
  return new Promise((resolve) => {
    execFile(
      'bash',
      ['-lc', command],
      { cwd, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout, stderr) => {
        const trimmedStdout = truncateOutput(String(stdout ?? ''))
        const trimmedStderr = truncateOutput(String(stderr ?? ''))
        if (!error) {
          resolve({ exitCode: 0, stdout: trimmedStdout, stderr: trimmedStderr, timedOut: false })
          return
        }
        const failed = error as NodeJS.ErrnoException & { killed?: boolean }
        const code = typeof failed.code === 'number' ? failed.code : 1
        resolve({
          exitCode: code,
          stdout: trimmedStdout,
          stderr: trimmedStderr || failed.message,
          timedOut: failed.killed === true
        })
      }
    )
  })
}

const bashTool: AgentToolDefinition = {
  name: 'bash',
  description:
    '在当前会话工作区执行 bash 命令（工作目录固定为工作区）。默认 30 秒超时、最长 120 秒，输出超过 4000 字符会截断；非零退出码会连同 stderr 一起返回。',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: '要执行的命令，例如 ls -la 或 node script.js' },
      timeoutMs: { type: 'number', description: '超时毫秒数，默认 30000，上限 120000' }
    },
    required: ['command']
  },
  async execute(input, context) {
    const params = parseInput(
      z.object({
        command: z.string().trim().min(1).max(4000),
        timeoutMs: z.number().int().min(1000).max(120_000).default(30_000)
      }),
      input
    )
    const cwd = getWorkspaceDir(context.sessionId)
    const result = await runBash(params.command, cwd, params.timeoutMs)
    return {
      summary: result.timedOut ? `命令超时（${params.timeoutMs}ms）` : `退出码 ${result.exitCode}`,
      data: { command: params.command, cwd: 'workspace', ...result }
    }
  }
}

const memoryReadTool: AgentToolDefinition = {
  name: 'memory_read',
  description: '读取长期记忆（静态画像 / 动态状态 / 偏好规则），可按层筛选。回答前可先确认用户偏好。',
  parameters: {
    type: 'object',
    properties: {
      layer: {
        type: 'string',
        enum: ['profile', 'state', 'preference'],
        description: '记忆层，缺省返回全部'
      }
    }
  },
  async execute(input) {
    const params = parseInput(
      z.object({ layer: z.enum(['profile', 'state', 'preference']).optional() }),
      input
    )
    const memories = await listMemories({ layer: params.layer })
    return {
      summary: `读取 ${memories.length} 条记忆`,
      data: {
        memories: memories.map((item) => ({
          id: item.id,
          layer: item.layer,
          category: item.category,
          content: item.content,
          confidence: item.confidence
        }))
      }
    }
  }
}

const memoryWriteTool: AgentToolDefinition = {
  name: 'memory_write',
  description:
    '把用户明确要求记住的稳定信息写入长期记忆。同 layer + category 会覆盖旧内容；只记录稳定的画像、状态与偏好，不要记录临时数据。',
  parameters: {
    type: 'object',
    properties: {
      layer: {
        type: 'string',
        enum: ['profile', 'state', 'preference'],
        description: 'profile 静态画像 / state 动态状态 / preference 偏好规则'
      },
      category: { type: 'string', description: '简短分类名，例如「职业」「输出风格」' },
      content: { type: 'string', description: '要记住的具体内容' },
      confidence: { type: 'number', description: '置信度 0-1，用户明确要求记住时可用 0.9' }
    },
    required: ['layer', 'category', 'content']
  },
  async execute(input, context) {
    const params = parseInput(
      z.object({
        layer: z.enum(['profile', 'state', 'preference']),
        category: z.string().trim().min(1, '分类名不能为空').max(40),
        content: z.string().trim().min(1, '内容不能为空').max(500),
        confidence: z.number().min(0).max(1).default(0.9)
      }),
      input
    )
    const memory = await upsertMemory({ ...params, sourceSession: context.sessionId })
    return { summary: `已记住「${memory.category}」`, data: { memory } }
  }
}

const publishArtifactTool: AgentToolDefinition = {
  name: 'publish_artifact',
  description: '把工作区内已写入的报告文件发布为产物，供用户在产物抽屉预览与下载。',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '相对工作区路径，必须已存在' },
      title: { type: 'string', description: '产物标题' },
      kind: { type: 'string', enum: ['html', 'csv', 'md', 'text'], description: '产物类型' }
    },
    required: ['path', 'title', 'kind']
  },
  async execute(input, context) {
    const params = parseInput(
      z.object({
        path: z.string().trim().min(1).max(200),
        title: z.string().trim().min(1).max(80),
        kind: z.enum(['html', 'csv', 'md', 'text'])
      }),
      input
    )
    const artifact = await describeArtifact(
      context.sessionId,
      params.path,
      params.title,
      context.messageId
    )
    context.onArtifact(artifact)
    return {
      summary: `已发布 ${artifact.title}`,
      data: { artifact }
    }
  }
}

/** 工具注册表；新增工具必须先更新 docs/tech-plan.md §11 */
export const AGENT_TOOLS: AgentToolDefinition[] = [
  overviewTool,
  salesTrendTool,
  ordersTool,
  inventoryTool,
  slowMovingTool,
  membersTool,
  marketingTool,
  staffTool,
  queryDatabaseTool,
  readTool,
  writeTool,
  editTool,
  bashTool,
  memoryReadTool,
  memoryWriteTool,
  publishArtifactTool
]
