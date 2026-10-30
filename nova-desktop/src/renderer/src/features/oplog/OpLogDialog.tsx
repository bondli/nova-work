import { useEffect, useState } from 'react'
import { Info, ScrollText } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { DataTable } from '@renderer/components/common/DataTable'
import { DateRangePicker, type DateRangeValue } from '@renderer/components/common/DateRangePicker'
import { FilterBar, FilterField } from '@renderer/components/common/FilterBar'
import { PaginationBar } from '@renderer/components/common/PaginationBar'
import { StatusBadge, type StatusTone } from '@renderer/components/common/StatusBadge'
import { useUiStore } from '@renderer/stores/ui-store'
import { posGet } from '@renderer/lib/pos'
import { createRecentRange, formatDate } from '@renderer/lib/format'

/** 服务端 OpLog 行，字段与 nova-pos-server 的 OpLog 模型一致 */
interface OpLogRow {
  id: number
  type: string
  info: string | null
  userId: string | null
  /** 服务端按 userId 关联出的操作人姓名；老库用户已删除时为空 */
  userName?: string | null
  createdAt: string
  /** 客户端系统；老库无数据时为缺省 */
  userOS?: string | null
  /** 客户端版本；老库无数据时为缺省 */
  appVersion?: string | null
}

/** 服务端日志类型 → 中文名与语义色 */
const TYPE_META: Record<string, { label: string; tone: StatusTone }> = {
  return: { label: '订单退货', tone: 'danger' },
  exchange: { label: '订单换货', tone: 'warning' },
  modifyOrder: { label: '修改订单', tone: 'neutral' },
  inCome: { label: '会员充值', tone: 'brand' },
  modifyInventory: { label: '修改库存', tone: 'warning' },
  purchaseInventory: { label: '批量入库', tone: 'success' },
  returnInventory: { label: '批量退库', tone: 'danger' }
}

/** 筛选下拉选项：文案与老系统 search.tsx 完全一致（不带「订单 / 会员」前缀） */
const TYPE_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'return', label: '退货' },
  { value: 'exchange', label: '换货' },
  { value: 'modifyOrder', label: '修改订单' },
  { value: 'inCome', label: '充值' },
  { value: 'modifyInventory', label: '修改库存' },
  { value: 'purchaseInventory', label: '批量入库' },
  { value: 'returnInventory', label: '批量退库' }
]

/** 默认筛选区间：近 7 天 */
const DEFAULT_RANGE: DateRangeValue = createRecentRange(7)

/** 单页条数：9 条一页 */
const PAGE_SIZE = 9

/** 日志展示时间：MM-dd HH:mm */
function formatLogTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (input: number): string => String(input).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const COLUMNS: ColumnDef<OpLogRow>[] = [
  {
    accessorKey: 'createdAt',
    header: '时间',
    cell: ({ row }) => (
      <span className="text-muted-foreground tnum">{formatLogTime(row.original.createdAt)}</span>
    )
  },
  {
    accessorKey: 'type',
    header: '类型',
    cell: ({ row }) => {
      const meta = TYPE_META[row.original.type] ?? {
        label: row.original.type,
        tone: 'neutral' as StatusTone
      }
      return <StatusBadge status={meta.tone}>{meta.label}</StatusBadge>
    }
  },
  {
    accessorKey: 'userId',
    header: '操作人',
    cell: ({ row }) => {
      const operator = row.original.userName || (row.original.userId ? `#${row.original.userId}` : '—')
      return (
        <div className="flex items-center gap-1">
          <span className="text-ui">{operator}</span>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="查看系统与版本"
                className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[208px] p-3">
              <div className="space-y-1.5 text-meta">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">操作系统</span>
                  <span className="text-foreground">{row.original.userOS || '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">客户端版本</span>
                  <span className="text-foreground tnum">{row.original.appVersion || '—'}</span>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )
    }
  },
  {
    accessorKey: 'info',
    header: '详情',
    cell: ({ row }) => (
      <span
        className="block max-w-[420px] truncate text-ui"
        title={row.original.info ?? undefined}
      >
        {row.original.info ?? '—'}
      </span>
    )
  }
]

/**
 * 操作日志弹窗：日期区间 + 类型筛选 → 表格 → 分页。
 * 数据来自 nova-pos-server 的 GET /common/opLogs，筛选与分页都由服务端完成。
 */
export function OpLogDialog() {
  const open = useUiStore((state) => state.dialogs.oplog)
  const setDialogOpen = useUiStore((state) => state.setDialogOpen)

  const [rangeDraft, setRangeDraft] = useState<DateRangeValue>(DEFAULT_RANGE)
  const [range, setRange] = useState<DateRangeValue>(DEFAULT_RANGE)
  const [typeDraft, setTypeDraft] = useState('all')
  const [type, setType] = useState('all')
  const [page, setPage] = useState(1)

  const [rows, setRows] = useState<OpLogRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(undefined)

    void (async () => {
      try {
        const result = await posGet<{ count: number; data: OpLogRow[] }>('/common/opLogs', {
          start: formatDate(range.start),
          end: formatDate(range.end),
          type: type === 'all' ? undefined : type,
          pageSize: PAGE_SIZE,
          current: page
        })
        if (cancelled) return
        setRows(result.data ?? [])
        setTotal(result.count ?? 0)
      } catch (requestError) {
        if (cancelled) return
        setRows([])
        setTotal(0)
        setError(requestError instanceof Error ? requestError.message : '加载操作日志失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, range, type, page])

  function handleQuery() {
    setRange(rangeDraft)
    setType(typeDraft)
    setPage(1)
  }

  function handleReset() {
    setRangeDraft(DEFAULT_RANGE)
    setRange(DEFAULT_RANGE)
    setTypeDraft('all')
    setType('all')
    setPage(1)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => setDialogOpen('oplog', next)}>
      <DialogContent className="flex h-[680px] w-[900px] max-w-[calc(100vw-64px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[900px]">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 text-left">
          <DialogTitle className="text-title font-semibold">操作日志</DialogTitle>
          <DialogDescription className="text-meta text-muted-foreground">
            记录关键业务操作，便于审计与追溯
          </DialogDescription>
        </DialogHeader>

        <FilterBar
          className="shrink-0 rounded-none border-0 border-b bg-transparent px-5 py-3"
          onSubmit={handleQuery}
          onReset={handleReset}
          loading={loading}
        >
          <FilterField label="操作时间">
            <DateRangePicker value={rangeDraft} onChange={setRangeDraft} />
          </FilterField>
          <FilterField label="操作类型">
            <Select value={typeDraft} onValueChange={setTypeDraft}>
              <SelectTrigger size="sm" className="h-8 w-[130px] text-xs" aria-label="操作类型">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
        </FilterBar>

        <div className="flex min-h-0 flex-1 flex-col px-5 py-3">
          <DataTable
            columns={COLUMNS}
            data={rows}
            rowKey="id"
            isLoading={loading}
            error={error}
            className="rounded-none border-0"
            empty={{
              icon: ScrollText,
              title: '暂无操作记录',
              description: '调整日期区间或操作类型后重新查询'
            }}
            footer={
              <PaginationBar
                className="px-5 py-3"
                total={total}
                page={page}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
