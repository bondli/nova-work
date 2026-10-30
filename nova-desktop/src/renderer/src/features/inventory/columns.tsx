import type { ColumnDef } from '@tanstack/react-table'
import { ImageIcon } from 'lucide-react'
import type { InventoryRow } from '@shared/types/inventory'
import { Button } from '@renderer/components/ui/button'
import { CopyableText } from '@renderer/components/common/CopyText'
import { Money } from '@renderer/components/common/Money'

interface InventoryColumnsOptions {
  /** 导购员不可见成本列（红线 9） */
  canViewCost: boolean
  onView: (row: InventoryRow) => void
  onEdit: (row: InventoryRow) => void
  onPreviewImage: (row: InventoryRow) => void
}

/** 库存数量：0 危险色、低于 10 警告色，其余正文色 */
function renderStock(counts: number) {
  if (counts === 0) return <span className="font-semibold text-destructive tnum">0</span>
  if (counts < 10) return <span className="font-medium text-warning tnum">{counts}</span>
  return <span className="tnum">{counts}</span>
}

/**
 * 库存列表列定义，列顺序与文案对齐老系统 Inventory/columns：
 * 款号（含名称 / 图片预览）、条码、名称、颜色、尺码、吊牌价、[成本价]、库存、销量、操作。
 */
export function createInventoryColumns({
  canViewCost,
  onView,
  onEdit,
  onPreviewImage
}: InventoryColumnsOptions): ColumnDef<InventoryRow>[] {
  const columns: ColumnDef<InventoryRow>[] = [
    {
      accessorKey: 'styleNo',
      header: '款号',
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            className="relative flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-lg text-caption font-semibold text-white/90 transition-opacity hover:opacity-80"
            style={{ backgroundColor: row.original.colorHex }}
            aria-label={`预览 ${row.original.styleNo} 图片`}
            onClick={() => onPreviewImage(row.original)}
          >
            {row.original.name.slice(0, 1)}
            <span className="absolute inset-x-0 bottom-0 hidden h-3.5 items-center justify-center bg-black/45 group-hover:flex">
              <ImageIcon className="h-2.5 w-2.5" aria-hidden="true" />
            </span>
          </button>
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.styleNo}</p>
            <p className="mt-0.5 truncate text-meta text-muted-foreground">{row.original.name}</p>
          </div>
        </div>
      )
    },
    {
      accessorKey: 'sku',
      header: '条码',
      cell: ({ row }) => (
        <CopyableText text={row.original.sku} textClassName="tnum text-ui" label="条码" />
      )
    },
    { accessorKey: 'name', header: '名称' },
    { accessorKey: 'color', header: '颜色' },
    { accessorKey: 'size', header: '尺码' },
    {
      accessorKey: 'originalPrice',
      header: '吊牌价',
      cell: ({ row }) => <Money value={row.original.originalPrice} decimals={0} />
    },
    ...(canViewCost
      ? [
          {
            accessorKey: 'costPrice',
            header: '成本价',
            cell: ({ row }) => (
              <Money
                value={row.original.costPrice}
                decimals={0}
                className="text-muted-foreground"
              />
            )
          } satisfies ColumnDef<InventoryRow>
        ]
      : []),
    {
      accessorKey: 'counts',
      header: '库存',
      meta: { sortKey: 'counts' },
      cell: ({ row }) => renderStock(row.original.counts)
    },
    {
      accessorKey: 'saleCounts',
      header: '销量',
      meta: { sortKey: 'saleCounts' },
      cell: ({ row }) => <span className="tnum">{row.original.saleCounts}</span>
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">操作</span>,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-primary hover:text-primary"
            onClick={() => onView(row.original)}
          >
            详情
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-primary hover:text-primary"
            onClick={() => onEdit(row.original)}
          >
            编辑
          </Button>
        </div>
      )
    }
  ]

  return columns
}
