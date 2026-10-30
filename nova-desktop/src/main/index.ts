/**
 * 主进程入口。
 * 负责：单实例约束、开发环境数据隔离、读取设置、创建窗口、注册 IPC。
 */
import { BrowserWindow, app } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isDevelopment } from './env'
import { createMainWindow } from './window'
import { registerIpc } from './ipc'
import { closeMysql } from './db/mysql'
import { closeAgentDb, initAgentDb } from './agent/db'
import { applyAutoLaunch, applyTheme, getSettings } from './services/settings'
import { startScheduler, stopScheduler } from './services/scheduler'

app.setName('DaveBella')

// 开发环境使用独立 userData，避免与已安装的正式包争抢单实例锁和本地数据
if (isDevelopment) {
  app.setPath('userData', join(app.getPath('appData'), 'DaveBella Dev'))
} else if (process.env['NOVA_E2E'] === '1') {
  // E2E 使用临时数据根目录下的 userData，与正式包、开发环境互不影响
  app.setPath('userData', join(process.env['NOVA_HOME'] ?? join(homedir(), '.nova'), 'userData'))
}

let mainWindow: BrowserWindow | null = null

function focusMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
}

// 只允许运行一个实例；重复启动时聚焦已有窗口
const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', focusMainWindow)

  void app.whenReady().then(async () => {
    // 启动前先恢复用户的主题、字号与开机自启设置
    const settings = await getSettings()
    applyTheme(settings.appearance.theme)
    applyAutoLaunch(settings.launch.autoLaunch)

    mainWindow = createMainWindow()
    mainWindow.on('closed', () => {
      mainWindow = null
    })

    // 提前打开 Agent 数据库（会话/消息/记忆），首次启动会迁移旧版 JSON 会话
    try {
      await initAgentDb()
    } catch (error) {
      console.error('[agent] 数据库初始化失败', error)
    }

    registerIpc(() => mainWindow)
    // 启动定时任务调度：检查当天是否已到执行时间，错过则补跑
    // E2E 关闭调度器，避免真实模型请求干扰用例
    if (process.env['NOVA_E2E'] !== '1') {
      startScheduler(() => mainWindow)
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', () => {
    stopScheduler()
    closeAgentDb()
    void closeMysql()
  })
}
