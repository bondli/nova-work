/** IPC 返回值构造工具，保证所有处理器返回统一结构 */
import type { IpcError, IpcErrorCode, IpcResult } from '@shared/types/ipc'

export function success<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}

export function failure<T>(
  code: IpcErrorCode,
  message: string
): IpcResult<T> {
  const error: IpcError = { code, message }
  return { ok: false, error }
}

/** 兜底处理未预期异常：记录日志并返回 INTERNAL_ERROR */
export function internalFailure<T>(error: unknown): IpcResult<T> {
  const message = error instanceof Error ? error.message : '未知错误'
  console.error('[ipc] unhandled error', error)
  return failure('INTERNAL_ERROR', message)
}
