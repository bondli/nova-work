/** 小票打印结果，由主进程通过 Electron 打印能力返回 */
export interface PrintHtmlResult {
  printed: boolean
  /** 打印失败或用户取消时的原因 */
  reason?: string
}
