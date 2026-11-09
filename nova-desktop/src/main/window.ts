/**
 * 主窗口创建与安全基线配置。
 * 渲染层不直接接触 Node，所有能力通过 preload 白名单暴露。
 */
import { BrowserWindow, Menu, session } from 'electron'
import { join } from 'node:path'
import { isDevelopment } from './env'
import { registerIconWindow } from './services/app-icon'

/** 创建唯一主窗口，并挂载全部安全限制 */
export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    title: 'DaveBella',
    backgroundColor: '#f4f4f5',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  })

  window.once('ready-to-show', () => window.show())

  // 字号由渲染层的 CSS 变量控制，窗口保持 1.0 缩放；这里清掉历史版本可能残留的页面缩放
  window.webContents.setZoomFactor(1)

  // 禁止页面自行打开新窗口或跳转到外部地址
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  window.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  // 右键菜单：输入框 / 可编辑区域提供剪切、复制、粘贴、全选；
  // 非编辑区域若有选中文字则只提供复制。
  // Electron 默认不会弹出自带菜单，需要手动注册。
  window.webContents.on('context-menu', (_event, params) => {
    const { isEditable, editFlags } = params
    const hasSelection = params.selectionText.length > 0

    const template: Electron.MenuItemConstructorOptions[] = []

    if (isEditable) {
      template.push(
        {
          label: '剪切',
          enabled: editFlags.canCut,
          click: () => window.webContents.cut()
        },
        {
          label: '复制',
          enabled: editFlags.canCopy,
          click: () => window.webContents.copy()
        },
        {
          label: '粘贴',
          enabled: editFlags.canPaste,
          click: () => window.webContents.paste()
        },
        { type: 'separator' },
        {
          label: '全选',
          enabled: editFlags.canSelectAll,
          click: () => window.webContents.selectAll()
        }
      )
    } else if (hasSelection) {
      template.push({
        label: '复制',
        click: () => window.webContents.copy()
      })
    }

    if (template.length === 0) return
    const menu = Menu.buildFromTemplate(template)
    menu.popup({ window })
  })

  if (!isDevelopment) {
    // 生产环境屏蔽 DevTools 快捷键，开发环境保留便于调试
    window.webContents.on('before-input-event', (event, input) => {
      const isDevToolsShortcut =
        input.key === 'F12' ||
        (input.meta && input.alt && input.key.toLowerCase() === 'i')
      if (isDevToolsShortcut) event.preventDefault()
    })
  }

  if (!isDevelopment) {
    // 生产环境注入 CSP，限制脚本与资源来源
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            // img-src 需要放开 http：商品图片由 POS 服务静态目录提供（默认 http://127.0.0.1:9577/inventory-image/...），
            // 只放开 https: 会让本地图片被 CSP 拦截，预览弹窗退化为「该款号暂无图片」。
            "default-src 'self'; img-src 'self' data: https: http:; style-src 'self' 'unsafe-inline'; script-src 'self'"
          ]
        }
      })
    })
  }

  // 开发模式走 Vite dev server，生产模式加载打包后的静态页面
  if (process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 注册窗口到图标服务，后续主题变化时自动同步窗口图标（Windows / Linux 任务栏）
  registerIconWindow(window)

  return window
}
