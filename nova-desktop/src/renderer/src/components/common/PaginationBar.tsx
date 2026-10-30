import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { cn } from '@renderer/lib/utils'

interface PaginationBarProps {
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  /** 传入后显示每页条数选择器 */
  onPageSizeChange?: (pageSize: number) => void
  /** 总数单位，默认「条」；营销页用「个活动」 */
  unit?: string
  className?: string
}

/** 折叠页码：首尾常驻，当前页前后各展开一页，其余用省略号 */
function getPageItems(page: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const items: Array<number | 'ellipsis'> = [1]
  if (page > 3) items.push('ellipsis')

  const start = Math.max(2, page - 1)
  const end = Math.min(totalPages - 1, page + 1)
  for (let index = start; index <= end; index += 1) items.push(index)

  if (page < totalPages - 2) items.push('ellipsis')
  items.push(totalPages)
  return items
}

/**
 * 列表分页条：左侧总数，右侧上一页 / 页码 / 下一页。
 * 只负责展示与回调，不在组件内部保存页码。
 */
export function PaginationBar({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  unit = '条',
  className
}: PaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const items = getPageItems(Math.min(page, totalPages), totalPages)

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 text-ui text-muted-foreground',
        className
      )}
    >
      <span className="tnum">
        共 {total.toLocaleString('zh-CN')} {unit}
      </span>

      <div className="flex items-center gap-1">
        {onPageSizeChange ? (
          <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
            <SelectTrigger size="sm" className="mr-1 h-7 w-[108px] text-xs" aria-label="每页条数">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  每页 {size} 条
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Button
          type="button"
          variant="outline"
          size="xs"
          className="h-7 px-2"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-3 w-3" aria-hidden="true" />
          上一页
        </Button>

        {items.map((item, index) =>
          item === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} className="px-1 text-meta">
              ···
            </span>
          ) : (
            <Button
              key={item}
              type="button"
              variant={item === page ? 'default' : 'outline'}
              size="xs"
              className="h-7 min-w-7 px-2 tnum"
              aria-current={item === page ? 'page' : undefined}
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          )
        )}

        <Button
          type="button"
          variant="outline"
          size="xs"
          className="h-7 px-2"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          下一页
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
