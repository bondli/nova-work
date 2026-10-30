import { BrowserWindow, ipcMain } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/ipc-channels'
import type { PrintHtmlResult } from '@shared/types/print'
import { failure, internalFailure, success } from './helpers'

/** 58mm 热敏小票纸，宽度按 52mm 可打印区域计算（Electron 单位为微米） */
const RECEIPT_PAGE_SIZE = { width: 52_000, height: 297_000 }

const printHtmlSchema = z.object({
  html: z.string().min(1).max(500_000)
})

/**
 * 小票打印：把渲染层生成的 HTML 放进隐藏窗口，交给 Electron 原生打印。
 * - 有打印机：静默打印到系统默认打印机，不打断收银；
 * - 没有打印机：打开系统打印面板，由用户在面板里选择打印机 / 另存为 PDF。
 *   注意 macOS 上隐藏窗口弹面板会报「No printers available on the network」，所以先显示窗口。
 */
export function registerPrintIpc(): void {
  ipcMain.handle(IPC.printHtml, async (_event, input: unknown) => {
    const parsed = printHtmlSchema.safeParse(input)
    if (!parsed.success) {
      return failure('INVALID_INPUT', parsed.error.issues[0]?.message ?? '打印参数不合法')
    }

    let printWindow: BrowserWindow | null = null
    try {
      printWindow = new BrowserWindow({
        show: false,
        width: 320,
        height: 640,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false
        }
      })

      await printWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(parsed.data.html)}`
      )

      const printers = await printWindow.webContents.getPrintersAsync()
      const target = printers.find((printer) => printer.isDefault) ?? printers[0]

      const result = await new Promise<PrintHtmlResult>((resolve) => {
        const options = {
          printBackground: true,
          margins: { marginType: 'none' as const },
          pageSize: RECEIPT_PAGE_SIZE
        }
        if (!target) {
          printWindow?.showInactive()
        }
        printWindow?.webContents.print(
          target ? { ...options, silent: true, deviceName: target.name } : { ...options, silent: false },
          (printed, reason) => resolve({ printed, reason })
        )
      })

      return success(result)
    } catch (error) {
      return internalFailure(error)
    } finally {
      if (printWindow && !printWindow.isDestroyed()) printWindow.destroy()
    }
  })
}
