import { useEffect, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { History } from 'lucide-react'
import type { StockFlowRow } from '@shared/types/inventory'
import { Input } from '@renderer/components/ui/input'
import { DataTable } from '@renderer/components/common/DataTable'
import { CopyableText } from '@renderer/components/common/CopyText'
import { SheetDrawer } from '@renderer/components/common/SheetDrawer'
import { cn } from '@renderer/lib/utils'
import { useStockFlowsQuery } from './queries'

interface SkuRecordSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** 流水列，字段与顺序对齐老系统 Inventory/SkuRecord */
const COLUMNS: ColumnDef<StockFlowRow>[] = [
  {
    accessorKey: 'sku',
    header: '商品',
    cell: ({ row }) => (
      <CopyableText text={row.original.sku} textClassName="font-medium tnum" label="条码" />
    )
  },
  {
    accessorKey: 'typeText',
    header: '变动类型',
    cell: ({ row }) => <span className="text-ui">{row.original.typeText}</span>
  },
  {
    accessorKey: 'quantity',
    header: '变动数量',
    cell: ({ row }) => (
      <span
        className={cn(
          'tnum font-medium',
          row.original.quantity >= 0 ? 'text-success' : 'text-destructive'
        )}
      >
        {row.original.quantity >= 0 ? `+${row.original.quantity}` : row.original.quantity}
      </span>
    )
  },
  {
    accessorKey: 'detail',
    header: '变动明细',
    cell: ({ row }) => (
      <span className="text-ui text-muted-foreground">{row.original.detail}</span>
    )
  },
  {
    accessorKey: 'time',
    header: '变动时间',
    cell: ({ row }) => (
      <span className="tnum text-ui text-muted-foreground">{row.original.time}</span>
    )
  }
]

/**
 * 商品流水抽屉，对齐老系统 Inventory/SkuRecord：
 * 条码输入满 13 位自动查询，输入过程中按回车也可查询。
 */
export function SkuRecordSheet({ open, onOpenChange }: SkuRecordSheetProps) {
  const [draftSku, setDraftSku] = useState('')
  const [sku, setSku] = useState<string | null>(null)

  // 关闭时清空条码与结果，下次打开回到初始态
  useEffect(() => {
    if (!open) {
      setDraftSku('')
      setSku(null)
    }
  }, [open])

  const { data, isLoading, error } = useStockFlowsQuery(sku, open && Boolean(sku))
  const rows = data ?? []

  function handleSearch() {
    const value = draftSku.trim()
    setSku(value || null)
  }

  /** 条码为 13 位标准 EAN，输入完整时自动查询，无需点击按钮 */
  function handleChange(value: string) {
    setDraftSku(value)
    if (value.trim().length === 13) setSku(value.trim())
  }

  return (
    <SheetDrawer
      open={open}
      onOpenChange={onOpenChange}
      width="xl"
      title="商品流水"
      description="输入 13 位条码自动查询，或按回车查询"
      bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
      footer={
        <div className="flex w-full items-center justify-between text-ui text-muted-foreground">
          <span className="tnum">共 {rows.length} 条</span>
          <span>按变动时间倒序</span>
        </div>
      }
    >
      <form
        className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault()
          handleSearch()
        }}
      >
        <Input
          className="h-8 w-[220px]"
          placeholder="输入条码"
          aria-label="条码"
          value={draftSku}
          onChange={(event) => handleChange(event.target.value)}
        />
      </form>

      <DataTable
        columns={COLUMNS}
        data={rows}
        rowKey="id"
        isLoading={isLoading && Boolean(sku)}
        error={error ? (error as Error).message : undefined}
        empty={{
          icon: History,
          title: sku ? '暂无流水记录' : '请输入条码查询',
          description: sku
            ? '该商品没有库存变动记录'
            : '输入 13 位条码会自动查询，也可输入后按回车'
        }}
        className="min-h-0 flex-1 rounded-none border-0"
      />
    </SheetDrawer>
  )
}
