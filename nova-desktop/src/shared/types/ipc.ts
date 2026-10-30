/**
 * IPC 统一返回结构。
 * 主进程不向渲染层抛异常，而是返回 { ok, data } 或 { ok, error }，避免 Electron 序列化丢失错误细节。
 */

/** 渲染层可直接映射为提示文案的错误码 */
export type IpcErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_CREDENTIALS'
  | 'USERNAME_TAKEN'
  | 'UNAUTHENTICATED'
  | 'NOT_CONFIGURED'
  | 'SERVICE_UNAVAILABLE'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'

/** 错误结构：错误码 + 面向用户的提示文案 */
export interface IpcError {
  code: IpcErrorCode
  message: string
}

/** 判别联合类型，渲染层通过 result.ok 收窄后再取 data / error */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError }
