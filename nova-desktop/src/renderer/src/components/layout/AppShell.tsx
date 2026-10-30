import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useAnalysisStore } from '@renderer/stores/analysis-store'
import { useOrderShowStatusStore } from '@renderer/stores/order-show-status-store'
import { AppHeader } from './AppHeader'
import { AppRail } from './AppRail'
import { GlobalDialogs } from './GlobalDialogs'

/**
 * 已登录后的应用骨架：铺满窗口的左侧导航 + 顶栏 + 内容区，
 * 全局弹窗挂载在此，保证任意页面都能打开。
 */
export function AppShell() {
  // 登录后按角色设定订单可见范围：管理员 all，导购员 hidden
  useEffect(() => {
    useOrderShowStatusStore.getState().initForRole()
  }, [])

  // 全局订阅分析事件：即使切换到其他页面，流式内容与任务状态也不会丢失
  useEffect(() => {
    const unsubscribe = window.nova.agent.onEvent((event) => {
      useAnalysisStore.getState().handleEvent(event)
    })
    return unsubscribe
  }, [])

  return (
    <div className="h-screen w-screen">
      <div className="relative flex h-full overflow-hidden bg-card">
        <AppRail />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader />
          <main className="relative min-h-0 flex-1 overflow-hidden">
            <Outlet />
          </main>
        </div>
      </div>
      <GlobalDialogs />
    </div>
  )
}
