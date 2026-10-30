import type { ReactNode, Ref, UIEventHandler } from 'react'
import { cn } from '@renderer/lib/utils'

interface ConversationProps {
  children: ReactNode
  className?: string
  /** 由调用方持有滚动容器，用于自动滚底判断 */
  scrollRef?: Ref<HTMLDivElement>
  onScroll?: UIEventHandler<HTMLDivElement>
}

/** 对话滚动容器：调用方负责滚动控制 */
export function Conversation({ children, className, scrollRef, onScroll }: ConversationProps) {
  return (
    <div ref={scrollRef} onScroll={onScroll} className={cn('relative flex-1 overflow-y-auto', className)}>
      {children}
    </div>
  )
}

/** 对话内容宽度与间距，与 nexa 的 max-w-4xl 居中一致 */
export function ConversationContent({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6">{children}</div>
}
