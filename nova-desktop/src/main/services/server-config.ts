/**
 * nova-pos-server 共享配置。
 * 唯一来源：~/.nova/server-config.json（与 nova-pos-server 共用）。
 * 连接地址、数据库、上传与日志目录都从这里读取，不再依赖环境变量；
 * 内部令牌由主进程自动生成并保管，不暴露给渲染层；
 * 保存时只覆盖界面字段，jwtSecret / uploadToken / internalToken 等密钥原样保留。
 */
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { z } from 'zod'
import type {
  ServerConfigView,
  ServerConnectionInput
} from '@shared/types/server-config'
import { NOVA_HOME } from './settings'
import { readJsonFile, writeJsonFile } from './json-file'

const databaseSchema = z.object({
  host: z.string().min(1, '请填写数据库地址'),
  port: z.coerce.number().int().min(1).max(65535),
  user: z.string().min(1, '请填写数据库用户名'),
  password: z.string(),
  database: z.string().min(1, '请填写数据库名')
})

const storageSchema = z.object({
  uploadDir: z.string().min(1, '请填写上传目录'),
  logDir: z.string().min(1, '请填写日志目录')
})

export const serverConnectionInputSchema = z.object({
  baseUrl: z
    .string()
    .url('服务端地址必须是合法 URL')
    .transform((value) => value.replace(/\/+$/, ''))
})

/** 文件结构只做宽松校验，未知字段（jwtSecret、uploadToken、internalToken）原样保留 */
const storedConfigSchema = z
  .object({
    baseUrl: z.string().optional(),
    token: z.string().optional(),
    auth: z
      .object({
        internalToken: z.string().optional(),
        jwtSecret: z.string().optional()
      })
      .passthrough()
      .optional(),
    database: databaseSchema.partial().passthrough().optional(),
    storage: storageSchema.partial().passthrough().optional()
  })
  .passthrough()

type StoredConfig = z.infer<typeof storedConfigSchema>

export const SERVER_CONFIG_FILE = join(NOVA_HOME, 'server-config.json')

const DEFAULT_CONFIG = {
  baseUrl: 'http://127.0.0.1:9577',
  database: {
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
    database: 'store_pos'
  },
  storage: {
    uploadDir: '~/.nova/storage/inventory-image',
    logDir: '~/.nova/logs'
  }
}

let cachedConnection: { baseUrl: string; token: string | null } | null = null

async function readStored(): Promise<StoredConfig> {
  const stored = await readJsonFile<unknown>(SERVER_CONFIG_FILE)
  if (stored === null) return {}
  return storedConfigSchema.parse(stored)
}

/** 确保文件存在且内部令牌已生成；令牌只在主进程内使用 */
async function ensureConfigFile(): Promise<StoredConfig> {
  const stored = await readStored()

  if (Object.keys(stored).length === 0) {
    const seeded = {
      ...DEFAULT_CONFIG,
      auth: { internalToken: randomUUID() }
    }
    await writeJsonFile(SERVER_CONFIG_FILE, seeded)
    return storedConfigSchema.parse(seeded)
  }

  if (!stored.auth?.internalToken) {
    const next = { ...stored, auth: { ...stored.auth, internalToken: randomUUID() } }
    await writeJsonFile(SERVER_CONFIG_FILE, next)
    return storedConfigSchema.parse(next)
  }

  return stored
}

function toView(stored: StoredConfig): ServerConfigView {
  return {
    baseUrl: (stored.baseUrl ?? DEFAULT_CONFIG.baseUrl).replace(/\/+$/, ''),
    configPath: SERVER_CONFIG_FILE,
    jwtConfigured: Boolean(stored.auth?.jwtSecret)
  }
}

/** 读取完整配置视图；文件不存在时写入默认配置，方便首次启动即可见 */
export async function getServerConfigView(): Promise<ServerConfigView> {
  return toView(await ensureConfigFile())
}

/** 业务请求使用的连接信息，每次请求前读取缓存（保存配置时清空） */
export async function getServerConfig(): Promise<{ baseUrl: string; token: string | null }> {
  if (cachedConnection) return cachedConnection

  const stored = await ensureConfigFile()
  cachedConnection = {
    baseUrl: (stored.baseUrl ?? DEFAULT_CONFIG.baseUrl).replace(/\/+$/, ''),
    token: stored.auth?.internalToken ?? stored.token ?? null
  }
  return cachedConnection
}

/** 保存 POS 服务地址：数据库、文件目录属于服务端自身配置，桌面端不再维护 */
export async function saveServerConnection(input: ServerConnectionInput): Promise<void> {
  const stored = await readStored()
  // 监听地址由服务地址反推，避免改了 baseUrl 而 server.host/port 仍是旧值
  const url = new URL(input.baseUrl)
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80))

  const next: StoredConfig = {
    ...stored,
    baseUrl: input.baseUrl,
    server: {
      ...(stored as { server?: Record<string, unknown> }).server,
      host: url.hostname,
      port
    },
    auth: {
      ...stored.auth,
      // 内部令牌不经过界面编辑；缺失时补一个，已有则保留
      internalToken: stored.auth?.internalToken ?? stored.token ?? randomUUID()
    }
  }

  await writeJsonFile(SERVER_CONFIG_FILE, next)
  resetServerConfigCache()
}

/** 供测试或设置变更后清空缓存 */
export function resetServerConfigCache(): void {
  cachedConnection = null
}
