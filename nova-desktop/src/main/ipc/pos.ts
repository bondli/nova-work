import { BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { z } from 'zod'
import { IPC } from '@shared/ipc-channels'
import type { PosExportInput } from '@shared/types/pos'
import { posExportFile, posRequest, posUploadFile, PosClientError } from '../api/pos-client'
import { failure, internalFailure, success } from './helpers'

/**
 * 业务数据 IPC 处理器。
 * 渲染层只传方法 / 路径 / 查询参数与请求体，令牌与身份由主进程注入。
 */

const queryValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])

const endpointPathSchema = z.string().regex(/^\/[A-Za-z0-9/_-]+$/, '接口路径不合法')

const posRequestSchema = z.object({
  method: z.enum(['GET', 'POST']),
  path: endpointPathSchema,
  query: z.record(z.string(), queryValueSchema).optional(),
  body: z.unknown().optional()
})

const posExportSchema = z.object({
  path: endpointPathSchema,
  body: z.unknown().optional(),
  filename: z.string().min(1).max(120)
})

export function registerPosIpc(): void {
  ipcMain.handle(IPC.posRequest, async (_event, input: unknown) => {
    const parsed = posRequestSchema.safeParse(input)
    if (!parsed.success) {
      return failure('INVALID_INPUT', parsed.error.issues[0]?.message ?? '请求参数不合法')
    }

    try {
      return success(await posRequest(parsed.data))
    } catch (error) {
      if (error instanceof PosClientError) return failure(error.code, error.message)
      return internalFailure(error)
    }
  })

  ipcMain.handle(IPC.posExport, async (event, input: unknown) => {
    const parsed = posExportSchema.safeParse(input)
    if (!parsed.success) {
      return failure('INVALID_INPUT', parsed.error.issues[0]?.message ?? '请求参数不合法')
    }

    try {
      const buffer = await posExportFile(parsed.data as PosExportInput)
      const options: Electron.SaveDialogOptions = {
        defaultPath: parsed.data.filename,
        filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
      }
      const parent = BrowserWindow.fromWebContents(event.sender)
      const { canceled, filePath } = parent
        ? await dialog.showSaveDialog(parent, options)
        : await dialog.showSaveDialog(options)
      if (canceled || !filePath) return success({ filePath: null })

      await writeFile(filePath, buffer)
      return success({ filePath })
    } catch (error) {
      if (error instanceof PosClientError) return failure(error.code, error.message)
      return internalFailure(error)
    }
  })

  // 批量出入库：主进程弹出文件选择框，读取 Excel 后交给服务端解析
  ipcMain.handle(IPC.posUpload, async (event) => {
    try {
      const options: Electron.OpenDialogOptions = {
        properties: ['openFile'],
        filters: [{ name: 'Excel 工作簿', extensions: ['xlsx', 'xls'] }]
      }
      const parent = BrowserWindow.fromWebContents(event.sender)
      const { canceled, filePaths } = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options)
      if (canceled || !filePaths[0]) return success(null)

      const buffer = await readFile(filePaths[0])
      const uploaded = await posUploadFile({ filename: basename(filePaths[0]), buffer })
      return success({ ...uploaded, filename: basename(filePaths[0]) })
    } catch (error) {
      if (error instanceof PosClientError) return failure(error.code, error.message)
      return internalFailure(error)
    }
  })
}
