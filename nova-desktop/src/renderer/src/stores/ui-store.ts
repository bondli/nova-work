import { create } from 'zustand'

/**
 * 全局 UI 状态：目前只管理四个全局弹窗的开关，
 * 由 AppRail / UserMenu 触发，GlobalDialogs 消费。
 */
export type DialogKey = 'settings' | 'oplog' | 'password' | 'logout'

export type DialogState = Record<DialogKey, boolean>

interface UiState {
  dialogs: DialogState
  setDialogOpen: (key: DialogKey, open: boolean) => void
}

/** 全局弹窗开关；同一时间允许存在多个弹窗状态，由各 Dialog 自行控制显示 */
export const useUiStore = create<UiState>((set, get) => ({
  dialogs: { settings: false, oplog: false, password: false, logout: false },
  setDialogOpen: (key, open) => set({ dialogs: { ...get().dialogs, [key]: open } })
}))
