import { cn } from '@renderer/lib/utils'
import { formatMoney } from '@renderer/lib/format'

interface MoneyProps {
  value: number
  /** 币种，当前单店仅支持人民币 */
  currency?: 'CNY'
  /** 小数位，默认两位 */
  decimals?: number
  /** 正数显示 + 号（用于增减额） */
  sign?: boolean
  bold?: boolean
  className?: string
}

/** 金额展示：千分位 + 两位小数，负数自动显示为危险色 */
export function Money({
  value,
  currency = 'CNY',
  decimals = 2,
  sign = false,
  bold = false,
  className
}: MoneyProps) {
  return (
    <span
      className={cn(
        'tnum whitespace-nowrap',
        bold && 'font-semibold',
        value < 0 && 'text-destructive',
        className
      )}
    >
      {formatMoney(value, { currency, sign, decimals })}
    </span>
  )
}
