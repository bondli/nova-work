/**
 * 账号服务。
 * 账号唯一来源是 nova-pos-server 的 User 表：登录、注册都实时调用 POS 接口校验，
 * 本地不再保存任何账号或密码（历史上存在的 ~/.nova/users.json 会被忽略并清理）。
 * session.json 只保存会话态（用户标识与 remember 决定是否持久化），不保存凭据。
 */
import { join } from 'node:path'
import type {
  AuthUser,
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  Role
} from '@shared/types/auth'
import type { IpcErrorCode } from '@shared/types/ipc'
import { PosClientError, toNetworkError } from '../api/pos-errors'
import { getServerConfig } from './server-config'
import { readJsonFile, writeJsonFile } from './json-file'
import { NOVA_HOME } from './settings'

/** POS 用户表返回的账号信息 */
interface PosUser {
  id: number | string
  name: string
  realName?: string | null
  role?: string
}

interface StoredSession {
  userId: string
  username: string
  name: string
  role: Role
  createdAt: string
}

const LEGACY_USERS_FILE = join(NOVA_HOME, 'users.json')
const SESSION_FILE = join(NOVA_HOME, 'session.json')

const LOGIN_TIMEOUT_MS = 10_000

/** 带业务错误码的异常，IPC 层会转换为统一的 IpcResult 错误 */
export class AuthServiceError extends Error {
  readonly code: IpcErrorCode

  constructor(code: IpcErrorCode, message: string) {
    super(message)
    this.name = 'AuthServiceError'
    this.code = code
  }
}

function toAuthUser(user: PosUser): AuthUser {
  const username = user.name
  return {
    id: String(user.id),
    username,
    // 姓名缺失时退回用户名，避免界面出现空标题
    name: (user.realName ?? '').trim() || username,
    role: user.role === 'admin' ? 'admin' : 'clerk'
  }
}

/**
 * 调用 POS 的登录前接口（/user/login、/user/register）。
 * 此时还没有 JWT，只带内部令牌；内部令牌只存在主进程，渲染层无法获取。
 */
async function callPublicAuth(path: string, body: unknown): Promise<Record<string, unknown>> {
  const config = await getServerConfig()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS)

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.token ? { 'x-nova-token': config.token } : {})
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    const text = await response.text()
    const payload = (text ? JSON.parse(text) : {}) as Record<string, unknown>

    if (!response.ok) {
      const message =
        typeof payload.error === 'string' ? payload.error : `服务端返回 ${response.status}`
      const code: IpcErrorCode =
        response.status === 401
          ? 'INVALID_CREDENTIALS'
          : response.status === 403
            ? 'FORBIDDEN'
            : response.status === 409
              ? 'CONFLICT'
              : 'INTERNAL_ERROR'
      throw new AuthServiceError(code, message)
    }

    return payload
  } catch (error) {
    if (error instanceof AuthServiceError) throw error
    const networkError = toNetworkError(
      error,
      config.baseUrl,
      `连接 POS 服务端超时（${config.baseUrl}），请检查服务地址`
    )
    if (networkError) throw new AuthServiceError(networkError.code, networkError.message)
    throw new AuthServiceError(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : '连接 POS 服务失败'
    )
  } finally {
    clearTimeout(timer)
  }
}

let transientSession: StoredSession | null = null

async function loadSession(): Promise<StoredSession | null> {
  return transientSession ?? (await readJsonFile<StoredSession>(SESSION_FILE))
}

async function writeSession(user: AuthUser, persist: boolean): Promise<void> {
  const session: StoredSession = {
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    createdAt: new Date().toISOString()
  }

  if (persist) {
    await writeJsonFile(SESSION_FILE, session)
    transientSession = null
    return
  }

  transientSession = session
  await removeSessionFile()
}

