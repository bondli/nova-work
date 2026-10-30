import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle
} from '@renderer/components/ui/sheet'
import { cn } from '@renderer/lib/utils'

/** 抽屉宽度档位，对应 demo 的会员 480 / 订单 640 / 商品 720 */
export type SheetDrawerWidth = 'md' | 'lg' | 'xl' | '2xl'

interface SheetDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: string
  /** 标题右侧操作，例如「导出」 */
  headerActions?: ReactNode
  footer?: ReactNode
  width?: SheetDrawerWidth
  /** 默认从应用顶部整高拉出 */
  fullHeight?: boolean
  /** 内容区附加类名，需要表格通栏时可传 p-0 */
  bodyClassName?: string
  children: ReactNode
}

const WIDTH_CLASS: Record<SheetDrawerWidth, string> = {
  md: 'w-[480px]',
  lg: 'w-[640px]',
  xl: 'w-[720px]',
  '2xl': 'w-[980px]'
}

/**
 * 统一右侧抽屉：52px 标题栏 + 独立滚动内容区 + 固定页脚。
 * fullHeight 为 true 时从应用顶部开始，与 demo 的 inset-y-0 一致。
 */
export function SheetDrawer({
  open,
  onOpenChange,
  title,
  description,
  headerActions,
  footer,
  width = 'md',
  fullHeight = true,
  bodyClassName,
  children
}: SheetDrawerProps) {
  /**
   * 抽屉打开期间临时取消窗口拖拽区。
   * Portal 中的 no-drag 无法稳定覆盖 AppHeader 的 drag 区域，
   * 会导致左上角关闭按钮的点击被 macOS 当作拖动窗口。
   */
  useEffect(() => {
    if (!open) return
    document.documentElement.dataset.sheetOpen = 'true'
    return () => {
      delete document.documentElement.dataset.sheetOpen
    }
  }, [open])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className={cn(
          // 抽屉覆盖窗口顶部时需退出拖拽区，否则左上角关闭按钮的点击会被系统当作拖动窗口
          'app-no-drag gap-0 border-l border-border bg-card p-0 sm:max-w-none',
          WIDTH_CLASS[width],
          fullHeight ? 'top-0 h-screen' : 'top-14 h-[calc(100vh-56px)]'
        )}
      >
        <div className="flex min-h-[52px] shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="app-no-drag"
            aria-label="关闭"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>

          <div className="min-w-0">
            <SheetTitle className="truncate text-body font-semibold">{title}</SheetTitle>
            {description ? (
              <SheetDescription className="truncate text-meta text-muted-foreground">
                {description}
              </SheetDescription>
            ) : null}
          </div>

          {headerActions ? (
            <div className="ml-auto flex shrink-0 items-center gap-2">{headerActions}</div>
          ) : null}
        </div>

        <div className={cn('min-h-0 flex-1 overflow-y-auto p-4', bodyClassName)}>{children}</div>

        {footer ? (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border p-3">
            {footer}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
