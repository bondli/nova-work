import type {
  BatchStockPreview,
  BatchStockResult,
  BatchStockRow,
  InventoryCreateInput,
  InventoryFilters,
  InventoryListResult,
  InventoryRow,
  InventorySummary,
  InventoryUpdateInput,
  StockAction,
  StockFlowRow
} from '@shared/types/inventory'
import { posExport, posGet, posPost } from '@renderer/lib/pos'
import { colorHex } from '@renderer/lib/product-color'

/**
 * 库存域数据访问层（D6 已接入 nova-pos-server）。
 * 列表、概览与流水均来自服务端；人工出入库通过调整 SKU 库存实现。
 */

interface ServerInventory {
  id: number
  sn: string
  sku: string
  name: string
  color: string
  size: string
  brand: string | null
  costPrice: string | number | null
  originalPrice: string | number | null
  saleCounts: number | null
  counts: number | null
  createdAt: string
}

interface ServerRecord {
  id: number
  sku: string
  count: number
  info: string | null
  type: string
  extra: string | null
  createdAt: string
}

interface ServerList<T> {
  count: number
  data: T[]
}

/** 热销口径：累计售出 2 件及以上 */
const HOT_SOLD_THRESHOLD = 2

function toNumber(value: string | number | null | undefined): number {
  const result = Number(value ?? 0)
  return Number.isFinite(result) ? result : 0
}

function toInventoryRow(item: ServerInventory): InventoryRow {
  const stock = item.counts ?? 0
  return {
    id: String(item.id),
    styleNo: item.sn,
    sku: item.sku,
    name: item.name,
    brand: item.brand ?? '',
    color: item.color,
    size: item.size,
    colorHex: colorHex(item.color),
    counts: stock,
    originalPrice: toNumber(item.originalPrice),
    costPrice: toNumber(item.costPrice),
    saleCounts: item.saleCounts ?? 0,
    brokenStyle: stock <= 0
  }
}

/** 断码 / 热销接口只支持单一 keyword，即合并后的条码 / 款号 / 商品名称 */
function fallbackKeyword(filters: InventoryFilters): string | undefined {
  return filters.keyword.trim() || undefined
}

/** 按分类选择列表接口，字段与排序交给服务端处理 */
async function fetchRows(filters: InventoryFilters): Promise<ServerList<ServerInventory>> {
  if (filters.scope === 'broken') {
    return posGet<ServerList<ServerInventory>>('/inventory/getNoStockList', {
      pageSize: filters.pageSize,
      current: filters.page,
      keyword: fallbackKeyword(filters)
    })
  }
  if (filters.scope === 'hot') {
    return posGet<ServerList<ServerInventory>>('/inventory/getHotSalesList', {
      pageSize: filters.pageSize,
      current: filters.page,
      minSaleCounts: HOT_SOLD_THRESHOLD,
      keyword: fallbackKeyword(filters)
    })
  }
  return posGet<ServerList<ServerInventory>>('/inventory/queryList', {
    pageSize: filters.pageSize,
    current: filters.page,
    // keyword 在服务端按「款号 / 条码 / 名称」取或匹配，一个输入框覆盖三种查询
    keyword: filters.keyword.trim() || undefined,
    orderby: filters.orderby || undefined
  })
}

/** 库存列表：分类 + 组合筛选 + 分页；概览来自全量聚合接口 */
export async function fetchInventory(filters: InventoryFilters): Promise<InventoryListResult> {
  const [list, summary] = await Promise.all([
    fetchRows(filters),
    posGet<InventorySummary>('/inventory/summary')
  ])

  return {
    rows: (list.data ?? []).map(toInventoryRow),
    total: list.count ?? 0,
    summary
  }
}

/** 单条 SKU 明细，供详情 / 编辑抽屉回填 */
export async function fetchInventoryDetail(sku: string): Promise<InventoryRow | null> {
  const item = await posGet<ServerInventory>('/inventory/queryDetailBySku', { sku })
  if (!item || !item.sku) return null
  return toInventoryRow(item)
}

