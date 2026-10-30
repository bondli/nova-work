import { useState } from 'react'
import { Download, PackageSearch, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { OrderFilters, OrderItemStatus } from '@shared/types/order'
import { Button } from '@renderer/components/ui/button'
import { Skeleton } from '@renderer/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import { DateRangePicker, type DateRangeValue } from '@renderer/components/common/DateRangePicker'
import { CopyableText } from '@renderer/components/common/CopyText'
import { EmptyState } from '@renderer/components/common/EmptyState'
import { Money } from '@renderer/components/common/Money'
import { SheetDrawer } from '@renderer/components/common/SheetDrawer'
import { StatusBadge } from '@renderer/components/common/StatusBadge'
import { posExport } from '@renderer/lib/pos'
import { formatDate, createRecentRange } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { useOrderGoodsQuery } from './queries'

/** 商品行状态文案与语义色，与订单详情保持一致 */
const ITEM_STATUS: Record<
  OrderItemStatus,
  { label: string; tone: 'success' | 'danger' | 'warning' }
> = {
  normal: { label: '正常', tone: 'success' },
  refund: { label: '有退货', tone: 'danger' },
  exchangein: { label: '换货追进', tone: 'warning' }
}

interface OrderGoodsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** 抽屉内默认查询近 7 天，与列表页当天默认区间区分开 */
const DEFAULT_RANGE: DateRangeValue = createRecentRange(7)

/**
 * 列宽按 720px 抽屉等比分配（合计 100%），配合 table-fixed 保证不出现横向滚动。
 * 订单号 / 实付金额跨行合并，其余列按商品逐行展开；列与文案对齐老系统 OrderItemList。
 */
const COLUMNS = [
  { title: '订单号', width: 'w-[20%]' },
  { title: '实付金额', width: 'w-[13%]' },
  { title: '条码', width: 'w-[19%]' },
  { title: '数量 / 状态', width: 'w-[14%]' },
  { title: '尺码 / 颜色', width: 'w-[20%]' },
  { title: '实付金额', width: 'w-[14%]' }
] as const

/** 把抽屉内的日期区间转成查询条件，商品明细不分页 */
function toFilters(range: DateRangeValue): OrderFilters {
  return {
    orderSn: '',
    memberPhone: '',
    start: formatDate(range.start),
    end: formatDate(range.end),
    clerk: '',
    payment: 'all',
    page: 1,
    pageSize: 1000
  }
}

/**
 * 订单商品抽屉：按日期区间展开订单内的商品行。
 * 区间先存草稿，点「查询」后才生效，与列表页交互一致。
 */
export function OrderGoodsSheet({ open, onOpenChange }: OrderGoodsSheetProps) {
  const [draftRange, setDraftRange] = useState<DateRangeValue>(DEFAULT_RANGE)
  const [appliedRange, setAppliedRange] = useState<DateRangeValue>(DEFAULT_RANGE)

  const { data, isLoading } = useOrderGoodsQuery(toFilters(appliedRange), open)
  const rows = data?.rows ?? []

  /** 导出内容始终与当前已生效区间一致；Excel 由服务端生成，格式与老系统一致 */
  async function handleExport(): Promise<void> {
    const start = formatDate(appliedRange.start)
    const end = formatDate(appliedRange.end)
    try {
      const result = await posExport({
        path: '/order/exportOrderItemList',
        body: { start, end },
        filename: `订单商品[${start}~${end}].xlsx`
      })
      if (result.filePath) toast.success(`已导出订单商品明细：${result.filePath}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导出失败')
    }
  }

  /** 按订单分组，用于跨行合并订单号 / 实付金额 */
  const groups = rows.reduce<Array<{ orderNo: string; rows: typeof rows }>>((list, row) => {
    const last = list[list.length - 1]
    if (last && last.orderNo === row.orderNo) {
      last.rows.push(row)
    } else {
      list.push({ orderNo: row.orderNo, rows: [row] })
    }
    return list
  }, [])

  return (
    <SheetDrawer
      open={open}
      onOpenChange={onOpenChange}
      width="xl"
      title="订单商品"
      description={open ? `${data?.orderCount ?? 0} 单 · ${data?.itemCount ?? 0} 件` : undefined}
      headerActions={
        <Button type="button" variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          导出
        </Button>
      }
      bodyClassName="flex min-h-0 flex-col gap-0 p-0"
      footer={
        <div className="flex w-full items-center justify-between text-ui text-muted-foreground">
          <span>
            共 {data?.orderCount ?? 0} 单 · {data?.itemCount ?? 0} 件商品
          </span>
          <span>导出内容与当前日期区间一致</span>
        </div>
      }
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <DateRangePicker value={draftRange} onChange={setDraftRange} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setAppliedRange(draftRange)
            toast.success('已按日期区间查询订单商品')
          }}
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          查询
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title="暂无订单商品"
            description="当前日期区间内没有订单，试试调整区间后重新查询"
            className="min-h-64"
          />
        ) : (
          <Table className="table-fixed text-body">
            <TableHeader className="sticky top-0 z-10 bg-surface">
              <TableRow className="hover:bg-transparent">
                {COLUMNS.map((column) => (
                  <TableHead key={column.title} className={cn('px-1.5', column.width)}>
                    <span className="text-meta font-medium">{column.title}</span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) =>
                group.rows.map((row, rowIndex) => (
                  <TableRow
                    key={`${row.orderNo}-${row.sku}-${rowIndex}`}
                    className="hover:bg-surface"
                  >
                    {rowIndex === 0 ? (
                      <>
                        <TableCell
                          rowSpan={group.rows.length}
                          className="px-1.5 align-top text-ui font-medium tnum"
                        >
                          {row.orderNo}
                        </TableCell>
                        <TableCell rowSpan={group.rows.length} className="px-1.5 align-top">
                          <Money value={row.orderAmount} bold className="text-destructive" />
                        </TableCell>
                      </>
                    ) : null}
                    <TableCell className="px-1.5">
                      <CopyableText text={row.sku} textClassName="text-ui tnum" label="条码" />
                    </TableCell>
                    <TableCell className="px-1.5">
                      <p className="tnum">{row.quantity}</p>
                      <StatusBadge status={ITEM_STATUS[row.itemStatus].tone}>
                        {ITEM_STATUS[row.itemStatus].label}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="px-1.5">
                      <p className="text-ui tnum">吊牌价：￥{row.originalPrice.toFixed(2)}</p>
                      <p className="truncate text-meta text-muted-foreground">
                        [{row.color} / {row.size}]
                      </p>
                    </TableCell>
                    <TableCell className="px-1.5">
                      <Money value={row.actualPrice} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </SheetDrawer>
  )
}
