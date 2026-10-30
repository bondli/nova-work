/**
 * 通知 IPC：列表、单条已读、全部已读。
 * 新通知由主进程通过 notify:event 主动推送，渲染层无需轮询。
 */
import { ipcMain, type BrowserWindow } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/ipc-channels'
import { getSession } from '../services/auth'
import {
  bindNotificationWindow,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from '../services/notifier'
import { failure, internalFailure, success } from './helpers'

const readSchema = z.object({ id: z.string().min(1).max(80) })

export function registerNotificationIpc(getWindow: () => BrowserWindow | null): void {
  // 绑定窗口，供定时任务完成时把新通知推给渲染层
  bindNotificationWindow(getWindow)

  ipcMain.handle(IPC.notifyList, async () => {
    if (!(await getSession())) return failure('UNAUTHENTICATED', '请先登录')
    try {
      return success(await listNotifications())
    } catch (error) {
      return internalFailure(error)
    }
  })

  ipcMain.handle(IPC.notifyRead, async (_event, input: unknown) => {
    if (!(await getSession())) return failure('UNAUTHENTICATED', '请先登录')
    const parsed = readSchema.safeParse(input)
    if (!parsed.success) return failure('INVALID_INPUT', '通知参数不合法')
    try {
      return success(await markNotificationRead(parsed.data.id))
    } catch (error) {
      return internalFailure(error)
    }
  })

  ipcMain.handle(IPC.notifyReadAll, async () => {
    if (!(await getSession())) return failure('UNAUTHENTICATED', '请先登录')
    try {
      return success(await markAllNotificationsRead())
    } catch (error) {
      return internalFailure(error)
    }
  })
}
