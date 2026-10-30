import type { FormEvent, ReactNode } from 'react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

interface FilterBarProps {
  children: ReactNode
  /** 右侧操作区，例如「对账」「新建活动」 */
  actions?: ReactNode
  /** 传入后渲染「查询」按钮，并支持回车提交 */
  onSubmit?: () => void
  /** 传入后渲染「重置」按钮 */
  onReset?: () => void
  loading?: boolean
  className?: string
}

/**
 * 统一筛选条：白色卡片 + 横向排列的筛选项 + 查询/重置 + 右侧操作。
 * 回车提交由 form 统一处理，业务页只关心 onSubmit / onReset。
 */
export function FilterBar({
  children,
  actions,
  onSubmit,
  onReset,
  loading = false,
  className
}: FilterBarProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit?.()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        'relative flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3',
        className
      )}
    >
      {children}

      {onSubmit ? (
        <Button type="submit" variant="outline" size="sm" disabled={loading}>
          {loading ? '查询中' : '查询'}
        </Button>
      ) : null}

      {onReset ? (
        <Button type="button" variant="outline" size="sm" onClick={onReset}>
          重置
        </Button>
      ) : null}

      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </form>
  )
}

interface FilterFieldProps {
  label?: string
  children: ReactNode
  className?: string
}

/** 筛选项容器：统一标签字号与控件间距 */
export function FilterField({ label, children, className }: FilterFieldProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {label ? <span className="text-meta text-muted-foreground">{label}</span> : null}
      {children}
    </div>
  )
}
