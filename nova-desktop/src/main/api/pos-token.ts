/**
 * POS 访问令牌。
 * 主进程用内部令牌向 nova-pos-server 换取 JWT，随后所有业务请求携带 Bearer 令牌；
 * 令牌只存在主进程内存，渲染层无法读取或伪造身份。
 */
import type { AuthUser } from '@shared/types/auth'
import { getSession } from '../services/auth'
import { getServerConfig } from '../services/server-config'
import { PosClientError, toNetworkError } from './pos-errors'

const TOKEN_TIMEOUT_MS = 10_000
/** 提前 1 分钟视为过期，避免请求途中失效 */
const EXPIRY_SKEW_MS = 60_000

interface CachedToken {
  token: string
  expiresAt: number
  userId: string
}

let cached: CachedToken | null = null

export function clearPosToken(): void {
  cached = null
}

async function fetchToken(user: AuthUser): Promise<string> {
  const config = await getServerConfig()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS)

  try {
    const response = await fetch(`${config.baseUrl}/auth/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.token ? { 'x-nova-token': config.token } : {})
      },
      body: JSON.stringify({ userId: user.id, username: user.username, role: user.role }),
      signal: controller.signal
    })

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).trim()
      throw new PosClientError(
        response.status === 401 ? 'FORBIDDEN' : 'INTERNAL_ERROR',
        detail || `服务端返回 ${response.status}`
      )
    }

    const body = (await response.json()) as { token?: unknown; expiresIn?: unknown }
    if (typeof body.token !== 'string' || typeof body.expiresIn !== 'number') {
      throw new PosClientError('INTERNAL_ERROR', '服务端返回的令牌格式不正确')
    }

    cached = {
      token: body.token,
      expiresAt: Date.now() + body.expiresIn * 1000,
      userId: user.id
    }
    return cached.token
  } catch (error) {
    if (error instanceof PosClientError) throw error
    const networkError = toNetworkError(
      error,
      config.baseUrl,
      `换取访问令牌超时（${config.baseUrl}），请检查服务端状态`
    )
    if (networkError) throw networkError
    throw new PosClientError(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : '获取访问令牌失败'
    )
  } finally {
    clearTimeout(timer)
  }
}

/** 取当前会话的 JWT；force 用于 401 后的强制续签 */
export async function getPosAccessToken(force = false): Promise<string> {
  const session = await getSession()
  if (!session) {
    throw new PosClientError('UNAUTHENTICATED', '登录状态已失效，请重新登录')
  }

  if (
    !force &&
    cached &&
    cached.userId === session.id &&
    Date.now() < cached.expiresAt - EXPIRY_SKEW_MS
  ) {
    return cached.token
  }

  return fetchToken(session)
}
