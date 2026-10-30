import type { ColumnDef } from '@tanstack/react-table'
import { Banknote, CircleDollarSign, CreditCard, Info, MessageCircle, Wallet } from 'lucide-react'
import type { Order, PaymentMethod } from '@shared/types/order'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { Money } from '@renderer/components/common/Money'
import { StatusBadge } from '@renderer/components/common/StatusBadge'
import { PAYMENT_LABEL } from './labels'
import { ReconcileStatusBadge } from './ReconcileStatusBadge'

interface OrderColumnsOptions {
  onView: (order: Order) => void
  onEdit: (order: Order) => void
  onPrint: (order: Order) => void
  onRefund: (order: Order) => void
  onExchange: (order: Order) => void
}

/** 实付金额右侧的抵扣明细，对齐老系统 Popover「优惠使用详情」 */
function DeductionPopover({ order }: { order: Order }) {
  const rows = [
    order.coupon ? { label: '优惠券', value: order.coupon } : null,
    order.usePoint ? { label: '积分', value: order.usePoint } : null,
    order.balanceUsed ? { label: '余额', value: order.balanceUsed } : null
  ].filter((row): row is { label: string; value: number } => Boolean(row))

  if (rows.length === 0) return null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-warning transition-colors hover:text-warning/80"
          aria-label="优惠使用详情"
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[180px] p-0">
        <p className="border-b border-border px-3 py-2 text-meta font-medium">优惠使用详情</p>
        <dl className="space-y-1 px-3 py-2 text-ui">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="tnum">{row.value.toFixed(2)}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  )
}

/** 列表时间去掉年份，只保留「月-日 时:分」；输入形如 2026-10-26 16:19 */
function shortPaidAt(value: string): string {
  return value.length >= 16 ? value.slice(5) : value
}

/** 支付方式图标配色与手机端保持一致 */
const PAYMENT_ICON: Record<PaymentMethod, { icon: typeof Wallet; color: string; soft: string }> = {
  wechat: { icon: MessageCircle, color: '#16a34a', soft: '#dcfce7' },
  alipay: { icon: Wallet, color: '#2563eb', soft: '#dbeafe' },
  cash: { icon: Banknote, color: '#d97706', soft: '#fef3c7' },
  card: { icon: CreditCard, color: '#4f46e5', soft: '#eef2ff' },
  other: { icon: CircleDollarSign, color: '#71717a', soft: '#f4f4f5' }
}

/** 订单列表列定义，列顺序与文案对齐老系统 Order/columns */
export function createOrderColumns({
  onView,
  onEdit,
  onPrint,
  onRefund,
  onExchange
}: OrderColumnsOptions): ColumnDef<Order>[] {
  return [
    {
      accessorKey: 'no',
      header: '订单号',
      cell: ({ row }) => {
        const no = (
          <span
            className={row.original.remark ? 'font-medium text-warning' : 'font-medium'}
            aria-label={row.original.remark ? `备注：${row.original.remark}` : undefined}
          >
            {row.original.no}
          </span>
        )
        // 有备注的订单用颜色区分，hover 时展示完整备注内容
        if (!row.original.remark) return no
        return (
          <Tooltip>
            <TooltipTrigger asChild>{no}</TooltipTrigger>
            <TooltipContent side="top" className="max-w-[280px] whitespace-pre-wrap">
              备注：{row.original.remark}
            </TooltipContent>
          </Tooltip>
        )
      }
    },
    {
      accessorKey: 'itemCount',
      header: '商品数量',
      cell: ({ row }) => <span className="tnum">{row.original.itemCount}</span>
    },
    {
      accessorKey: 'payable',
      header: '应付金额',
      cell: ({ row }) =>
        row.original.isRecharge ? (
          <span className="text-ui text-muted-foreground">会员充值</span>
        ) : (
          <Money value={row.original.payable} />
        )
    },
    {
      accessorKey: 'amount',
      header: '实付金额',
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1">
          <Money value={row.original.amount} bold className="text-destructive" />
          <DeductionPopover order={row.original} />
        </span>
      )
    },
    {
      accessorKey: 'payment',
      header: '支付方式',
      cell: ({ row }) => {
        const kind = PAYMENT_ICON[row.original.payment] ?? PAYMENT_ICON.other
        const Icon = kind.icon
        return (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span
              className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px]"
              style={{ backgroundColor: kind.soft }}
            >
              <Icon className="h-3.5 w-3.5" style={{ color: kind.color }} aria-hidden="true" />
            </span>
            <span>{PAYMENT_LABEL[row.original.payment]}</span>
          </span>
        )
      }
    },
    {
      accessorKey: 'memberPhone',
      header: '会员',
      cell: ({ row }) => (
        <span className="tnum text-ui">{row.original.memberPhone || '—'}</span>
      )
    },
    {
      accessorKey: 'paidAt',
      header: '时间',
      cell: ({ row }) => (
        <span className="tnum text-ui text-muted-foreground">{shortPaidAt(row.original.paidAt)}</span>
      )
    },
    {
      accessorKey: 'clerk',
      header: '导购员',
      cell: ({ row }) => <span>{row.original.clerk || '—'}</span>
    },
    {
      accessorKey: 'checked',
      header: '对账状态',
      cell: ({ row }) => <ReconcileStatusBadge done={row.original.checked} />
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
            修改
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="text-muted-foreground">
                更多
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[130px] p-1">
              <DropdownMenuItem className="px-2.5 py-2 text-ui" onSelect={() => onPrint(row.original)}>
                打印小票
              </DropdownMenuItem>
              <DropdownMenuItem className="px-2.5 py-2 text-ui" onSelect={() => onRefund(row.original)}>
                退货
              </DropdownMenuItem>
              <DropdownMenuItem
                className="px-2.5 py-2 text-ui"
                onSelect={() => onExchange(row.original)}
              >
                换货
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )
    }
  ]
}
