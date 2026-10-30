import type { ReactNode } from 'react'
import { Badge } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'

/** 状态语义色，与 demo 的 badge-success/warning/danger/brand 一一对应 */
export type StatusTone = 'success' | 'warning' | 'danger' | 'brand' | 'neutral'

interface StatusBadgeProps {
  status: StatusTone
  children: ReactNode
  className?: string
}

/**
 * 语义状态标签。
 * 颜色统一在这里维护，业务页面禁止自行拼装红/绿底色。
 */
const TONE_CLASS: Record<StatusTone, string> = {
  success: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  danger: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  brand: 'bg-accent text-accent-foreground',
  neutral: 'bg-secondary text-zinc-600 dark:text-zinc-400'
}

export function StatusBadge({ status, children, className }: StatusBadgeProps) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        'h-5 rounded-full border-transparent px-[7px] py-0 font-medium',
        TONE_CLASS[status],
        className
      )}
    >
      {/* 字号放在内层 span，避免 tailwind-merge 把 text-meta 误判为颜色而丢弃 */}
      <span className="text-meta leading-none">{children}</span>
    </Badge>
  )
}
