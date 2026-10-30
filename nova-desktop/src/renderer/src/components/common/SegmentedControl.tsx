import { cn } from '@renderer/lib/utils'

export interface SegmentedOption {
  key: string
  label: string
  /** 标签右侧的计数，例如「断码 12」 */
  count?: number
}

interface SegmentedControlProps {
  value: string
  options: SegmentedOption[]
  onChange: (key: string) => void
  className?: string
}

/**
 * 分段切换控件，对齐 demo 的 `.seg`：
 * 26px 高、12px 字号、选中项白底并带轻阴影。
 * 只负责展示与回调，选中值由调用方持有。
 */
export function SegmentedControl({ value, options, onChange, className }: SegmentedControlProps) {
  return (
    <div className={cn('inline-flex gap-0.5 rounded-[9px] bg-secondary p-[3px]', className)}>
      {options.map((option) => {
        const active = option.key === value
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={active}
            className={cn(
              'h-[26px] rounded-[7px] px-2.5 text-ui transition-colors',
              active
                ? 'bg-card font-medium text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => onChange(option.key)}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="ml-1 text-destructive">{option.count}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
