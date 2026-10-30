import type { ColumnDef } from '@tanstack/react-table'
import { X } from 'lucide-react'
import type { CartItem } from '@shared/types/buy'
import { Button } from '@renderer/components/ui/button'
import { Money } from '@renderer/components/common/Money'
import { lineSubtotal, roundMoney } from '@renderer/lib/pricing'
import { DiscountInput } from './DiscountInput'
import { QuantityInput } from './QuantityInput'

interface CartColumnsOptions {
  onQtyChange: (id: string, qty: number) => void
  onDiscountChange: (id: string, discount: number) => void
  onRemove: (id: string) => void
}

/** 颜色：优先取独立字段，历史挂单从 spec 兜底 */
function lineColor(item: CartItem): string {
  if (item.color) return item.color
  const [color] = item.spec.split('/')
  return color?.trim() || '—'
}

/** 尺码：优先取独立字段，历史挂单从 spec 兜底 */
function lineSize(item: CartItem): string {
  if (item.size) return item.size
  const [, size] = item.spec.split('/')
  return size?.trim() || '—'
}

/** 销售价 = 吊牌价 × 折扣率 */
function salePrice(item: CartItem): number {
  return roundMoney((item.price * item.discount) / 10)
}

/**
 * 待售清单列定义（对齐老系统 WaitSaleList）：
 * 商品（SKU + 名称）、颜色、尺码、单价（吊牌价 + 销售价）、折扣、数量、小计、操作。
 */
export function createCartColumns({
  onQtyChange,
  onDiscountChange,
  onRemove
}: CartColumnsOptions): ColumnDef<CartItem>[] {
  return [
    {
      accessorKey: 'name',
      header: '商品',
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-caption font-semibold text-white/90"
            style={{ backgroundColor: row.original.colorHex }}
            aria-hidden="true"
          >
            {row.original.name.slice(0, 1)}
          </span>
          <div className="min-w-0">
            {/* 名称在前、款号紧随，保持既有单元格可访问名；SKU 与款号相同时不重复展示 */}
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="mt-0.5 truncate text-meta text-muted-foreground">
              {row.original.styleNo}
              {row.original.sku && row.original.sku !== row.original.styleNo
                ? ` · ${row.original.sku}`
                : ''}
            </p>
          </div>
        </div>
      )
    },
    {
      accessorKey: 'color',
      header: '颜色',
      cell: ({ row }) => (
        <span className="block max-w-[96px] truncate text-ui" title={lineColor(row.original)}>
          {lineColor(row.original)}
        </span>
      )
    },
    {
      accessorKey: 'size',
      header: '尺码',
      cell: ({ row }) => (
        <span className="block max-w-[140px] truncate text-ui tnum" title={lineSize(row.original)}>
          {lineSize(row.original)}
        </span>
      )
    },
    {
      id: 'price',
      header: '单价',
      cell: ({ row }) => (
        <div>
          <Money value={salePrice(row.original)} bold />
          <p className="mt-0.5 text-meta text-muted-foreground line-through">
            <Money value={row.original.price} className="text-muted-foreground" />
          </p>
        </div>
      )
    },
    {
      accessorKey: 'discount',
      header: () => <div className="text-center">折扣</div>,
      cell: ({ row }) => (
        <DiscountInput
          value={row.original.discount}
          label={`${row.original.name} 折扣`}
          onCommit={(discount) => onDiscountChange(row.original.id, discount)}
        />
      )
    },
    {
      id: 'qty',
      header: '数量',
      cell: ({ row }) => (
        <QuantityInput
          value={row.original.qty}
          label={`${row.original.name} 数量`}
          onChange={(qty) => onQtyChange(row.original.id, qty)}
        />
      )
    },
    {
      id: 'subtotal',
      header: () => <div className="text-right">小计</div>,
      cell: ({ row }) => (
        <div className="text-right">
          <Money value={lineSubtotal(row.original)} bold />
        </div>
      )
    },
    {
      id: 'actions',
      header: () => <span className="text-center">操作</span>,
      cell: ({ row }) => (
        <div className="text-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`移除 ${row.original.name}`}
            onClick={() => onRemove(row.original.id)}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      )
    }
  ]
}