/** 该款号下的全部 SKU 列表，库存详情抽屉使用 */
export async function fetchStyleSkus(sn: string): Promise<InventoryRow[]> {
  const list = await posGet<ServerList<ServerInventory>>('/inventory/queryByStyle', { sn })
  return (list.data ?? []).map(toInventoryRow)
}

/** 单件新增入库：条码已存在时服务端返回业务错误 */
export async function createInventory(input: InventoryCreateInput): Promise<void> {
  await posPost('/inventory/create', input)
}

/** 更新 SKU：老系统只允许改库存，其余字段只读回填 */
export async function updateInventory(input: InventoryUpdateInput): Promise<void> {
  await posPost('/inventory/update', input, { sku: input.sku })
}

/** 变动类型文案，对齐老系统 INVENTORY_CHANGE_TYPE */
const FLOW_TYPE_TEXT: Record<string, string> = {
  in: '采购',
  sale: '售出',
  exchangeOut: '换货出库',
  return: '退货',
  returnIn: '退货回库',
  exchangeIn: '换货回库',
  adjust: '人工调整'
}

/** 出库类型，数量展示为负 */
const FLOW_OUTBOUND = new Set(['sale', 'exchangeOut', 'return'])

/** 服务端时间 2026-10-26 19:50:14 → YYYY-MM-DD HH:mm:ss */
function formatFlowTime(value: string): string {
  const text = String(value).replace('T', ' ')
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 19) : text
}

function toFlowRow(record: ServerRecord): StockFlowRow {
  const sign = FLOW_OUTBOUND.has(record.type) ? -1 : 1
  return {
    id: String(record.id),
    sku: record.sku,
    typeText: FLOW_TYPE_TEXT[record.type] ?? record.type,
    quantity: sign * Math.abs(record.count),
    detail: record.info ?? '—',
    time: formatFlowTime(record.createdAt)
  }
}

/** 商品流水：指定 SKU 时查该 SKU，否则取全店最近 100 条 */
export async function fetchStockFlows(sku: string | null): Promise<StockFlowRow[]> {
  const list = sku
    ? await posGet<ServerList<ServerRecord>>('/inventory/skuRecord', { sku })
    : await posGet<ServerList<ServerRecord>>('/inventory/records', { pageSize: 100, current: 1 })

  return (list.data ?? []).map(toFlowRow)
}

/** 批量入库 / 退库的预处理接口，对齐老系统 BitchStock */
function batchProcessPath(action: StockAction): string {
  return action === 'batch-in'
    ? '/inventory/batchProcessPurchaseData'
    : '/inventory/batchProcessReturnsData'
}

function batchCommitPath(action: StockAction): string {
  return action === 'batch-in' ? '/inventory/batchCreate' : '/inventory/batchReturns'
}

interface ServerBatchPreview {
  dataList?: BatchStockRow[]
  totalCount?: number
}

/** Excel 解析后交由服务端做重复合并与类型标记 */
export async function processBatchStock(
  action: StockAction,
  rows: BatchStockRow[]
): Promise<BatchStockPreview> {
  const result = await posPost<ServerBatchPreview>(batchProcessPath(action), { dataList: rows })
  return {
    rows: result?.dataList ?? [],
    totalCount: result?.totalCount ?? 0
  }
}

/** 执行批量入库 / 退库，返回成功与失败数量 */
export async function commitBatchStock(
  action: StockAction,
  rows: BatchStockRow[],
  billNo: string
): Promise<BatchStockResult> {
  const result = await posPost<{ totalCount?: number; errorCount?: number }>(
    batchCommitPath(action),
    { dataList: rows, billNo }
  )
  return {
    totalCount: result?.totalCount ?? 0,
    errorCount: result?.errorCount ?? 0
  }
}

/** 下载批量出入库模板，返回保存路径；用户取消时为 null */
export async function downloadBatchTemplate(action: StockAction): Promise<string | null> {
  const result = await posExport({
    path: '/inventory/template',
    body: { type: action === 'batch-in' ? 'purchase' : 'returns' },
    filename: action === 'batch-in' ? '入库单.xlsx' : '退库单.xlsx'
  })
  return result.filePath
}
