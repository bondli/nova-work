import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

type StatTone = 'default' | 'success' | 'warning' | 'danger'

interface StatDelta {
  text: string
  tone?: 'success' | 'danger' | 'muted'
}

interface StatCardProps {
  label: string
  value: ReactNode
  icon?: LucideIcon
  /** 指标下方的同比/环比说明 */
  delta?: StatDelta
  /** 数值语义色，默认使用正文色 */
  tone?: StatTone
  hint?: string
  /** 数值字号：数据页 6 卡并排时使用 compact（18px） */
  size?: 'default' | 'compact'
  className?: string
}

/** 数值语义色映射；避免在页面里散落 text-green-600 之类的颜色类 */
const VALUE_TONE: Record<StatTone, string> = {
  default: '',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive'
}

/** 增减说明的颜色映射 */
const DELTA_TONE: Record<NonNullable<StatDelta['tone']>, string> = {
  success: 'text-success',
  danger: 'text-destructive',
  muted: 'text-muted-foreground'
}

/**
 * 指标卡：标签 + 图标 + 数值 + 增减说明。
 * 只负责展示，不含任何业务计算。
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  tone = 'default',
  hint,
  size = 'default',
  className
}: StatCardProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-meta text-muted-foreground">{label}</p>
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" /> : null}
      </div>
      <p
        className={cn(
          'mt-1 font-semibold tracking-[-0.02em]',
          size === 'compact' ? 'text-metric-sm' : 'text-metric'
        )}
      >
        <span className={cn('tnum', VALUE_TONE[tone])}>{value}</span>
      </p>
      {delta ? (
        <p className="mt-0.5 text-meta">
          <span className={DELTA_TONE[delta.tone ?? 'muted']}>{delta.text}</span>
        </p>
      ) : null}
      {hint ? <p className="mt-0.5 text-meta text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
