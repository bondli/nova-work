import { useMemo, useState } from 'react'
import {
  Boxes,
  ChevronDown,
  History,
  Layers,
  Package,
  PackageMinus,
  PackagePlus,
  Plus,
  ScanLine,
  Shirt,
  TriangleAlert
} from 'lucide-react'
import type {
  InventoryFilters,
  InventoryRow,
  InventoryScope,
  StockAction
} from '@shared/types/inventory'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Input } from '@renderer/components/ui/input'
import { DataTable, type SortState } from '@renderer/components/common/DataTable'
import { FilterBar, FilterField } from '@renderer/components/common/FilterBar'
import { PaginationBar } from '@renderer/components/common/PaginationBar'
import { SegmentedControl } from '@renderer/components/common/SegmentedControl'
import { StatCard } from '@renderer/components/common/StatCard'
import { useAuthStore } from '@renderer/stores/auth-store'
import { createInventoryColumns } from '@renderer/features/inventory/columns'
import { useInventoryQuery } from '@renderer/features/inventory/queries'
import { SkuRecordSheet } from '@renderer/features/inventory/SkuRecordSheet'
import { InventoryDetailSheet } from '@renderer/features/inventory/InventoryDetailSheet'
import { InventoryEditorDialog } from '@renderer/features/inventory/InventoryEditorDialog'
import { ProductImageDialog } from '@renderer/features/inventory/ProductImageDialog'
import { BatchStockDialog } from '@renderer/features/inventory/BatchStockDialog'
import { SingleStockDialog } from '@renderer/features/inventory/SingleStockDialog'

const PAGE_SIZE = 10

/** 筛选条草稿：与查询条件分开保存，点「查询」才生效 */
interface DraftFilters {
  /** 条码 / 款号 / 商品名称，一个输入框覆盖三种查询 */
  query: string
}

const EMPTY_DRAFT: DraftFilters = { query: '' }

/** 扫码枪输入的条码：13 位纯数字，输满即自动查询 */
const SCAN_BARCODE = /^\d{13}$/

/**
 * 库存中心：指标卡 + 分类筛选 + 库存表格 + 分页。
 * 详情 / 编辑 / 图片预览 / 商品流水 / 批量出入库由页面统一管理状态。
 */
