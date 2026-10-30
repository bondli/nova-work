/**
 * Agent 运行配置。
 * `~/.nova/agent-config.json` 保存模型与 MySQL 只读连接；
 * 模型设置页只读写 model 段，数据设置页只读写 database 段。
 */
import { join } from 'node:path'
import { z } from 'zod'
import type {
  ModelConfigInput,
  ModelConfigView,
  ModelTestResult
} from '@shared/types/model-config'
import type { AgentDatabaseConfig } from '@shared/types/data-config'
import { readJsonFile, writeJsonFile } from '../services/json-file'
import { NOVA_HOME } from '../services/settings'

/** 当前支持的模型；界面与保存校验都以此为准 */
export const MODEL_IDS = ['deepseek-flash', 'deepseek-v4-pro'] as const
export const DEFAULT_MODEL = 'deepseek-flash'

const modelSchema = z.object({
  enabled: z.boolean().default(true),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  model: z.string().min(1)
})

export const databaseSchema = z.object({
  host: z.string().min(1, '请填写数据库地址'),
  port: z.coerce.number().int().min(1).max(65535),
  user: z.string().min(1, '请填写只读账号'),
  password: z.string(),
  database: z.string().min(1, '请填写数据库名')
})

const configSchema = z.object({
  model: modelSchema,
  database: databaseSchema
})

export type AgentConfig = z.infer<typeof configSchema>

const CONFIG_FILE = join(NOVA_HOME, 'agent-config.json')

const DEFAULT_DATABASE: AgentDatabaseConfig = {
  host: '127.0.0.1',
  port: 3306,
  user: 'readonly',
  password: '',
  database: 'store_pos'
}

/** 模型设置页提交的校验规则 */
export const modelConfigInputSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().url('模型地址必须是合法 URL'),
  apiKey: z.string().min(1, '请填写 API Key'),
  model: z.enum(MODEL_IDS, { message: '请选择受支持的模型' })
})

/** 数据设置页提交的数据库校验规则 */
export const agentDatabaseInputSchema = databaseSchema

/** 配置缺失时抛出，IPC 层转换为 NOT_CONFIGURED */
export class AgentConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgentConfigError'
  }
}

/** 读取配置；只认 ~/.nova/agent-config.json，不再读取环境变量 */
export async function getAgentConfig(): Promise<AgentConfig> {
  const stored = await readJsonFile<unknown>(CONFIG_FILE)
  const parsed = configSchema.safeParse(stored)

  if (parsed.success) {
    if (!parsed.data.model.enabled) {
      throw new AgentConfigError('模型已停用，请在「设置 → 模型设置」中启用后再试')
    }
    return parsed.data
  }

  throw new AgentConfigError(
    `未配置模型与数据库连接，请创建 ${CONFIG_FILE}（包含 model 与 database 两段配置）`
  )
}

/** 模型设置视图：不暴露数据库配置；历史模型名不在支持列表时回退默认值 */
export async function getModelConfigView(): Promise<ModelConfigView> {
  const stored = await readJsonFile<{ model?: unknown }>(CONFIG_FILE)
  const parsed = modelSchema.partial().safeParse(
    stored?.model && typeof stored.model === 'object' ? stored.model : undefined
  )

  const storedModel = parsed.success ? parsed.data.model : undefined
  const model = MODEL_IDS.includes(storedModel as (typeof MODEL_IDS)[number])
    ? (storedModel as string)
    : DEFAULT_MODEL

  return {
    enabled: parsed.success ? parsed.data.enabled !== false : true,
    baseUrl: parsed.success ? (parsed.data.baseUrl ?? '') : '',
    apiKey: parsed.success ? (parsed.data.apiKey ?? '') : '',
    model,
    configPath: CONFIG_FILE
  }
}

/** 保存模型设置：只覆盖 model 段，保留 database 等其它字段 */
export async function saveModelConfig(input: ModelConfigInput): Promise<void> {
  const parsed = modelConfigInputSchema.parse(input)
  const stored = (await readJsonFile<Record<string, unknown>>(CONFIG_FILE)) ?? {}

  await writeJsonFile(CONFIG_FILE, {
    ...stored,
    model: {
      enabled: parsed.enabled,
      baseUrl: parsed.baseUrl.replace(/\/+$/, ''),
      apiKey: parsed.apiKey,
      model: parsed.model
    }
  })
}

/** 数据设置视图：Agent 只读数据库，缺失字段回退默认值 */
export async function getAgentDatabaseView(): Promise<{
  database: AgentDatabaseConfig
  configPath: string
}> {
  const stored = await readJsonFile<{ database?: unknown }>(CONFIG_FILE)
  const parsed = databaseSchema
    .partial()
    .safeParse(
      stored?.database && typeof stored.database === 'object' ? stored.database : undefined
    )

  return {
    database: {
      host: parsed.success ? (parsed.data.host ?? DEFAULT_DATABASE.host) : DEFAULT_DATABASE.host,
      port: parsed.success ? (parsed.data.port ?? DEFAULT_DATABASE.port) : DEFAULT_DATABASE.port,
      user: parsed.success ? (parsed.data.user ?? DEFAULT_DATABASE.user) : DEFAULT_DATABASE.user,
      password: parsed.success
        ? (parsed.data.password ?? DEFAULT_DATABASE.password)
        : DEFAULT_DATABASE.password,
      database: parsed.success
        ? (parsed.data.database ?? DEFAULT_DATABASE.database)
        : DEFAULT_DATABASE.database
    },
    configPath: CONFIG_FILE
  }
}

/** 保存 Agent 只读数据库：只覆盖 database 段，保留 model 等其它字段 */
export async function saveAgentDatabase(input: AgentDatabaseConfig): Promise<void> {
  const parsed = agentDatabaseInputSchema.parse(input)
  const stored = (await readJsonFile<Record<string, unknown>>(CONFIG_FILE)) ?? {}

  await writeJsonFile(CONFIG_FILE, {
    ...stored,
    database: parsed
  })
}

/**
 * 检测模型连通性：请求 OpenAI 兼容的 /models 列表。
 * 只校验凭据与地址是否可用，不发起真实推理，避免产生费用。
 */
export async function testModelConnection(): Promise<ModelTestResult> {
  const view = await getModelConfigView()
  const checkedAt = new Date().toISOString()

  if (!view.baseUrl || !view.apiKey) {
    return { ok: false, latencyMs: 0, message: '请先填写接口地址与 API Key', checkedAt }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  const startedAt = Date.now()

  try {
    const response = await fetch(`${view.baseUrl.replace(/\/+$/, '')}/models`, {
      headers: { Authorization: `Bearer ${view.apiKey}` },
      signal: controller.signal
    })
    const latencyMs = Date.now() - startedAt

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      const message =
        response.status === 401 || response.status === 403
          ? 'API Key 无效或已过期'
          : `模型服务返回 HTTP ${response.status}${detail ? `：${detail.slice(0, 120)}` : ''}`
      return { ok: false, latencyMs, message, checkedAt }
    }

    const body = (await response.json().catch(() => null)) as
      | { data?: Array<{ id?: string }> }
      | null
    const models = body?.data?.map((item) => item.id).filter(Boolean) ?? []
    const hasModel = models.length === 0 || models.includes(view.model)

    return {
      ok: hasModel,
      latencyMs,
      message: hasModel
        ? `连接正常${models.length ? ` · ${models.length} 个模型可用` : ''}`
        : `连接正常，但未找到模型 ${view.model}`,
      checkedAt
    }
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : '无法连接模型服务',
      checkedAt
    }
  } finally {
    clearTimeout(timer)
  }
}
