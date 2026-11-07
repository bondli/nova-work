import type { BrowserWindow } from 'electron'
import { registerAgentIpc } from './agent'
import { registerAuthIpc } from './auth'
import { registerNotificationIpc } from './notifications'
import { registerPosIpc } from './pos'
import { registerPrintIpc } from './print'
import { registerSettingsIpc } from './settings'
import { registerShareIpc } from './share'

/** 应用启动时注册全部 IPC 处理器 */
export function registerIpc(getWindow: () => BrowserWindow | null): void {
  registerAuthIpc()
  registerPosIpc()
  registerPrintIpc()
  registerSettingsIpc(getWindow)
  registerAgentIpc(getWindow)
  registerNotificationIpc(getWindow)
  registerShareIpc(getWindow)
}
