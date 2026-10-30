import type { IpcErrorCode, IpcResult } from '@shared/types/ipc'

/** 把主进程返回的错误结果包装成可 catch 的异常 */
export class IpcCallError extends Error {
  readonly code: IpcErrorCode

  constructor(code: IpcErrorCode, message: string) {
    super(message)
    this.name = 'IpcCallError'
    this.code = code
  }
}

/** 解包 IpcResult：成功返回数据，失败抛出带错误码的 IpcCallError */
export function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) throw new IpcCallError(result.error.code, result.error.message)
  return result.data
}
