import type { ColumnDef } from '@tanstack/react-table'
import { ImageIcon } from 'lucide-react'
import type { RedeemItem } from '@shared/types/redeem'
import { Button } from '@renderer/components/ui/button'
import { StatusBadge } from '@renderer/components/common/StatusBadge'
import { REDEEM_ITEM_STATUS } from './api'

interface RedeemItemColumnsOptions {
  /** 编辑仅管理员可用；兑换记录与核销对店员开放 */
  isAdmin: boolean
  onEdit: (item: RedeemItem) => void
  onOrders: (item: RedeemItem) => void
}

/**
 * 积分兑换礼品列定义。
 * 库存同时展示剩余与总量，已兑数量由服务端计算，便于店员判断备货情况。
 */
export function createRedeemItemColumns({
  isAdmin,
  onEdit,
  onOrders
}: RedeemItemColumnsOptions): ColumnDef<RedeemItem>[] {
  return [
    {
      accessorKey: 'name',
      header: '礼品',
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
            {row.original.image ? (
              <img src={row.original.image} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{row.original.name}</span>
            <span className="truncate text-meta text-muted-foreground">
              {row.original.description || '—'}
            </span>
          </div>
        </div>
      )
    },
    {
      accessorKey: 'points',
      header: '所需积分',
      cell: ({ row }) => (
        <span className="tnum">
          {row.original.points.toLocaleString('zh-CN')} 分
        </span>
      )
    },
    {
      accessorKey: 'stock',
      header: '库存',
      cell: ({ row }) => (
        <span className="tnum">
          <span className={row.original.stock <= 0 ? 'text-destructive' : undefined}>
            {row.original.stock}
          </span>
          <span className="text-muted-foreground"> / {row.original.totalStock}</span>
          <span className="ml-2 text-meta text-muted-foreground">
            已兑 {row.original.redeemedCount}
          </span>
        </span>
      )
    },
    {
      accessorKey: 'perMemberLimit',
      header: '每人限兑',
      cell: ({ row }) => <span className="tnum">{row.original.perMemberLimit} 件</span>
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => (
        <StatusBadge status={row.original.status === 'active' ? 'success' : 'neutral'}>
          {REDEEM_ITEM_STATUS[row.original.status]}
        </StatusBadge>
      )
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">操作</span>,
      cell: ({ row }) => {
        const item = row.original
        return (
          <div className="flex justify-end gap-0.5 whitespace-nowrap">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-primary hover:text-primary"
              onClick={() => onOrders(item)}
            >
              兑换记录
            </Button>
            {isAdmin ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(item)}>
                编辑
              </Button>
            ) : null}
          </div>
        )
      }
    }
  ]
}
