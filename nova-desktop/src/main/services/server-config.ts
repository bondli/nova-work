/**
 * nova-desktop 的 POS 接入配置。
 * 唯一来源：~/.nova/api-config.json，桌面端专用，不再与 nova-pos-server 的 server-config.json 混用。
 * 桌面端只维护 POS 服务地址与内部令牌；监听端口、数据库、上传与日志目录属于服务端自身配置。
 * 内部令牌由主进程保管，不暴露给渲染层。
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

/** 桌面端自己的配置文件，与服务端的 server-config.json 完全分离 */
export const API_CONFIG_FILE = join(NOVA_HOME, 'api-config.json')

/** 旧版桌面端与服务端共用的文件，仅在 api-config.json 首次生成时迁移地址与令牌 */
const LEGACY_SHARED_CONFIG_FILE = join(NOVA_HOME, 'server-config.json')

export const serverConnectionInputSchema = z.object({
  baseUrl: z
    .string()
    .url('服务端地址必须是合法 URL')
    .transform((value) => value.replace(/\/+$/, ''))
})

/**
 * 登录页提交的连接信息。
 * 内部令牌仅跨机部署时需要：桌面端与服务端不共用配置文件时，两边令牌必须一致。
 */
export const serverLoginInputSchema = serverConnectionInputSchema.extend({
  internalToken: z.string().trim().min(1, '内部令牌不能为空').max(200).optional()
})

/** 文件结构只做宽松校验，未知字段原样保留 */
const storedConfigSchema = z
  .object({
    baseUrl: z.string().optional(),
    token: z.string().optional(),
    auth: z
      .object({
        internalToken: z.string().optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough()

type StoredConfig = z.infer<typeof storedConfigSchema>

const DEFAULT_BASE_URL = 'http://127.0.0.1:9577'

let cachedConnection: { baseUrl: string; token: string | null } | null = null

async function readStored(): Promise<StoredConfig> {
  const stored = await readJsonFile<unknown>(API_CONFIG_FILE)
  if (stored === null) return {}
  return storedConfigSchema.parse(stored)
}

/** 读取旧版共用配置，仅用于首次生成 api-config.json 时迁移地址与内部令牌 */
async function readLegacy(): Promise<StoredConfig> {
  try {
    const legacy = await readJsonFile<unknown>(LEGACY_SHARED_CONFIG_FILE)
    if (legacy === null) return {}
    return storedConfigSchema.parse(legacy)
  } catch {
    // 旧文件损坏时按全新配置处理，不阻断桌面端启动
    return {}
  }
}

/** 确保文件存在且内部令牌已生成；令牌只在主进程内使用 */
async function ensureConfigFile(): Promise<StoredConfig> {
  const stored = await readStored()

  if (Object.keys(stored).length === 0) {
    // 首次启动：沿用旧文件里的地址与令牌，避免与服务端令牌不一致导致换取 JWT 401
    const legacy = await readLegacy()
    const seeded = {
      baseUrl: legacy.baseUrl ?? DEFAULT_BASE_URL,
      auth: { internalToken: legacy.auth?.internalToken ?? legacy.token ?? randomUUID() }
    }
    await writeJsonFile(API_CONFIG_FILE, seeded)
    return storedConfigSchema.parse(seeded)
  }

  if (!stored.auth?.internalToken) {
    const next = { ...stored, auth: { ...stored.auth, internalToken: randomUUID() } }
    await writeJsonFile(API_CONFIG_FILE, next)
    return storedConfigSchema.parse(next)
  }

  return stored
}

function toView(stored: StoredConfig): ServerConfigView {
  return {
    baseUrl: (stored.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
    configPath: API_CONFIG_FILE
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
    baseUrl: (stored.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
    token: stored.auth?.internalToken ?? stored.token ?? null
  }
  return cachedConnection
}

/** 保存 POS 服务地址；服务端的监听地址由服务端自己的配置决定，桌面端不再回写 */
export async function saveServerConnection(input: ServerConnectionInput): Promise<void> {
  const stored = await readStored()

  const next: StoredConfig = {
    ...stored,
    baseUrl: input.baseUrl,
    auth: {
      ...stored.auth,
      // 内部令牌不经过界面编辑；缺失时补一个，已有则保留
      internalToken: stored.auth?.internalToken ?? stored.token ?? randomUUID()
    }
  }

  await writeJsonFile(API_CONFIG_FILE, next)
  resetServerConfigCache()
}

/** 保存内部令牌：跨机部署时需要与服务端 ~/.nova/server-config.json 中的值一致 */
export async function saveInternalToken(token: string): Promise<void> {
  const stored = await readStored()
  const next: StoredConfig = {
    ...stored,
    // 只覆盖令牌，baseUrl 等界面字段保持原值
    auth: { ...stored.auth, internalToken: token.trim() }
  }
  await writeJsonFile(API_CONFIG_FILE, next)
  resetServerConfigCache()
}

/** 供测试或设置变更后清空缓存 */
export function resetServerConfigCache(): void {
  cachedConnection = null
}
