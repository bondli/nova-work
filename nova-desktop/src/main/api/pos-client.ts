/**
 * nova-pos-server HTTP 客户端。
 * 渲染层不直接发起请求：主进程完成端点白名单校验、JWT 注入与错误码映射。
 * 身份不再通过请求头传递，服务端从签名令牌中提取；客户端版本与操作系统随请求头上报，供操作日志记录。
 */
import { release } from 'node:os'

import type {
  PosExportInput,
  PosImageUploadResult,
  PosRequestInput,
  PosUploadResult
} from '@shared/types/pos'
import type { IpcErrorCode } from '@shared/types/ipc'
import { getServerConfig } from '../services/server-config'
import { getSession } from '../services/auth'
import { isEndpointAllowed } from './endpoints'
import { PosClientError, toNetworkError } from './pos-errors'
import { clearPosToken, getPosAccessToken } from './pos-token'

export { PosClientError } from './pos-errors'

const TIMEOUT_MS = 10_000
/** 导出需要服务端现算并生成文件，单独放宽超时 */
const EXPORT_TIMEOUT_MS = 60_000
/** 批量出入库的 Excel 解析在服务端完成，放宽超时 */
const UPLOAD_TIMEOUT_MS = 60_000

const OS_NAMES: Record<string, string> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }

/** 服务端操作日志需要记录客户端版本与操作系统，随每次请求上报 */
function clientHeaders(): Record<string, string> {
  const osName = OS_NAMES[process.platform] ?? process.platform
  return {
    'x-client-os': `${osName} ${release()}`,
    'x-client-version': __APP_VERSION__
  }
}

/** 把查询参数拼成 query string，忽略空值，避免服务端解析成字符串 "undefined" */
function buildQuery(query: PosRequestInput['query']): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue
    params.append(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

function mapHttpStatus(status: number): IpcErrorCode {
  if (status === 401) return 'UNAUTHENTICATED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 409) return 'CONFLICT'
  return 'INTERNAL_ERROR'
}

/** 旧接口在 HTTP 200 中返回 { error }，按语义转换为业务错误 */
function toBusinessError(body: unknown): PosClientError | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  if (!('error' in body)) return null

  const message = String((body as { error: unknown }).error)
  const code: IpcErrorCode = /exists|已存在|已经存在/i.test(message) ? 'CONFLICT' : 'NOT_FOUND'
  return new PosClientError(code, message)
}

async function send(
  url: string,
  method: 'GET' | 'POST',
  body: unknown,
  token: string,
  timeoutMs: number = TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...clientHeaders(),
        ...(method === 'POST' ? { 'content-type': 'application/json' } : {})
      },
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
      signal: controller.signal
    })
  } finally {
    clearTimeout(timer)
  }
}

/** 发起一次 pos-server 请求，成功时返回原始 JSON */
export async function posRequest(input: PosRequestInput): Promise<unknown> {
  if (!isEndpointAllowed(input.method, input.path)) {
    throw new PosClientError('FORBIDDEN', `未授权的接口：${input.method} ${input.path}`)
  }

  const session = await getSession()
  if (!session) {
    throw new PosClientError('UNAUTHENTICATED', '登录状态已失效，请重新登录')
  }

  const config = await getServerConfig()
  // 老系统不少 POST 接口（确认到账、修改订单、营销上下线）从 query 读取主键，GET / POST 都要拼查询参数
  const url = `${config.baseUrl}${input.path}${buildQuery(input.query)}`

  try {
    let response = await send(url, input.method, input.body, await getPosAccessToken())

    // 令牌过期或服务端重启后密钥变化：强制续签一次
    if (response.status === 401) {
      clearPosToken()
      response = await send(url, input.method, input.body, await getPosAccessToken(true))
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).trim()
      throw new PosClientError(
        mapHttpStatus(response.status),
        detail || `服务端返回 ${response.status}`
      )
    }

    const text = await response.text()
    const body: unknown = text ? JSON.parse(text) : null
    const businessError = toBusinessError(body)
    if (businessError) throw businessError
    return body
  } catch (error) {
    if (error instanceof PosClientError) throw error
    const networkError = toNetworkError(
      error,
      config.baseUrl,
      `POS 服务端响应超时（${config.baseUrl}），请稍后重试`
    )
    if (networkError) throw networkError
    throw new PosClientError(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : '服务端请求失败'
    )
  }
}

