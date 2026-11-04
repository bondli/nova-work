import Taro from '@tarojs/taro'
import { API_BASE_URL, TOKEN_KEY, UNAUTHORIZED_EVENT } from '@/constants'

export class ApiError extends Error {
  code: string
  status: number

  constructor(code: string, status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

interface RequestOptions {
  method?: Method
  data?: Record<string, unknown>
  /** 401 时不清理登录态（登录类接口本身不依赖 token） */
  skipAuth?: boolean
}

export interface Envelope<T> {
  success?: boolean
  data?: T
  count?: number
  points?: number
  code?: string
  message?: string
}

const authHeader = (): Record<string, string> => {
  const token = Taro.getStorageSync(TOKEN_KEY) as string | undefined
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const clearAuth = (): void => {
  Taro.removeStorageSync(TOKEN_KEY)
  Taro.removeStorageSync('nova_member')
  Taro.eventCenter.trigger(UNAUTHORIZED_EVENT)
}

async function send<T>(path: string, options: RequestOptions = {}): Promise<Envelope<T>> {
  const { method = 'GET', data, skipAuth = false } = options
  let response: Taro.request.SuccessCallbackResult<Envelope<T>> | undefined

  try {
    response = await Taro.request<Envelope<T>>({
      url: `${API_BASE_URL}${path}`,
      method,
      data,
      header: { 'Content-Type': 'application/json', ...authHeader() }
    })
  } catch (error) {
    throw new ApiError('NETWORK_ERROR', 0, '网络异常，请检查网络后重试')
  }

  const body = response.data ?? {}
  if (response.statusCode === 401) {
    if (!skipAuth) clearAuth()
    throw new ApiError(body.code ?? 'UNAUTHORIZED', 401, body.message ?? '登录已过期，请重新授权')
  }

  if (!body.success) {
    throw new ApiError(body.code ?? 'UNKNOWN', response.statusCode, body.message ?? '请求失败，请稍后重试')
  }

  return body
}

/** 单对象接口：直接返回 data */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const body = await send<T>(path, options)
  return body.data as T
}

/** 需要读取 data 之外的附加字段（如兑换列表的 points）时使用 */
export async function requestMeta<T>(path: string, options: RequestOptions = {}): Promise<Envelope<T>> {
  return send<T>(path, options)
}

/** 分页接口：统一返回 list + count */
export async function requestPage<T>(
  path: string,
  options: RequestOptions = {}
): Promise<{ list: T[]; count: number }> {
  const body = await send<T[]>(path, options)
  return { list: body.data ?? [], count: body.count ?? 0 }
}
