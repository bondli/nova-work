/**
 * 主进程入口。
 * 负责：单实例约束、开发环境数据隔离、读取设置、创建窗口、注册 IPC。
 */
import { BrowserWindow, Menu, app } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isDevelopment } from './env'
import { createMainWindow } from './window'
import { registerIpc } from './ipc'
import { stopShareRelay } from './ipc/share'
import { closeMysql } from './db/mysql'
import { closeAgentDb, initAgentDb } from './agent/db'
import { applyAutoLaunch, applyTheme, getSettings } from './services/settings'
import { initAppIcon } from './services/app-icon'
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
    // macOS 保留系统菜单（Cmd+Q / Cmd+C 等依赖它）；Windows / Linux 去掉默认的
    // File / Edit / View / Window / Help 菜单栏，窗口内不再出现顶部菜单
    if (process.platform !== 'darwin') Menu.setApplicationMenu(null)

    // 启动前先恢复用户的主题、字号与开机自启设置
    const settings = await getSettings()
    applyTheme(settings.appearance.theme)
    applyAutoLaunch(settings.launch.autoLaunch)

    // 应用图标随主题切换：必须在 applyTheme 之后初始化，确保 shouldUseDarkColors 已生效
    initAppIcon()

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
    stopShareRelay() // 干净关闭中继 WS，让对端立即收到离线通知
    stopScheduler()
    closeAgentDb()
    void closeMysql()
  })
}
