/**
 * 文件共享 IPC 处理器。
 * 渲染层通过 window.nova.share.* 调用，主进程负责本地文件操作与中继转发。
 */
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { IPC, IPC_EVENT } from '@shared/ipc-channels'
import { ShareRelayClient, type Peer, type RelayStatus } from '../share-files/relay-client'
import { addToShare, deleteShareFile, listShareFiles, type ShareFileInfo } from '../share-files/service'
import { failure, internalFailure, success } from './helpers'

const deviceIdSchema = z.string().min(1).max(64)
const fileNameSchema = z.string().min(1).max(255)

/** 中继客户端单例，由 registerShareIpc 初始化 */
let relayClient: ShareRelayClient | null = null
let getMainWindow: (() => BrowserWindow | null) | null = null

/** 启动中继客户端（应用登录后调用） */
export function startShareRelay(): void {
  if (relayClient) return
  relayClient = new ShareRelayClient((status) => {
    const win = getMainWindow?.()
    if (win) win.webContents.send(IPC_EVENT.shareStatus, status)
  })
  void relayClient.start()
}

/** 停止中继客户端（登出时调用） */
export function stopShareRelay(): void {
  relayClient?.shutdown()
  relayClient = null
}

export function registerShareIpc(getWindow: () => BrowserWindow | null): void {
  getMainWindow = getWindow

  ipcMain.handle(IPC.shareLocalList, async () => {
    try {
      return success(await listShareFiles())
    } catch (error) {
      return internalFailure(error)
    }
  })

  ipcMain.handle(IPC.shareLocalUpload, async (event) => {
    try {
      const options: Electron.OpenDialogOptions = {
        properties: ['openFile'],
        title: '选择要共享的文件',
      }
      const parent = BrowserWindow.fromWebContents(event.sender)
      const { canceled, filePaths } = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options)
      if (canceled || !filePaths[0]) return success(null)

      const name = await addToShare(filePaths[0])
      return success({ name, path: filePaths[0] })
    } catch (error) {
      return internalFailure(error)
    }
  })

  ipcMain.handle(IPC.shareLocalDelete, async (_event, input: unknown) => {
    const parsed = fileNameSchema.safeParse(input)
    if (!parsed.success) return failure('INVALID_INPUT', '文件名不合法')
    try {
      await deleteShareFile(parsed.data)
      return success(null)
    } catch (error) {
      return internalFailure(error)
    }
  })

  ipcMain.handle(IPC.shareDevices, async () => {
    try {
      const status = relayClient?.getStatus() ?? { connected: false, peers: [], lastError: '中继未启动' }
      return success(status)
    } catch (error) {
      return internalFailure(error)
    }
  })

  ipcMain.handle(IPC.shareRemoteList, async (_event, input: unknown) => {
    const parsed = deviceIdSchema.safeParse(input)
    if (!parsed.success) return failure('INVALID_INPUT', '设备 ID 不合法')
    if (!relayClient) return failure('INTERNAL_ERROR', '中继未启动')
    try {
      const files = await relayClient.listRemote(parsed.data)
      return success(files as ShareFileInfo[])
    } catch (error) {
      return internalFailure(error)
    }
  })

  ipcMain.handle(IPC.shareRemoteDownload, async (event, input: unknown) => {
    const schema = z.object({ deviceId: deviceIdSchema, name: fileNameSchema })
    const parsed = schema.safeParse(input)
    if (!parsed.success) return failure('INVALID_INPUT', '参数不合法')
    if (!relayClient) return failure('INTERNAL_ERROR', '中继未启动')
    try {
      const { deviceId, name } = parsed.data
      // 进度实时推给渲染层，避免大文件只看到「下载中」而无反馈
      const buffer = await relayClient.downloadRemote(deviceId, name, (progress) => {
        const win = getMainWindow?.()
        if (win) {
          win.webContents.send(IPC_EVENT.shareProgress, {
            deviceId,
            name: progress.name,
            received: progress.received,
            total: progress.total,
          })
        }
      })
      const options: Electron.SaveDialogOptions = {
        defaultPath: name,
        title: '保存文件',
      }
      const parent = BrowserWindow.fromWebContents(event.sender)
      const { canceled, filePath } = parent
        ? await dialog.showSaveDialog(parent, options)
        : await dialog.showSaveDialog(options)
      if (canceled || !filePath) return success({ filePath: null })
      await writeFile(filePath, buffer)
      return success({ filePath })
    } catch (error) {
      return internalFailure(error)
    }
  })

  ipcMain.handle(IPC.shareRemoteCancel, async (_event, input: unknown) => {
    const schema = z.object({ deviceId: deviceIdSchema, name: fileNameSchema })
    const parsed = schema.safeParse(input)
    if (!parsed.success) return failure('INVALID_INPUT', '参数不合法')
    if (!relayClient) return failure('INTERNAL_ERROR', '中继未启动')
    try {
      const canceled = relayClient.cancelRemote(parsed.data.deviceId, parsed.data.name)
      return success(canceled)
    } catch (error) {
      return internalFailure(error)
    }
  })

  ipcMain.handle(IPC.shareStatus, async () => {
    try {
      const status = relayClient?.getStatus() ?? { connected: false, peers: [], lastError: '中继未启动' }
      return success(status)
    } catch (error) {
      return internalFailure(error)
    }
  })
}

/** 供渲染层订阅中继状态变更 */
export type { Peer, RelayStatus }
