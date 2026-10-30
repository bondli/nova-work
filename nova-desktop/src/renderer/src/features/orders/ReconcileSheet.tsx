import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import type { OrderFilters, ReconcileRow } from '@shared/types/order'
import { Button } from '@renderer/components/ui/button'
import { DataTable } from '@renderer/components/common/DataTable'
import { Money } from '@renderer/components/common/Money'
import { StatusBadge } from '@renderer/components/common/StatusBadge'
import { SheetDrawer } from '@renderer/components/common/SheetDrawer'
import { formatDate } from '@renderer/lib/format'
import { PAYMENT_LABEL } from './labels'
import { ReconcileStatusBadge } from './ReconcileStatusBadge'
import { useReconcileQuery, useConfirmReceipt, useToggleOrderShow } from './queries'

interface ReconcileSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  filters: OrderFilters
}

/**
 * 订单对账抽屉，列与操作对齐老系统 Order/CheckBill：
 * 订单号 / 实付金额 / 支付方式 / 会员 / 对账状态 / 打印状态 / 有效状态 / 操作。
 */
export function ReconcileSheet({ open, onOpenChange, filters }: ReconcileSheetProps) {
  // 与 demo 一致：对账只看今日，其余筛选条件（导购 / 支付方式）沿用列表页
  const today = formatDate(new Date())
  const effectiveFilters: OrderFilters = { ...filters, start: today, end: today }
  const { data, isLoading } = useReconcileQuery(effectiveFilters, open)
  const confirmMutation = useConfirmReceipt()
  const toggleMutation = useToggleOrderShow()

  const rows = data?.rows ?? []
  const pendingRows = rows.filter((row) => !row.done)

  const columns = useMemo<ColumnDef<ReconcileRow>[]>(
    () => [
      {
        accessorKey: 'no',
        header: '订单号',
        cell: ({ row }) => <span className="font-medium">{row.original.no}</span>
      },
      {
        accessorKey: 'amount',
        header: '实付金额',
        cell: ({ row }) => (
          <Money value={row.original.amount} bold className="text-destructive" />
        )
      },
      {
        accessorKey: 'payment',
        header: '支付方式',
        cell: ({ row }) => PAYMENT_LABEL[row.original.payment]
      },
      {
        accessorKey: 'memberPhone',
        header: '会员',
        cell: ({ row }) => (
          <span className="tnum text-ui">{row.original.memberPhone || '—'}</span>
        )
      },
      {
        accessorKey: 'done',
        header: '对账状态',
        cell: ({ row }) => <ReconcileStatusBadge done={row.original.done} withIcon />
      },
      {
        accessorKey: 'printed',
        header: '打印状态',
        cell: ({ row }) => (
          <StatusBadge status={row.original.printed ? 'success' : 'warning'}>
            {row.original.printed ? '已打印' : '未打印'}
          </StatusBadge>
        )
      },
      {
        accessorKey: 'hidden',
        header: '有效状态',
        cell: ({ row }) => (
          <StatusBadge status={row.original.hidden ? 'danger' : 'success'}>
            {row.original.hidden ? '无效' : '正常'}
          </StatusBadge>
        )
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
              disabled={row.original.done}
              onClick={() => confirmMutation.mutate(row.original.no)}
            >
              确认到账
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-primary hover:text-primary"
              disabled={toggleMutation.isPending}
              onClick={() =>
                toggleMutation.mutate({ no: row.original.no, hidden: row.original.hidden })
              }
            >
              {row.original.hidden ? '恢复正常' : '置为无效'}
            </Button>
          </div>
        )
      }
    ],
    [confirmMutation, toggleMutation]
  )

  return (
    <SheetDrawer
      open={open}
      onOpenChange={onOpenChange}
      width="2xl"
      title="订单对账"
      description={open ? `今日 · ${rows.length} 单` : undefined}
      bodyClassName="flex min-h-0 flex-col p-0"
    >
      <div className="grid shrink-0 grid-cols-3 gap-2 border-b border-border bg-surface px-4 py-3 text-center">
        <div>
          <p className="text-meta text-muted-foreground">已确认到账</p>
          <p className="mt-0.5 text-title font-semibold tnum">
            <Money value={data?.paidTotal ?? 0} />
          </p>
        </div>
        <div>
          <p className="text-meta text-muted-foreground">待确认</p>
          <p className="mt-0.5 text-title font-semibold tnum text-warning">
            <Money value={data?.pendingTotal ?? 0} />
          </p>
        </div>
        <div>
          <p className="text-meta text-muted-foreground">待确认单数</p>
          <p className="mt-0.5 text-title font-semibold tnum">{pendingRows.length}</p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        rowKey="no"
        isLoading={isLoading}
        className="min-h-0 flex-1 rounded-none border-0"
        empty={{ title: '暂无对账记录', description: '当前筛选区间内没有可对账的订单' }}
      />
    </SheetDrawer>
  )
}
