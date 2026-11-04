import { useEffect, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Gift } from 'lucide-react'
import { toast } from 'sonner'
import type { RedeemItem, RedeemOrder, RedeemOrderFilters, RedeemOrderStatus } from '@shared/types/redeem'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import { Button } from '@renderer/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { DataTable } from '@renderer/components/common/DataTable'
import { PaginationBar } from '@renderer/components/common/PaginationBar'
import { SheetDrawer } from '@renderer/components/common/SheetDrawer'
import { StatusBadge, type StatusTone } from '@renderer/components/common/StatusBadge'
import { useRedeemOrdersQuery, useVerifyRedeemOrder } from './queries'

const PAGE_SIZE = 20

const STATUS_META: Record<RedeemOrderStatus, { label: string; tone: StatusTone }> = {
  pending_pickup: { label: '待取货', tone: 'warning' },
  picked: { label: '已核销', tone: 'success' },
  cancelled: { label: '已取消', tone: 'neutral' },
  expired: { label: '已过期', tone: 'danger' }
}

const STATUS_OPTIONS: Array<{ value: RedeemOrderFilters['status']; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'pending_pickup', label: '待取货' },
  { value: 'picked', label: '已核销' },
  { value: 'expired', label: '已过期' },
  { value: 'cancelled', label: '已取消' }
]

function createDefaultFilters(): RedeemOrderFilters {
  return { status: 'all', page: 1, pageSize: PAGE_SIZE }
}

interface RedeemOrdersDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: RedeemItem | null
}

/**
 * 礼品兑换记录抽屉：
 * 展示该礼品全部兑换单，待取货且未过期的记录可由店员核销。
 * 过期未核销的记录由服务端读取时判为「已过期」，前端只负责展示。
 */
export function RedeemOrdersDrawer({ open, onOpenChange, item }: RedeemOrdersDrawerProps) {
  const [filters, setFilters] = useState<RedeemOrderFilters>(createDefaultFilters)
  const [pendingVerify, setPendingVerify] = useState<RedeemOrder | null>(null)
  const verifyMutation = useVerifyRedeemOrder()

  const { data, isLoading, error } = useRedeemOrdersQuery(item?.id ?? null, filters, open)

  // 切换礼品时回到第一页与全部状态，避免沿用上一个礼品的筛选
  useEffect(() => {
    if (open) setFilters(createDefaultFilters())
  }, [open, item?.id])

  function confirmVerify() {
    const order = pendingVerify
    if (!order) return
    verifyMutation.mutate(order.id, {
      onSuccess: () => {
        toast.success('核销成功')
        setPendingVerify(null)
      },
      onError: (mutationError) => {
        toast.error(mutationError instanceof Error ? mutationError.message : '核销失败')
      }
    })
  }

  const columns: ColumnDef<RedeemOrder>[] = [
    {
      accessorKey: 'phone',
      header: '会员',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.memberName || '未填写姓名'}</span>
          <span className="tnum text-meta text-muted-foreground">{row.original.phone}</span>
        </div>
      )
    },
    {
      accessorKey: 'pickupCode',
      header: '取货码',
      cell: ({ row }) => <span className="tnum font-medium">{row.original.pickupCode}</span>
    },
    {
      accessorKey: 'points',
      header: '积分',
      cell: ({ row }) => (
        <span className="tnum">{row.original.points.toLocaleString('zh-CN')} 分</span>
      )
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => {
        const meta = STATUS_META[row.original.status]
        return <StatusBadge status={meta.tone}>{meta.label}</StatusBadge>
      }
    },
    {
      accessorKey: 'createdAt',
      header: '兑换时间',
      cell: ({ row }) => (
        <span className="tnum text-ui text-muted-foreground">{row.original.createdAt}</span>
      )
    },
    {
      accessorKey: 'expiredAt',
      header: '取货截止',
      cell: ({ row }) => (
        <span className="tnum text-ui text-muted-foreground">{row.original.expiredAt}</span>
      )
    },
    {
      accessorKey: 'pickedAt',
      header: '核销时间',
      cell: ({ row }) => (
        <span className="tnum text-ui text-muted-foreground">
          {row.original.pickedAt ?? '—'}
        </span>
      )
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">操作</span>,
      cell: ({ row }) =>
        row.original.status === 'pending_pickup' ? (
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => setPendingVerify(row.original)}>
              核销
            </Button>
          </div>
        ) : null
    }
  ]

  return (
    <SheetDrawer
      open={open}
      onOpenChange={onOpenChange}
      width="2xl"
      title={item ? `${item.name} · 兑换记录` : '兑换记录'}
      description={
        item
          ? `剩余库存 ${item.stock} / ${item.totalStock} · 已兑 ${item.redeemedCount} 件`
          : undefined
      }
      bodyClassName="flex min-h-0 flex-col gap-3 p-3"
    >
      <div className="flex shrink-0 items-center gap-2">
        <Select
          value={filters.status}
          onValueChange={(value) =>
            setFilters((current) => ({
              ...current,
              status: value as RedeemOrderFilters['status'],
              page: 1
            }))
          }
        >
          <SelectTrigger className="h-8 w-[140px] text-ui" aria-label="兑换状态">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-ui">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-meta text-muted-foreground">
          点击「核销」表示会员已到店领取实物
        </span>
      </div>

      <DataTable
        className="min-h-[320px]"
        columns={columns}
        data={data?.rows ?? []}
        rowKey="id"
        isLoading={isLoading}
        error={error ? (error as Error).message : undefined}
        empty={{
          icon: Gift,
          title: '暂无兑换记录',
          description: '会员在小程序兑换该礼品后会出现在这里'
        }}
        footer={
          <div className="p-3">
            <PaginationBar
              total={data?.total ?? 0}
              page={filters.page}
              pageSize={filters.pageSize}
              unit="条兑换记录"
              onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
            />
          </div>
        }
      />

      <AlertDialog
        open={pendingVerify !== null}
        onOpenChange={(next) => {
          if (!next) setPendingVerify(null)
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>确认核销</AlertDialogTitle>
            <AlertDialogDescription>
              确认会员「{pendingVerify?.memberName || pendingVerify?.phone}」已领取「
              {pendingVerify?.itemName}」？核销后不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmVerify} disabled={verifyMutation.isPending}>
              {verifyMutation.isPending ? '核销中' : '确认核销'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SheetDrawer>
  )
}
