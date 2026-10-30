/**
 * 通知服务：持久化经营报告提醒、推送到渲染层并弹系统通知。
 * 数据存于 `~/.nova/notifications.json`，最多保留 50 条。
 */
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { Notification } from 'electron'
import type { BrowserWindow } from 'electron'
import { IPC_EVENT } from '@shared/ipc-channels'
import type { AppNotification } from '@shared/types/notification'
import { readJsonFile, withFileLock, writeJsonFile } from './json-file'
import { NOVA_HOME, getSettings } from './settings'

const NOTIFICATIONS_FILE = join(NOVA_HOME, 'notifications.json')
const NOTIFICATIONS_LOCK = 'notifications'
const MAX_ITEMS = 50

let cached: AppNotification[] | null = null
let windowGetter: (() => BrowserWindow | null) | null = null

/** 由通知 IPC 注册时绑定当前窗口，用于把新通知推给渲染层 */
export function bindNotificationWindow(getter: () => BrowserWindow | null): void {
  windowGetter = getter
}

function isNotification(value: unknown): value is AppNotification {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<AppNotification>
  return (
    typeof item.id === 'string' &&
    typeof item.title === 'string' &&
    typeof item.description === 'string' &&
    typeof item.taskId === 'string' &&
    typeof item.createdAt === 'string' &&
    typeof item.unread === 'boolean'
  )
}

async function load(): Promise<AppNotification[]> {
  if (cached) return cached
  try {
    const stored = await readJsonFile<unknown>(NOTIFICATIONS_FILE)
    cached = Array.isArray(stored) ? stored.filter(isNotification) : []
  } catch {
    cached = []
  }
  return cached
}

async function persist(items: AppNotification[]): Promise<void> {
  cached = items
  await writeJsonFile(NOTIFICATIONS_FILE, items)
}

/** 通知列表：新到旧 */
export async function listNotifications(): Promise<AppNotification[]> {
  return structuredClone(await load())
}

/** 标记单条已读，返回最新列表 */
export async function markNotificationRead(id: string): Promise<AppNotification[]> {
  return withFileLock(NOTIFICATIONS_LOCK, async () => {
    const items = await load()
    const next = items.map((item) => (item.id === id ? { ...item, unread: false } : item))
    await persist(next)
    return structuredClone(next)
  })
}

/** 全部已读，返回最新列表 */
export async function markAllNotificationsRead(): Promise<AppNotification[]> {
  return withFileLock(NOTIFICATIONS_LOCK, async () => {
    const items = await load()
    const next = items.map((item) => ({ ...item, unread: false }))
    await persist(next)
    return structuredClone(next)
  })
}

/** 弹系统通知；是否弹由设置里的「桌面通知」开关决定 */
async function showDesktopNotification(item: AppNotification): Promise<void> {
  if (!Notification.isSupported()) return

  const settings = await getSettings()
  if (!settings.notification.desktop) return

  try {
    const notification = new Notification({
      title: item.title,
      body: item.description,
      silent: settings.notification.sound === 'silent'
    })
    notification.on('click', () => {
      const window = windowGetter?.()
      if (!window || window.isDestroyed()) return
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
    })
    notification.show()
  } catch (error) {
    console.error('[notifier] desktop notification failed', error)
  }
}

/**
 * 新增一条通知：落盘、推给渲染层（红点即时更新）并按设置弹系统通知。
 * 返回创建后的通知，便于调用方复用。
 */
export async function createNotification(input: {
  title: string
  description: string
  taskId: string
}): Promise<AppNotification> {
  const notification: AppNotification = {
    id: randomUUID(),
    title: input.title.slice(0, 80),
    description: input.description.slice(0, 200),
    taskId: input.taskId,
    createdAt: new Date().toISOString(),
    unread: true
  }

  await withFileLock(NOTIFICATIONS_LOCK, async () => {
    const items = await load()
    await persist([notification, ...items].slice(0, MAX_ITEMS))
  })

  const window = windowGetter?.()
  if (window && !window.isDestroyed()) {
    window.webContents.send(IPC_EVENT.notificationEvent, notification)
  }

  await showDesktopNotification(notification)
  return notification
}
