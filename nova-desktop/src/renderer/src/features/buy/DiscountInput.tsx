import { useEffect, useState } from 'react'
import { Input } from '@renderer/components/ui/input'

interface DiscountInputProps {
  value: number
  /** 无障碍名称，如「小童纯棉针织开衫 折扣」 */
  label: string
  onCommit: (discount: number) => void
}

/** 折扣输入：本地草稿允许清空重输，失焦时夹紧到 1~10 折并回调 */
export function DiscountInput({ value, label, onCommit }: DiscountInputProps) {
  const [draft, setDraft] = useState(value.toFixed(1))

  useEffect(() => {
    setDraft(value.toFixed(1))
  }, [value])

  function commit() {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDraft(value.toFixed(1))
      return
    }
    const clamped = Math.min(10, Math.max(1, Math.round(parsed * 10) / 10))
    setDraft(clamped.toFixed(1))
    onCommit(clamped)
  }

  return (
    <div className="flex items-center justify-center gap-1">
      <Input
        type="text"
        inputMode="decimal"
        aria-label={label}
        className="h-7 w-20 text-center text-ui tnum"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
      <span className="text-meta text-muted-foreground">折</span>
    </div>
  )
}
