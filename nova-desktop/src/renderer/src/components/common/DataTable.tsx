import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowData
} from '@tanstack/react-table'
import { AlertCircle, ChevronDown, ChevronUp, ChevronsUpDown, Inbox } from 'lucide-react'
import { EmptyState } from '@renderer/components/common/EmptyState'
import { Skeleton } from '@renderer/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import { cn } from '@renderer/lib/utils'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** 声明后表头可点击排序，值为服务端排序字段（如 counts / saleCounts） */
    sortKey?: string
  }
}

/** 表头排序状态，key 为服务端排序字段，order 为升降序 */
export interface SortState {
  key: string
  order: 'asc' | 'desc'
}

interface DataTableEmpty {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}

interface DataTableProps<TData> {
  columns: ColumnDef<TData>[]
  data: TData[]
  /** 行主键：字段名或取值函数 */
  rowKey: keyof TData | ((row: TData) => string)
  isLoading?: boolean
  /** 加载失败提示；传入后优先于空态展示 */
  error?: string
  empty?: DataTableEmpty
  /** 表格上方工具区（如批量操作） */
  toolbar?: ReactNode
  /** 表格下方固定区（如分页条） */
  footer?: ReactNode
  onRowClick?: (row: TData) => void
  /** 行双击回调；双击操作列内的按钮时不会触发，避免与按钮单击冲突 */
  onRowDoubleClick?: (row: TData) => void
  stickyHeader?: boolean
  /** 当前表头排序；传入后会在带 sortKey 的列上渲染排序按钮 */
  sort?: SortState | null
  /** 表头排序变更；传 null 表示恢复默认排序 */
  onSortChange?: (sort: SortState | null) => void
  className?: string
}

/** 加载态骨架行数，保持与常见列表高度接近 */
const SKELETON_ROW_COUNT = 5

/**
 * 统一数据表格：基于 TanStack Table 渲染，内置加载 / 空 / 错误三态。
 * 组件不发起请求，数据与列定义全部由页面注入。
 */
export function DataTable<TData>({
  columns,
  data,
  rowKey,
  isLoading = false,
  error,
  empty,
  toolbar,
  footer,
  onRowClick,
  onRowDoubleClick,
  stickyHeader = true,
  sort,
  onSortChange,
  className
}: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel()
  })

  const rows = table.getRowModel().rows
  const getRowKey =
    typeof rowKey === 'function' ? rowKey : (row: TData) => String(row[rowKey])

  /** 表头排序三态循环：升序 → 降序 → 默认 */
  function handleSort(key: string) {
    if (!onSortChange) return
    if (!sort || sort.key !== key) {
      onSortChange({ key, order: 'asc' })
      return
    }
    if (sort.order === 'asc') {
      onSortChange({ key, order: 'desc' })
      return
    }
    onSortChange(null)
  }

  /** 空 / 错误态占满整行，避免表格高度塌陷 */
  function renderPlaceholder(content: ReactNode) {
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={columns.length} className="p-0">
          {content}
        </TableCell>
      </TableRow>
    )
  }

  return (
    <div
      className={cn(
        'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card',
        className
      )}
    >
      {toolbar ? <div className="shrink-0 border-b border-border p-3">{toolbar}</div> : null}

      {/* 表格容器同时承担纵向与横向滚动：sticky 表头只相对于它生效，
          若让 Table 内部的 overflow-x 容器再套一层，表头会跟着页面整体滚走 */}
      <div className="min-h-0 flex-1 overflow-auto">
        <Table containerClassName="h-full">
          <TableHeader className={cn('bg-surface', stickyHeader && 'sticky top-0 z-10')}>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-border hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const sortKey = header.column.columnDef.meta?.sortKey
                  const canSort = Boolean(onSortChange && sortKey)
                  const direction = sort && sort.key === sortKey ? sort.order : null
                  const label = header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())

                  return (
                    <TableHead key={header.id} className="h-10 px-3 text-muted-foreground">
                      {canSort ? (
                        <button
                          type="button"
                          onClick={() => handleSort(sortKey!)}
                          aria-label={`按${typeof label === 'string' ? label : ''}排序`}
                          className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                        >
                          {/* 字号单独包一层，避免 tailwind-merge 把 text-meta 当作颜色类丢弃 */}
                          <span className="text-meta font-medium">{label}</span>
                          {direction === 'asc' ? (
                            <ChevronUp className="h-3 w-3" aria-hidden="true" />
                          ) : direction === 'desc' ? (
                            <ChevronDown className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        <span className="text-meta font-medium">{label}</span>
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {isLoading
              ? Array.from({ length: SKELETON_ROW_COUNT }, (_, rowIndex) => (
                  <TableRow key={`skeleton-${rowIndex}`} className="hover:bg-transparent">
                    {columns.map((_, columnIndex) => (
                      <TableCell key={`skeleton-${rowIndex}-${columnIndex}`} className="px-3 py-[11px]">
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : null}

            {!isLoading && error
              ? renderPlaceholder(
                  <EmptyState
                    icon={AlertCircle}
                    title="加载失败"
                    description={error}
                    className="min-h-64"
                  />
                )
              : null}

            {!isLoading && !error && rows.length === 0
              ? renderPlaceholder(
                  <EmptyState
                    icon={empty?.icon ?? Inbox}
                    title={empty?.title ?? '暂无数据'}
                    description={empty?.description}
                    action={empty?.action}
                    className="min-h-64"
                  />
                )
              : null}

            {!isLoading && !error
              ? rows.map((row) => (
                  <TableRow
                    key={getRowKey(row.original)}
                    className={cn(
                      'border-border/60 hover:bg-surface',
                      (onRowClick || onRowDoubleClick) && 'cursor-pointer'
                    )}
                    tabIndex={onRowClick || onRowDoubleClick ? 0 : undefined}
                    onClick={
                      onRowClick
                        ? (event) => {
                            // 单击操作列内的按钮 / 链接时不触发行点击，避免与按钮行为冲突
                            const target = event.target as HTMLElement
                            if (target.closest('button, a, [role="button"]')) return
                            onRowClick(row.original)
                          }
                        : undefined
                    }
                    onDoubleClick={
                      onRowDoubleClick
                        ? (event) => {
                            // 双击操作列内的按钮 / 链接时不触发行双击，避免与按钮行为冲突
                            const target = event.target as HTMLElement
                            if (target.closest('button, a, [role="button"]')) return
                            onRowDoubleClick(row.original)
                          }
                        : undefined
                    }
                    onKeyDown={
                      onRowClick
                        ? (event) => {
                            if (event.key === 'Enter') onRowClick(row.original)
                          }
                        : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="px-3 py-[11px] text-body">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </div>

      {footer ? <div className="shrink-0 border-t border-border">{footer}</div> : null}
    </div>
  )
}
