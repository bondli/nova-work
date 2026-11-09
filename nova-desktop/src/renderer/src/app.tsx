import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router-dom'
import { Toaster } from '@renderer/components/ui/sonner'
import { TooltipProvider } from '@renderer/components/ui/tooltip'
import { SelectionCopy } from '@renderer/components/common/SelectionCopy'
import { useFontSizeEffect } from '@renderer/hooks/use-font-size-effect'
import { useThemeEffect } from '@renderer/hooks/use-theme-effect'
import { useSettingsStore } from '@renderer/stores/settings-store'
import { AppSplash } from './AppSplash'
import { AppRoutes } from './router'

/**
 * 应用根组件：初始化设置、主题、路由与全局提示。
 * 设置未加载完成前显示启动占位，避免首帧使用错误主题。
 */

// 服务端数据查询的全局默认策略：30 秒内复用缓存，窗口重新聚焦不自动刷新
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 }
  }
})

/** 应用根组件：加载设置 → 同步主题 → 渲染路由与全局 Toaster */
export function App() {
  const settings = useSettingsStore((state) => state.settings)
  const isReady = useSettingsStore((state) => state.isReady)
  const load = useSettingsStore((state) => state.load)

  useEffect(() => {
    void load()
  }, [load])

  useThemeEffect(settings.appearance.theme)
  useFontSizeEffect(settings.appearance.fontSize)

  if (!isReady) return <AppSplash />

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </TooltipProvider>
      <Toaster theme={settings.appearance.theme} position="top-center" />
      <SelectionCopy />
    </QueryClientProvider>
  )
}
