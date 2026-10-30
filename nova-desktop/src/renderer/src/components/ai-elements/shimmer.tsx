/**
 * shimmer 文字动效：用于「执行中」这类进行态文案
 */
import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'

export function Shimmer({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('ai-shimmer', className)}>{children}</span>
}
