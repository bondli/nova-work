import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'

/** 设置项卡片：选中时使用主色边框与浅色底，供主题 / 字号等单选场景复用 */
interface OptionCardProps {
  selected: boolean
  onSelect: () => void
  label: string
  description?: string
  children: ReactNode
}

export function OptionCard({
  selected,
  onSelect,
  label,
  description,
  children
}: OptionCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'rounded-lg border p-3 text-left transition-colors',
        selected ? 'border-primary bg-accent' : 'border-border hover:bg-surface'
      )}
    >
      {children}
      <p
        className={cn(
          'mt-2 text-ui font-medium',
          selected ? 'text-accent-foreground' : 'text-foreground'
        )}
      >
        {label}
      </p>
      {description ? (
        <p className="mt-0.5 text-caption text-muted-foreground">{description}</p>
      ) : null}
    </button>
  )
}
