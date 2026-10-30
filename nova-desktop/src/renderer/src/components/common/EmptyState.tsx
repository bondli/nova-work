import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

/** 通用空态：图标 + 标题 + 可选描述与操作按钮 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-40 flex-col items-center justify-center gap-2 text-center',
        className
      )}
    >
      <Icon className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
      <p className="text-body font-medium">{title}</p>
      {description ? (
        <p className="max-w-[320px] text-meta text-muted-foreground">{description}</p>
      ) : null}
      {action}
    </div>
  )
}
