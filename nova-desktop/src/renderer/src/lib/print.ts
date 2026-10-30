import type { PrintHtmlResult } from '@shared/types/print'
import { unwrap } from './ipc'

/** 打印 HTML 小票，返回是否成功发送到打印机 */
export async function printReceiptHtml(html: string): Promise<PrintHtmlResult> {
  return unwrap(await window.nova.print.html(html))
}
