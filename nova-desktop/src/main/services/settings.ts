/**
 * 应用设置服务：负责 settings.json 的读取、校验、缓存与持久化，
 * 以及把主题、开机自启真正应用到系统（字号由渲染层的 CSS 变量控制）。
 */
import { app, nativeTheme } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { DEFAULT_SETTINGS, CLOCK_PATTERN, type AppSettings, type ThemeMode } from '@shared/types/settings'
import { isDevelopment } from '../env'
import { readJsonFile, writeJsonFile } from './json-file'

/** 本地数据根目录：设置、账号、会话均存放于此；E2E 通过 NOVA_HOME 指向临时目录 */
export const NOVA_HOME = process.env['NOVA_HOME'] ?? join(homedir(), '.nova')

const SETTINGS_FILE = join(NOVA_HOME, 'settings.json')

const themeModeSchema = z.enum(['system', 'light', 'dark'])
const fontSizeSchema = z.enum(['small', 'medium', 'large'])
const clockSchema = z.string().regex(CLOCK_PATTERN, '时间格式应为 HH:MM')
const soundSchema = z.enum(['default', 'chime', 'silent'])

/**
 * 设置的运行时校验规则，任何写入磁盘的数据都必须先通过它。
 * task / notification 带默认值，兼容旧版本 settings.json（缺失字段自动补齐）。
 */
export const appSettingsSchema = z
  .object({
    appearance: z
      .object({ theme: themeModeSchema, fontSize: fontSizeSchema })
      .default(DEFAULT_SETTINGS.appearance),
    launch: z.object({ autoLaunch: z.boolean() }).default(DEFAULT_SETTINGS.launch),
    task: z
      .object({
        daily: clockSchema.default(DEFAULT_SETTINGS.task.daily),
        weekly: clockSchema.default(DEFAULT_SETTINGS.task.weekly),
        monthly: clockSchema.default(DEFAULT_SETTINGS.task.monthly)
      })
      .default(DEFAULT_SETTINGS.task),
    notification: z
      .object({
        desktop: z.boolean().default(DEFAULT_SETTINGS.notification.desktop),
        sound: soundSchema.default(DEFAULT_SETTINGS.notification.sound)
      })
      .default(DEFAULT_SETTINGS.notification)
  })
  .strict()

/** 进程内缓存，避免频繁读盘；保存时同步更新 */
let cachedSettings: AppSettings | null = null

/** 返回设置文件路径，供测试与诊断使用 */
export function resolveSettingsPath(): string {
  return SETTINGS_FILE
}

/** 读取设置；文件缺失或校验失败时回退到默认值 */
export async function getSettings(): Promise<AppSettings> {
  if (cachedSettings) return cachedSettings

  try {
    const stored = await readJsonFile<unknown>(SETTINGS_FILE)
    const parsed = appSettingsSchema.safeParse(stored ?? DEFAULT_SETTINGS)
    cachedSettings = parsed.success ? parsed.data : { ...DEFAULT_SETTINGS }
  } catch (error) {
    console.error('[settings] read failed, fallback to defaults', error)
    cachedSettings = { ...DEFAULT_SETTINGS }
  }

  return cachedSettings
}

/** 持久化设置并刷新缓存 */
export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  await writeJsonFile(SETTINGS_FILE, settings)
  cachedSettings = settings
  return settings
}

/** 设置开机自启；开发模式下 Electron 无签名会被系统拒绝，因此直接跳过 */
export function applyAutoLaunch(enabled: boolean): void {
  // 开发模式下 Electron 无签名，设置登录项会被系统拒绝；打包后再真正生效
  if (process.platform === 'linux' || isDevelopment) return
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: false })
  } catch (error) {
    console.error('[settings] apply auto launch failed', error)
  }
}

/** 将主题模式写入 Electron 的 nativeTheme，跟随系统时由系统决定实际明暗 */
export function applyTheme(theme: ThemeMode): void {
  nativeTheme.themeSource = theme
}

/**
 * 应用主进程可控制的设置。
 * 字号不在此处处理：它通过渲染层的 CSS 变量缩放文字，不影响间距与图标尺寸。
 */
export function applySettings(settings: AppSettings): void {
  applyTheme(settings.appearance.theme)
  applyAutoLaunch(settings.launch.autoLaunch)
}
