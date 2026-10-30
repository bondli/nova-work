import type { ReactNode } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import { cn } from '@renderer/lib/utils'

/** 抽屉内明细表的单元格样式，与列表页表体字号一致 */
export const DETAIL_CELL = 'px-3 py-2 text-ui'

/** 明细表列定义：字符串即普通左对齐列，需要右对齐或列宽时传对象 */
export type DetailColumn =
  | string
  | { label: ReactNode; align?: 'left' | 'right'; width?: string }

interface DetailTableProps {
  columns: DetailColumn[]
  children: ReactNode
  className?: string
}

/**
 * 抽屉 / 弹窗内的明细表：表头统一 12px 常规字重灰字，高度随内容自适应。
 * 说明：DataTable 是列表页的分页表格（flex 撑满、固定高度），详情内的明细表用这一套。
 */
export function DetailTable({ columns, children, className }: DetailTableProps) {
  return (
    <div className={cn('overflow-hidden rounded-lg border border-border', className)}>
      <Table>
        <TableHeader className="bg-surface">
          <TableRow className="border-border hover:bg-transparent">
            {columns.map((column, index) => {
              const label = typeof column === 'string' ? column : column.label
              const align = typeof column === 'string' ? undefined : column.align
              const width = typeof column === 'string' ? undefined : column.width
              return (
                <TableHead
                  key={index}
                  className={cn(
                    'h-8 px-3 text-muted-foreground',
                    align === 'right' && 'text-right',
                    width
                  )}
                >
                  {/* 字号放在内层 span，避免 tailwind-merge 把 text-meta 误判为颜色而丢弃 */}
                  <span className="text-meta font-medium">{label}</span>
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  )
}

/** 明细表空态行，避免小表塌陷 */
export function DetailEmptyRow({
  colSpan,
  children = '暂无数据'
}: {
  colSpan: number
  children?: ReactNode
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="px-3 py-6 text-center text-ui text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  )
}
