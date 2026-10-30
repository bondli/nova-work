import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { Button } from '@renderer/components/ui/button'
import { Separator } from '@renderer/components/ui/separator'
import { findNavItem } from '@renderer/lib/navigation'
import { NotificationMenu } from './NotificationMenu'
import { TextLogo } from './TextLogo'
import { UserMenu } from './UserMenu'

/**
 * 顶栏：logo、当前页面标题与描述、刷新、消息、个人中心。
 * 整条顶栏作为窗口拖拽区，右侧按钮组显式标记 no-drag，保证点击不被拖拽手势吞掉。
 */
export function AppHeader() {
  const location = useLocation()
  const queryClient = useQueryClient()
  const page = findNavItem(location.pathname)

  /** 刷新应用：先清空查询缓存，再让主进程重载整个渲染页面 */
  const refreshApp = (): void => {
    queryClient.clear()
    void window.nova.system.reload()
  }

  return (
    <header className="app-drag flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
      <TextLogo version={__APP_VERSION__} />
      <Separator orientation="vertical" className="h-7" />

      <div className="min-w-0">
        <h1 className="truncate text-title font-semibold">{page.title}</h1>
        <p className="truncate text-meta text-muted-foreground">{page.description}</p>
      </div>

      <div className="app-no-drag ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          title="刷新应用"
          aria-label="刷新应用"
          onClick={refreshApp}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </Button>
        <NotificationMenu />
        <UserMenu />
      </div>
    </header>
  )
}