/** 上传文件的公共实现（multipart）：401 时刷新令牌重试一次 */
async function uploadMultipart(path: string, filename: string, buffer: Buffer): Promise<unknown> {
  if (!isEndpointAllowed('POST', path)) {
    throw new PosClientError('FORBIDDEN', `未授权的接口：POST ${path}`)
  }

  const session = await getSession()
  if (!session) {
    throw new PosClientError('UNAUTHENTICATED', '登录状态已失效，请重新登录')
  }

  const config = await getServerConfig()
  const url = `${config.baseUrl}${path}`

  const upload = async (token: string): Promise<Response> => {
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(buffer)]), filename)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, ...clientHeaders() },
        body: form,
        signal: controller.signal
      })
    } finally {
      clearTimeout(timer)
    }
  }

  try {
    let response = await upload(await getPosAccessToken())
    if (response.status === 401) {
      clearPosToken()
      response = await upload(await getPosAccessToken(true))
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).trim()
      throw new PosClientError(
        mapHttpStatus(response.status),
        detail || `服务端返回 ${response.status}`
      )
    }

    const text = await response.text()
    const body: unknown = text ? JSON.parse(text) : null
    const businessError = toBusinessError(body)
    if (businessError) throw businessError
    return body
  } catch (error) {
    if (error instanceof PosClientError) throw error
    const networkError = toNetworkError(
      error,
      config.baseUrl,
      `文件上传超时（${config.baseUrl}），请稍后重试`
    )
    if (networkError) throw networkError
    throw new PosClientError(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : '文件上传失败'
    )
  }
}

/** 上传本地 Excel 到 /common/uploadFile，由服务端解析成 JSON 行数据 */
export async function posUploadFile(input: {
  filename: string
  buffer: Buffer
}): Promise<PosUploadResult> {
  return (await uploadMultipart('/common/uploadFile', input.filename, input.buffer)) as PosUploadResult
}

/** 上传小程序素材图片到 /marketing/uploadImage，返回可公开访问的绝对地址 */
export async function posUploadImage(input: {
  filename: string
  buffer: Buffer
}): Promise<PosImageUploadResult> {
  const body = (await uploadMultipart(
    '/marketing/uploadImage',
    input.filename,
    input.buffer
  )) as { data: PosImageUploadResult }
  return body.data
}

/** 请求服务端导出接口（如 /order/exportOrderItemList），成功时返回文件二进制 */
export async function posExportFile(input: PosExportInput): Promise<Buffer> {
  if (!isEndpointAllowed('POST', input.path)) {
    throw new PosClientError('FORBIDDEN', `未授权的接口：POST ${input.path}`)
  }

  const session = await getSession()
  if (!session) {
    throw new PosClientError('UNAUTHENTICATED', '登录状态已失效，请重新登录')
  }

  const config = await getServerConfig()
  const url = `${config.baseUrl}${input.path}`

  try {
    let response = await send(url, 'POST', input.body, await getPosAccessToken(), EXPORT_TIMEOUT_MS)

    if (response.status === 401) {
      clearPosToken()
      response = await send(
        url,
        'POST',
        input.body,
        await getPosAccessToken(true),
        EXPORT_TIMEOUT_MS
      )
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).trim()
      throw new PosClientError(
        mapHttpStatus(response.status),
        detail || `服务端返回 ${response.status}`
      )
    }

    return Buffer.from(await response.arrayBuffer())
  } catch (error) {
    if (error instanceof PosClientError) throw error
    const networkError = toNetworkError(
      error,
      config.baseUrl,
      `导出超时（${config.baseUrl}），请缩小时间区间后重试`
    )
    if (networkError) throw networkError
    throw new PosClientError(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : '导出失败'
    )
  }
}
