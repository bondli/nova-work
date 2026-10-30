import { useEffect } from 'react'
import type { ThemeMode } from '@shared/types/settings'

/**
 * 将主题设置同步到 <html> 的 dark 类。
 * 跟随系统时监听系统主题变化，切换为手动主题后自动解除监听。
 */
export function useThemeEffect(mode: ThemeMode): void {
  useEffect(() => {
    const root = document.documentElement
    const query = window.matchMedia('(prefers-color-scheme: dark)')

    const apply = (): void => {
      const isDark = mode === 'dark' || (mode === 'system' && query.matches)
      root.classList.toggle('dark', isDark)
    }

    apply()

    if (mode !== 'system') return
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [mode])
}
