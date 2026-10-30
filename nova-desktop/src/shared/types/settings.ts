/**
 * 应用设置的类型定义与默认值。
 * 主进程（持久化 / 主题 / 开机自启 / 定时任务）与渲染层（设置面板 / 字号倍率）共用同一份定义。
 */

/** 主题模式：跟随系统 / 强制亮色 / 强制暗色 */
export type ThemeMode = 'system' | 'light' | 'dark'

/** 字号档位，对应界面上的小 / 中 / 大三档 */
export type FontSize = 'small' | 'medium' | 'large'

/** 通知提示音：默认 / 清脆 / 静音 */
export type NotificationSound = 'default' | 'chime' | 'silent'

/** HH:MM（24 小时制）校验 */
export const CLOCK_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export interface AppearanceSettings {
  theme: ThemeMode
  fontSize: FontSize
}

export interface LaunchSettings {
  /** 登录系统后是否自动启动应用，开发模式下不会真正生效 */
  autoLaunch: boolean
}

/** 三个定时任务的执行时间，仅管理员可修改 */
export interface TaskScheduleSettings {
  /** 店铺经营日报，每天执行 */
  daily: string
  /** 店铺经营周报，每周一执行 */
  weekly: string
  /** 店铺经营月报，每月 1 日执行 */
  monthly: string
}

/** 报告生成后的提醒方式 */
export interface NotificationSettings {
  /** 是否弹系统通知 */
  desktop: boolean
  sound: NotificationSound
}

export interface AppSettings {
  appearance: AppearanceSettings
  launch: LaunchSettings
  task: TaskScheduleSettings
  notification: NotificationSettings
}

/** 首次启动或配置损坏时使用的默认设置：跟随系统、14px（中档）、不开机自启 */
export const DEFAULT_SETTINGS: AppSettings = {
  appearance: { theme: 'system', fontSize: 'medium' },
  launch: { autoLaunch: false },
  task: { daily: '21:20', weekly: '10:10', monthly: '10:20' },
  notification: { desktop: true, sound: 'default' }
}

/**
 * 字号档位对应的文字缩放倍率，写入根节点 CSS 变量 --font-scale。
 * 基准为 14px（中档 = 1.0），小档 12px、大档 16px，按比例换算；
 * 只作用于字号 token，间距与图标尺寸不随之变化。
 */
export const FONT_SIZE_SCALE: Record<FontSize, number> = {
  small: 12 / 14,
  medium: 1,
  large: 16 / 14
}

/** 通知提示音的下拉选项 */
export const NOTIFICATION_SOUND_OPTIONS: Array<{
  value: NotificationSound
  label: string
}> = [
  { value: 'default', label: '默认提示音' },
  { value: 'chime', label: '清脆' },
  { value: 'silent', label: '静音' }
]
