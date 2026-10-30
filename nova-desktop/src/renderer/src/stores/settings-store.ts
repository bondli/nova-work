import { create } from 'zustand'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types/settings'
import { unwrap } from '@renderer/lib/ipc'

/**
 * 设置 store：启动时从主进程加载，修改时先乐观更新再持久化，
 * 持久化失败会回滚到修改前的值。
 */
interface SettingsState {
  settings: AppSettings
  isReady: boolean
  load: () => Promise<void>
  update: (updater: (current: AppSettings) => AppSettings) => Promise<void>
}

/** 全局设置状态：加载、乐观更新与失败回滚 */
export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isReady: false,

  load: async () => {
    try {
      const settings = unwrap(await window.nova.settings.get())
      set({ settings, isReady: true })
    } catch {
      set({ isReady: true })
    }
  },

  // 乐观更新：先改 UI，写入失败时回滚并抛出错误给调用方提示
  update: async (updater) => {
    const previous = get().settings
    const next = updater(previous)
    set({ settings: next })

    try {
      const saved = unwrap(await window.nova.settings.set(next))
      set({ settings: saved })
    } catch (error) {
      set({ settings: previous })
      throw error
    }
  }
}))
