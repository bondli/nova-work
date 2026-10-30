import { Loader2 } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

interface LoaderProps {
  label?: string
  className?: string
}

/** 流式加载 / 工具执行中的轻量提示 */
export function Loader({ label = 'Nova 正在分析…', className }: LoaderProps) {
  return (
    <div className={cn('flex items-center gap-2 text-ui text-muted-foreground', className)}>
      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}
