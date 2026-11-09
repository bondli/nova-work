import { useSyncExternalStore } from 'react';
import { AppState, Appearance } from 'react-native';

import { appPreferences, type FontSizePreference, type ThemePreference } from './preferences';

/** 浅色色板：与桌面端同源（品牌色 #4f46e5、中性灰、12px 圆角） */
const lightColors = {
  bg: '#f4f4f5',
  card: '#ffffff',
  /** 浮层（底部抽屉 / 弹窗）底色：浅色与卡片一致 */
  sheet: '#ffffff',
  subtle: '#fafafa',
  fg: '#18181b',
  muted: '#71717a',
  faint: '#a1a1aa',
  border: '#e4e4e7',
  divider: '#f1f1f3',
  tabsBg: '#f4f4f5',
  tabsActiveBg: '#ffffff',
  brand: '#4f46e5',
  brandSoft: '#eef2ff',
  brandDark: '#4338ca',
  brandBorder: '#c7d2fe',
  brandLight: '#818cf8',
  onBrand: '#ffffff',
  success: '#16a34a',
  successSoft: '#ecfdf5',
  successBg: '#dcfce7',
  warning: '#d97706',
  warningSoft: '#fffbeb',
  warningBg: '#fef3c7',
  warningText: '#92400e',
  danger: '#dc2626',
  dangerSoft: '#fef2f2',
  dangerBg: '#fee2e2',
} as const;

export type Palette = { [K in keyof typeof lightColors]: string };

/** 暗色色板：同一套语义 token，保证卡片/分割线/品牌色在深色下依然清晰 */
const darkColors: Palette = {
  bg: '#09090b',
  card: '#18181b',
  /** 浮层底色比页面/卡片更亮一档，深色下能清晰辨认抽屉起点 */
  sheet: '#1e1e22',
  subtle: '#232326',
  fg: '#fafafa',
  muted: '#a1a1aa',
  faint: '#71717a',
  border: '#2e2e33',
  divider: '#27272a',
  tabsBg: '#27272a',
  tabsActiveBg: '#3f3f46',
  brand: '#6366f1',
  brandSoft: '#312e81',
  brandDark: '#a5b4fc',
  brandBorder: '#818cf8',
  brandLight: '#a5b4fc',
  onBrand: '#ffffff',
  success: '#4ade80',
  successSoft: '#052e16',
  successBg: '#14532d',
  warning: '#fbbf24',
  warningSoft: '#2a2008',
  warningBg: '#451a03',
  warningText: '#fcd34d',
  danger: '#f87171',
  dangerSoft: '#2a0f0f',
  dangerBg: '#450a0a',
};

export type ResolvedTheme = 'light' | 'dark';

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

let currentMode: ResolvedTheme = resolveTheme(appPreferences.theme);
let fontBase = appPreferences.fontSize;

/** 主题版本号：每次切换主题/字号 +1，样式表据此重建 */
let revision = 0;
const listeners = new Set<() => void>();

function notify(): void {
  revision += 1;
  listeners.forEach((listener) => listener());
}

/** 可变色板：切换主题时就地更新，组件重渲染即可拿到新颜色 */
export const colors: Palette = { ...(currentMode === 'dark' ? darkColors : lightColors) };

/** 以 14px 为基准缩放字号，设置里的 12/14/16 直接映射到全部文本 */
export function fs(size: number): number {
  return Math.round(((size * fontBase) / 14) * 10) / 10;
}

export function getThemeRevision(): number {
  return revision;
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 立即应用主题/字号（不重启应用），并通知所有订阅组件重渲染 */
export function applyAppearance(theme: ThemePreference, fontSize: FontSizePreference): void {
  currentMode = resolveTheme(theme);
  Object.assign(colors, currentMode === 'dark' ? darkColors : lightColors);
  fontBase = fontSize;
  notify();
}

/** 订阅主题版本：放在页面根组件即可让整页即时跟随设置变化 */
export function useThemeRevision(): number {
  return useSyncExternalStore(subscribeTheme, getThemeRevision, getThemeRevision);
}

/** 组件内读取当前解析后的主题 */
export function useThemeMode(): ResolvedTheme {
  useThemeRevision();
  return currentMode;
}

// 跟随系统：偏好为 system 时，系统深浅色变化即时生效
Appearance.addChangeListener(() => {
  if (appPreferences.theme === 'system') applyAppearance('system', appPreferences.fontSize);
});

// 系统深色可能在应用后台时切换（如夜间自动开启），回到前台时重新解析一次，避免界面停留在旧配色
AppState.addEventListener('change', (state) => {
  if (state === 'active' && appPreferences.theme === 'system') {
    applyAppearance('system', appPreferences.fontSize);
  }
});

export const radius = {
  control: 10,
  card: 12,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

/** 字号 getter：读取时才按当前基准换算，切换字号即时生效 */
export const font = {
  get caption() {
    return fs(11);
  },
  get meta() {
    return fs(12);
  },
  get body() {
    return fs(14);
  },
  get title() {
    return fs(16);
  },
  get metric() {
    return fs(24);
  },
};

/** 最小点击区 44 */
export const HIT_SIZE = 44;
