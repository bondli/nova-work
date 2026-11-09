import type { ReactNode } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import type { InventoryRow } from '@shared/types/inventory'
import { Boxes } from 'lucide-react'
import { TableCell, TableRow } from '@renderer/components/ui/table'
import { DataTable } from '@renderer/components/common/DataTable'
import { CopyableText } from '@renderer/components/common/CopyText'
import { DetailEmptyRow, DetailTable, DETAIL_CELL } from '@renderer/components/common/DetailTable'
import { Money } from '@renderer/components/common/Money'
import { SheetDrawer } from '@renderer/components/common/SheetDrawer'
import { cn } from '@renderer/lib/utils'
import { useStockFlowsQuery, useStyleSkusQuery } from './queries'

/** 详情抽屉里只展示该条码最近几条流水，完整记录走工具栏「商品流水」 */
const RECENT_FLOW_LIMIT = 5

interface InventoryDetailSheetProps {
  /** 为 null 时抽屉关闭 */
  row: InventoryRow | null
  /** 成本价仅管理员可见 */
  canViewCost: boolean
  onClose: () => void
}

/** 该款下 SKU 列表列，字段对齐老系统 Inventory/skuColumns */
const SKU_COLUMNS: ColumnDef<InventoryRow>[] = [
  {
    accessorKey: 'sku',
    header: '条码',
    cell: ({ row }) => (
      <div className="min-w-0">
        <CopyableText
          text={row.original.sku}
          textClassName="font-medium tnum"
          label="条码"
          className="max-w-full"
        />
        <p className="truncate text-meta text-muted-foreground">{row.original.name}</p>
      </div>
    )
  },
  { accessorKey: 'color', header: '颜色' },
  { accessorKey: 'size', header: '尺码' },
  {
    accessorKey: 'counts',
    header: '库存',
    cell: ({ row }) => (
      <span className={row.original.counts === 0 ? 'font-semibold text-destructive tnum' : 'tnum'}>
        {row.original.counts}
      </span>
    )
  },
  {
    accessorKey: 'saleCounts',
    header: '销量',
    cell: ({ row }) => <span className="tnum">{row.original.saleCounts}</span>
  }
]

/**
 * 库存详情抽屉，结构与老系统 Inventory/Detail 一致：
 * 商品信息（名称 / 品牌 / 款号 / 条码 / 颜色 / 尺码 / 吊牌价 /[成本价]/ 库存 / 销量）+ 该款下 SKU 列表。
 */
export function InventoryDetailSheet({ row, canViewCost, onClose }: InventoryDetailSheetProps) {
  const { data: skus = [], isLoading } = useStyleSkusQuery(row?.styleNo ?? null, Boolean(row))
  const { data: flows = [], isLoading: flowsLoading } = useStockFlowsQuery(
    row?.sku ?? null,
    Boolean(row)
  )
  const recentFlows = flows.slice(0, RECENT_FLOW_LIMIT)

  const fields: Array<{ label: string; value: ReactNode }> = row
    ? [
        { label: '商品名称', value: row.name },
        { label: '品牌', value: row.brand || '—' },
        { label: '款号', value: <CopyableText text={row.styleNo} label="款号" /> },
        { label: '条码', value: <CopyableText text={row.sku} label="条码" /> },
        { label: '颜色', value: row.color || '—' },
        { label: '尺码', value: row.size || '—' },
        { label: '吊牌价', value: <Money value={row.originalPrice} /> },
        ...(canViewCost ? [{ label: '成本价', value: <Money value={row.costPrice} /> }] : []),
        {
          label: '库存',
          value: (
            <span className={row.counts === 0 ? 'font-semibold text-destructive' : ''}>
              {row.counts}
            </span>
          )
        },
        { label: '销量', value: row.saleCounts }
      ]
    : []

  return (
    <SheetDrawer
      open={Boolean(row)}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      width="xl"
      title="库存详情"
      description={row ? `${row.styleNo} · ${row.sku}` : undefined}
      bodyClassName="flex min-h-0 flex-col gap-3"
    >
      {row ? (
        <>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border text-ui">
            {fields.map((field) => (
              <div key={field.label} className="flex bg-card">
                <dt className="w-[76px] shrink-0 bg-surface px-3 py-2 text-meta text-muted-foreground">
                  {field.label}
                </dt>
                <dd className="min-w-0 flex-1 truncate px-3 py-2">{field.value}</dd>
              </div>
            ))}
          </dl>

          <h3 className="text-ui font-semibold">商品流水</h3>
          <DetailTable
            columns={['商品', '变动类型', '变动数量', '变动明细', '变动时间']}
            className="shrink-0"
          >
            {flowsLoading ? (
              <DetailEmptyRow colSpan={5}>加载中…</DetailEmptyRow>
            ) : recentFlows.length === 0 ? (
              <DetailEmptyRow colSpan={5}>暂无流水记录</DetailEmptyRow>
            ) : (
              recentFlows.map((flow) => (
                <TableRow key={flow.id} className="border-border/60 hover:bg-surface">
                  <TableCell className={cn(DETAIL_CELL, 'font-medium tnum')}>{flow.sku}</TableCell>
                  <TableCell className={DETAIL_CELL}>{flow.typeText}</TableCell>
                  <TableCell
                    className={cn(
                      DETAIL_CELL,
                      'tnum font-medium',
                      flow.quantity >= 0 ? 'text-success' : 'text-destructive'
                    )}
                  >
                    {flow.quantity >= 0 ? `+${flow.quantity}` : flow.quantity}
                  </TableCell>
                  <TableCell className={cn(DETAIL_CELL, 'text-muted-foreground')}>
                    {flow.detail}
                  </TableCell>
                  <TableCell className={cn(DETAIL_CELL, 'tnum text-muted-foreground')}>
                    {flow.time}
                  </TableCell>
                </TableRow>
              ))
            )}
          </DetailTable>
          {flows.length > recentFlows.length ? (
            <p className="text-meta text-muted-foreground">
              仅展示最近 {RECENT_FLOW_LIMIT} 条，完整流水请用工具栏「商品流水」查询
            </p>
          ) : null}

          <h3 className="text-ui font-semibold">该款下 SKU 列表</h3>
          <DataTable
            columns={SKU_COLUMNS}
            data={skus}
            rowKey="sku"
            isLoading={isLoading}
            stickyHeader={false}
            empty={{
              icon: Boxes,
              title: '暂无 SKU',
              description: '该款号下没有可展示的 SKU'
            }}
          />
        </>
      ) : null}
    </SheetDrawer>
  )
}
