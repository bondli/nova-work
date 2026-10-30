/**
 * pos-server 调用的错误类型。
 * 单独放置，避免 pos-client 与 pos-token 相互引用。
 */
import type { IpcErrorCode } from '@shared/types/ipc'

export class PosClientError extends Error {
  readonly code: IpcErrorCode

  constructor(code: IpcErrorCode, message: string) {
    super(message)
    this.name = 'PosClientError'
    this.code = code
  }
}

/** Node fetch 连接失败时把底层错误挂在 cause 上，据此给出可排障的提示 */
interface NetworkCause {
  code?: string
}

/**
 * 把连接层失败翻译成带排查方向的错误。
 * 返回 null 表示不是网络类错误，交由调用方按内部错误处理。
 */
export function toNetworkError(
  error: unknown,
  baseUrl: string,
  timeoutMessage: string
): PosClientError | null {
  if (!(error instanceof Error)) return null

  if (error.name === 'AbortError') {
    return new PosClientError('SERVICE_UNAVAILABLE', timeoutMessage)
  }

  const code = (error as Error & { cause?: NetworkCause }).cause?.code

  switch (code) {
    case 'ECONNREFUSED':
      return new PosClientError(
        'SERVICE_UNAVAILABLE',
        `无法连接 POS 服务端（${baseUrl}）：连接被拒绝，请先启动 nova-pos-server 后重试`
      )
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return new PosClientError(
        'SERVICE_UNAVAILABLE',
        `无法解析 POS 服务端地址（${baseUrl}），请检查「设置 → 数据设置」中的服务地址`
      )
    case 'ETIMEDOUT':
    case 'UND_ERR_CONNECT_TIMEOUT':
      return new PosClientError(
        'SERVICE_UNAVAILABLE',
        `连接 POS 服务端超时（${baseUrl}），请检查网络或服务端状态`
      )
    case 'ECONNRESET':
      return new PosClientError(
        'SERVICE_UNAVAILABLE',
        `与 POS 服务端的连接被重置（${baseUrl}），请稍后重试`
      )
    default:
      break
  }

  // cause 缺失时兜底：fetch 的连接失败统一是 TypeError('fetch failed')
  if (error.message === 'fetch failed') {
    return new PosClientError(
      'SERVICE_UNAVAILABLE',
      `无法连接 POS 服务端（${baseUrl}），请确认服务已启动后重试`
    )
  }

  return null
}
