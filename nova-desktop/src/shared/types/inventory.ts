/**
 * 库存域共享类型。
 * 字段与文案对齐老系统 apps/web/src/pages/Inventory。
 */

/** 顶部快捷分类：全部 / 断码 / 热销 */
export type InventoryScope = 'all' | 'broken' | 'hot'

/** 库存行，粒度为 SKU */
export interface InventoryRow {
  id: string
  /** 款号 */
  styleNo: string
  /** 条码 */
  sku: string
  name: string
  brand: string
  color: string
  size: string
  /** 商品首字色块颜色，与 demo 的 swatch 一致 */
  colorHex: string
  /** 库存 */
  counts: number
  /** 吊牌价 */
  originalPrice: number
  /** 成本价，仅管理员可见 */
  costPrice: number
  /** 销量 */
  saleCounts: number
  /** 同款任一 SKU 库存为 0 时标记为断码款 */
  brokenStyle: boolean
}

/** 库存列表查询条件，对齐老系统 Inventory/search */
export interface InventoryFilters {
  scope: InventoryScope
  /** 条码 / 款号 / 商品名称：服务端按 keyword 在款号 / 条码 / 名称间取「或」匹配 */
  keyword: string
  /** 排序：counts desc / counts asc / saleCounts desc / saleCounts asc，空为默认排序 */
  orderby: string
  page: number
  pageSize: number
}

/** 库存概览指标，按全量数据统计，不随筛选变化 */
export interface InventorySummary {
  styleCount: number
  stockTotal: number
  soldTotal: number
  brokenStyleCount: number
}

export interface InventoryListResult {
  rows: InventoryRow[]
  /** 满足筛选条件的 SKU 行数 */
  total: number
  summary: InventorySummary
}

/** 单条库存流水，字段与文案对齐老系统 Inventory/SkuRecord */
export interface StockFlowRow {
  id: string
  /** 商品条码 */
  sku: string
  /** 变动类型文案：采购 / 售出 / 换货出库 / 退货 / 换货回库 / 人工调整 */
  typeText: string
  /** 变动数量，出库为负、入库为正 */
  quantity: number
  /** 变动明细 */
  detail: string
  /** 变动时间，格式 YYYY-MM-DD HH:mm:ss */
  time: string
}

/** 批量出入库操作类型 */
export type StockAction = 'batch-in' | 'batch-out'

/** 单件新增入库参数，字段对齐老系统 Inventory/SingleStock */
export interface InventoryCreateInput {
  /** 款号 */
  sn: string
  /** 条码 */
  sku: string
  name: string
  brand: string
  color: string
  size: string
  /** 吊牌价 */
  originalPrice: number
  /** 成本价 */
  costPrice: number
  /** 入库库存 */
  counts: number
}

/** 批量出入库的 Excel 行，键为表头（入库为中文、退库为服务端英文键） */
export type BatchStockRow = Record<string, string | number | undefined>

/** Excel 预处理结果 */
export interface BatchStockPreview {
  rows: BatchStockRow[]
  /** Excel 中的商品总数量 */
  totalCount: number
}

/** 批量出入库执行结果 */
export interface BatchStockResult {
  totalCount: number
  errorCount: number
}

/** 库存编辑提交参数，对齐老系统 Inventory/Editor */
export interface InventoryUpdateInput {
  sku: string
  sn: string
  name: string
  brand: string
  color: string
  size: string
  counts: number
}
