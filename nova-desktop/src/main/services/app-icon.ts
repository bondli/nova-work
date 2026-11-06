/**
 * 应用图标主题切换服务。
 * 根据当前实际明暗主题（nativeTheme.shouldUseDarkColors）切换 Dock / 窗口图标：
 * - 深色模式：黑色底板 + 白色购物袋（icon.png / icon.ico）
 * - 浅色模式：白色底板 + 黑色购物袋（icon-light.png / icon-light.ico）
 *
 * 注意：nativeImage.createFromPath 无法加载 .icns 格式，必须用 PNG。
 * 打包后的应用图标（启动器、桌面快捷方式）由 electron-builder 在构建时固定，
 * 运行时可切换的是 macOS Dock 图标与 Windows / Linux 任务栏窗口图标。
 */
import { app, nativeImage, nativeTheme, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import { isDevelopment } from '../env'

/** 解析 assets 目录下的图标文件路径；生产环境从 Resources/assets 读取 */
function resolveIconPath(filename: string): string {
  if (isDevelopment) {
    return join(__dirname, '../../assets', filename)
  }
  return join(process.resourcesPath, 'assets', filename)
}

const darkIcon = nativeImage.createFromPath(resolveIconPath('icon.png'))
const lightIcon = nativeImage.createFromPath(resolveIconPath('icon-light.png'))

/** 当前主窗口引用，主题变化时同步更新窗口图标（Windows / Linux 任务栏） */
let trackedWindow: BrowserWindow | null = null

/** 按当前主题应用对应图标到 Dock 与窗口 */
function applyIconByTheme(): void {
  const icon = nativeTheme.shouldUseDarkColors ? darkIcon : lightIcon
  if (icon.isEmpty()) return

  // macOS Dock 图标
  if (process.platform === 'darwin') {
    app.dock?.setIcon(icon)
  }

  // Windows / Linux 任务栏图标通过窗口图标控制
  if (trackedWindow && !trackedWindow.isDestroyed()) {
    trackedWindow.setIcon(icon)
  }
}

/** 注册主窗口，后续主题变化时自动更新其图标 */
export function registerIconWindow(window: BrowserWindow): void {
  trackedWindow = window
  window.on('closed', () => {
    if (trackedWindow === window) trackedWindow = null
  })
  applyIconByTheme()
}

/** 初始化图标主题切换：立即应用一次，并监听主题变化 */
export function initAppIcon(): void {
  applyIconByTheme()
  // nativeTheme.updated 在 shouldUseDarkColors 实际值变化时触发，
  // 包括 themeSource 切换和系统主题变化（system 模式下）
  nativeTheme.on('updated', applyIconByTheme)
}