async function removeSessionFile(): Promise<void> {
  const { unlink } = await import('node:fs/promises')
  try {
    await unlink(SESSION_FILE)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

/** 删除历史遗留的本地账号文件；账号已统一到 POS 服务 */
async function removeLegacyUsersFile(): Promise<void> {
  const { unlink } = await import('node:fs/promises')
  try {
    await unlink(LEGACY_USERS_FILE)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

/** 读取当前会话；没有会话时返回 null */
export async function getSession(): Promise<AuthUser | null> {
  const session = await loadSession()
  if (!session) return null

  return {
    id: session.userId,
    username: session.username,
    name: session.name,
    role: session.role
  }
}

/** 用户名与密码交给 POS 校验；通过后按 remember 决定会话是否持久化 */
export async function login(input: LoginInput): Promise<AuthUser> {
  const username = input.username.trim()
  if (!username || !input.password) {
    throw new AuthServiceError('INVALID_INPUT', '请输入用户名和密码')
  }

  let payload: Record<string, unknown>
  try {
    payload = await callPublicAuth('/user/login', {
      name: username,
      password: input.password
    })
  } catch (error) {
    // 统一面向用户的文案，避免把服务端措辞直接暴露到登录页
    if (error instanceof AuthServiceError && error.code === 'INVALID_CREDENTIALS') {
      throw new AuthServiceError('INVALID_CREDENTIALS', '用户名或密码不正确')
    }
    throw error
  }

  const user = toAuthUser(payload as unknown as PosUser)
  await removeLegacyUsersFile()
  await writeSession(user, input.remember)
  return user
}

/** 注册：账号写入 POS 的 User 表，角色由服务端固定为导购员 */
export async function register(input: RegisterInput): Promise<AuthUser> {
  const username = input.username.trim()
  const payload = await callPublicAuth('/user/register', {
    name: username,
    realName: input.name.trim(),
    password: input.password
  })

  if (typeof payload.error === 'string') {
    const taken = /已存在/.test(payload.error)
    throw new AuthServiceError(taken ? 'CONFLICT' : 'INTERNAL_ERROR', payload.error)
  }

  const user = toAuthUser(payload as unknown as PosUser)
  await writeSession(user, true)
  return user
}

/** 清除内存会话与持久化的 session.json */
export async function logout(): Promise<void> {
  transientSession = null
  await removeSessionFile()
}

/**
 * 修改密码。
 * 实际校验与落库由 POS 的 /user/changePassword 完成（需要 JWT 与旧密码），
 * 调用方在成功后应清理会话，要求用新密码重新登录。
 */
export async function changePassword(input: ChangePasswordInput): Promise<void> {
  const session = await getSession()
  if (!session) {
    throw new AuthServiceError('UNAUTHENTICATED', '登录状态已失效，请重新登录')
  }

  if (!input.currentPassword) {
    throw new AuthServiceError('INVALID_INPUT', '请输入原密码')
  }
  if (input.newPassword.length < 6) {
    throw new AuthServiceError('INVALID_INPUT', '新密码至少 6 位')
  }

  const config = await getServerConfig()
  const { getPosAccessToken } = await import('../api/pos-token')

  try {
    const response = await fetch(`${config.baseUrl}/user/changePassword`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${await getPosAccessToken()}`
      },
      body: JSON.stringify({
        currentPassword: input.currentPassword,
        newPassword: input.newPassword
      })
    })

    if (!response.ok) {
      const text = (await response.text().catch(() => '')).trim()
      let message = `服务端返回 ${response.status}`
      try {
        const parsed = JSON.parse(text) as { error?: string }
        if (parsed.error) message = parsed.error
      } catch {
        if (text) message = text
      }
      throw new AuthServiceError(
        response.status === 400 ? 'INVALID_CREDENTIALS' : 'INTERNAL_ERROR',
        message
      )
    }

    await logout()
  } catch (error) {
    if (error instanceof AuthServiceError) throw error
    if (error instanceof PosClientError) throw new AuthServiceError(error.code, error.message)
    const networkError = toNetworkError(
      error,
      config.baseUrl,
      `修改密码超时（${config.baseUrl}），请稍后重试`
    )
    if (networkError) throw new AuthServiceError(networkError.code, networkError.message)
    throw new AuthServiceError(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : '修改密码失败'
    )
  }
}