export function InventoryPage() {
  const role = useAuthStore((state) => state.user?.role)
  const canViewCost = role !== 'clerk'
  // 单件新增会新建商品并写入库存，老系统仅管理员可用
  const isAdmin = role === 'admin'

  const [draft, setDraft] = useState<DraftFilters>(EMPTY_DRAFT)
  const [sort, setSort] = useState<SortState | null>(null)
  const [filters, setFilters] = useState<InventoryFilters>({
    scope: 'all',
    keyword: '',
    orderby: '',
    page: 1,
    pageSize: PAGE_SIZE
  })

  const [flowOpen, setFlowOpen] = useState(false)
  const [detailRow, setDetailRow] = useState<InventoryRow | null>(null)
  const [editRow, setEditRow] = useState<InventoryRow | null>(null)
  const [imageRow, setImageRow] = useState<InventoryRow | null>(null)
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchAction, setBatchAction] = useState<StockAction | null>(null)
  const [singleOpen, setSingleOpen] = useState(false)

  const { data, isLoading, error } = useInventoryQuery(filters)
  const summary = data?.summary

  const columns = useMemo(
    () =>
      createInventoryColumns({
        canViewCost,
        onView: (row) => setDetailRow(row),
        onEdit: (row) => setEditRow(row),
        onPreviewImage: (row) => setImageRow(row)
      }),
    [canViewCost]
  )

  // 断码计数来自全量概览，进入断码分类后数字不随筛选变化
  const scopes = useMemo(
    () => [
      { key: 'all', label: '全部库存' },
      { key: 'broken', label: '断码', count: summary?.brokenStyleCount },
      { key: 'hot', label: '热销' }
    ],
    [summary?.brokenStyleCount]
  )

  function handleScopeChange(scope: string) {
    setFilters((current) => ({ ...current, scope: scope as InventoryScope, page: 1 }))
  }

  function handleSubmit() {
    const keyword = draft.query.trim()
    // 输入框有值时先回到「全部库存」，避免在断码/热销分类下查不到目标商品
    setFilters((current) => ({
      ...current,
      scope: keyword ? 'all' : current.scope,
      keyword,
      page: 1
    }))
  }

  /** 输入框变更：13 位纯数字条码视为扫码完成，立即查询，不依赖回车 */
  function handleQueryChange(value: string) {
    setDraft({ query: value })
    if (SCAN_BARCODE.test(value.trim())) {
      setFilters((current) => ({ ...current, scope: 'all', keyword: value.trim(), page: 1 }))
    }
  }

  function handleReset() {
    setDraft(EMPTY_DRAFT)
    setSort(null)
    setFilters((current) => ({ ...current, keyword: '', orderby: '', page: 1 }))
  }

  /** 表头点击排序：同步服务端 orderby，并回到第一页 */
  function handleSortChange(next: SortState | null) {
    setSort(next)
    setFilters((current) => ({
      ...current,
      orderby: next ? `${next.key} ${next.order}` : '',
      page: 1
    }))
  }

  /** 打开批量操作弹窗，动作由菜单项决定 */
  function openBatch(action: StockAction) {
    setBatchAction(action)
    setBatchOpen(true)
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4">
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="款式总数"
          value={(summary?.styleCount ?? 0).toLocaleString('zh-CN')}
          icon={Layers}
        />
        <StatCard
          label="库存总量"
          value={(summary?.stockTotal ?? 0).toLocaleString('zh-CN')}
          icon={Boxes}
        />
        <StatCard
          label="已售总数"
          value={(summary?.soldTotal ?? 0).toLocaleString('zh-CN')}
          icon={Shirt}
        />
        <StatCard
          label="断码款数"
          value={(summary?.brokenStyleCount ?? 0).toLocaleString('zh-CN')}
          icon={TriangleAlert}
          tone="warning"
        />
      </div>

      <FilterBar
        onSubmit={handleSubmit}
        onReset={handleReset}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFlowOpen(true)}
            >
              <History className="h-3.5 w-3.5" aria-hidden="true" />
              商品流水
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <Package className="h-3.5 w-3.5" aria-hidden="true" />
                  批量操作
                  <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[150px] p-1">
                <DropdownMenuItem
                  className="gap-2 px-2.5 py-2 text-ui"
                  onSelect={() => openBatch('batch-in')}
                >
                  <PackagePlus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  批量入库
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 px-2.5 py-2 text-ui"
                  onSelect={() => openBatch('batch-out')}
                >
                  <PackageMinus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  批量退库
                </DropdownMenuItem>
                {isAdmin ? (
                  <DropdownMenuItem
                    className="gap-2 px-2.5 py-2 text-ui"
                    onSelect={() => setSingleOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    单件新增
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      >
        <SegmentedControl value={filters.scope} options={scopes} onChange={handleScopeChange} />

        <FilterField label="条码 / 款号 / 商品名称">
          <div className="relative">
            <ScanLine
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
              aria-hidden="true"
            />
            <Input
              className="h-8 w-[230px] pl-8 tnum"
              aria-label="条码、款号或商品名称"
              value={draft.query}
              onChange={(event) => handleQueryChange(event.target.value)}
            />
          </div>
        </FilterField>
      </FilterBar>

      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        rowKey="id"
        isLoading={isLoading}
        error={error ? (error as Error).message : undefined}
        sort={sort}
        onSortChange={handleSortChange}
        empty={{
          icon: Package,
          title: '暂无库存',
          description: '换个分类或清空查询条件后再试'
        }}
        footer={
          <div className="p-3">
            <PaginationBar
              total={data?.total ?? 0}
              page={filters.page}
              pageSize={filters.pageSize}
              onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
            />
          </div>
        }
      />

      <SkuRecordSheet open={flowOpen} onOpenChange={setFlowOpen} />
      <InventoryDetailSheet
        row={detailRow}
        canViewCost={canViewCost}
        onClose={() => setDetailRow(null)}
      />
      <InventoryEditorDialog row={editRow} onClose={() => setEditRow(null)} />
      <ProductImageDialog row={imageRow} onClose={() => setImageRow(null)} />
      <BatchStockDialog open={batchOpen} onOpenChange={setBatchOpen} action={batchAction} />
      <SingleStockDialog open={singleOpen} onOpenChange={setSingleOpen} />
    </div>
  )
}
