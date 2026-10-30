import { useEffect, useState } from 'react'
import { Input } from '@renderer/components/ui/input'

interface QuantityInputProps {
  value: number
  /** 无障碍名称，如「小童纯棉针织开衫 数量」 */
  label: string
  onChange: (value: number) => void
}

/** 购物车数量输入：普通数字输入框，失焦或回车时提交，最少 1 件 */
export function QuantityInput({ value, label, onChange }: QuantityInputProps) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  function commit() {
    const parsed = Number(draft)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setDraft(String(value))
      return
    }
    setDraft(String(parsed))
    if (parsed !== value) onChange(parsed)
  }

  return (
    <Input
      type="number"
      min={1}
      step={1}
      inputMode="numeric"
      aria-label={label}
      className="h-7 w-14 text-center text-ui tnum"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}
