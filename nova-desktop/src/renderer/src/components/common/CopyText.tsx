import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

interface CopyButtonProps {
  text: string
  className?: string
  /** 字段名称，用于无障碍与提示文案，例如「条码」 */
  label?: string
}

/** 复制图标按钮：点击写入剪贴板，短暂反馈成功 */
export function CopyButton({ text, className, label = '内容' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 剪贴板不可用时静默失败，不打断阅读
    }
  }

  return (
    <button
      type="button"
      title={`复制${label}`}
      aria-label={copied ? '已复制' : `复制${label}`}
      onClick={() => void handleCopy()}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none',
        className
      )}
    >
      {copied ? (
        <Check className="h-3 w-3 text-success" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3" aria-hidden="true" />
      )}
    </button>
  )
}

interface CopyableTextProps {
  text: string
  className?: string
  textClassName?: string
  label?: string
}

/** 只读文本 + 复制图标，用于条码等需要一键复制的字段 */
export function CopyableText({ text, className, textClassName, label }: CopyableTextProps) {
  if (!text) return <span className={textClassName}>{text}</span>

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1', className)}>
      <span className={cn('truncate', textClassName)}>{text}</span>
      <CopyButton text={text} label={label} />
    </span>
  )
}
