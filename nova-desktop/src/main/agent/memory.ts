/**
 * 长期记忆。
 * 三层记忆：profile（静态画像）/ state（动态状态）/ preference（偏好规则），
 * 与同一 layer + category 的旧记录覆盖式更新。
 * 触发时机：每 3 轮对话自动抽取一次；模型可调用 memory_write 工具显式记住；
 * 组装 system prompt 时按层注入，供后续对话复用。
 */
import { randomUUID } from 'node:crypto'
import type { AgentMessage } from '@shared/types/analysis'
import { getAgentConfig } from './config'
import { models, resolveModel } from './provider'
import {
  agentQuery,
  agentQueryOne,
  agentRun,
  initAgentDb,
  persistDb
} from './db'

export type MemoryLayer = 'profile' | 'state' | 'preference'

export interface MemoryItem {
  id: string
  layer: MemoryLayer
  category: string
  content: string
  confidence: number
  sourceSession?: string
  createdAt: number
  updatedAt: number
}

const LAYERS: MemoryLayer[] = ['profile', 'state', 'preference']

/** 抽取出的记忆条目的最小置信度，低于该值不进入 prompt */
const MIN_CONFIDENCE = 0.6

/** 每多少次对话轮次触发一次自动抽取 */
const EXTRACT_EVERY_ROUNDS = 3

/** 会话轮次计数（进程内即可，重启后重新累积） */
const roundCounters = new Map<string, number>()

interface MemoryRow {
  id: string
  layer: string
  category: string
  content: string
  confidence: number
  source_session: string | null
  created_at: number
  updated_at: number
}

interface ExtractedMemory {
  layer: MemoryLayer
  category: string
  content: string
  confidence: number
}

interface ExtractionResult {
  shouldUpdate: boolean
  newMemories: ExtractedMemory[]
}

const EXTRACT_SYSTEM = `你是用户记忆提取助手。从对话中提取关于用户的稳定信息，存入三层记忆：
- profile: 用户的静态画像（职业、身份、长期关注方向、技能背景）
- state: 用户的动态状态（当前在做的项目、近期目标、正在处理的任务）
- preference: 用户的偏好规则（喜欢的输出格式、沟通风格、工具偏好、禁忌）

规则：
1. 只提取明确、稳定、有复用价值的信息，不要提取临时问答内容。
2. category 用简短中文名（如"职业"、"报表周期"、"输出风格"）。
3. confidence 取 0.0-1.0，信息越明确越高。
4. 同 category 的新内容会覆盖旧内容。
5. 没有值得记忆的信息时返回 shouldUpdate: false。

只输出 JSON: {"shouldUpdate": boolean, "newMemories": [{"layer": "profile|state|preference", "category": "分类名", "content": "具体内容", "confidence": 0.0-1.0}]}`

function rowToMemory(row: MemoryRow): MemoryItem {
  return {
    id: row.id,
    layer: (LAYERS.includes(row.layer as MemoryLayer) ? row.layer : 'profile') as MemoryLayer,
    category: row.category,
    content: row.content,
    confidence: row.confidence,
    sourceSession: row.source_session ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/** 列出记忆；可按层与最低置信度过滤 */
export async function listMemories(options?: {
  layer?: MemoryLayer
  minConfidence?: number
}): Promise<MemoryItem[]> {
  await initAgentDb()
  const conditions: string[] = []
  const params: unknown[] = []
  if (options?.layer) {
    conditions.push('layer = ?')
    params.push(options.layer)
  }
  if (options?.minConfidence !== undefined) {
    conditions.push('confidence >= ?')
    params.push(options.minConfidence)
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return agentQuery<MemoryRow>(
    `SELECT * FROM memories ${where} ORDER BY layer, updated_at DESC`,
    params
  ).map(rowToMemory)
}

/** 来源会话必须存在，否则外键会拒绝写入；记忆属于用户而非会话，来源缺失时置空 */
function validSourceSession(sessionId?: string): string | null {
  if (!sessionId) return null
  const exists = agentQueryOne<{ id: string }>(`SELECT id FROM sessions WHERE id = ?`, [sessionId])
  return exists ? sessionId : null
}

/** 写入一条记忆；同 layer + category 覆盖旧内容 */
export async function upsertMemory(input: {
  layer: MemoryLayer
  category: string
  content: string
  confidence?: number
  sourceSession?: string
}): Promise<MemoryItem> {
  await initAgentDb()
  const now = Date.now()
  const sourceSession = validSourceSession(input.sourceSession)
  const existing = agentQueryOne<MemoryRow>(
    `SELECT * FROM memories WHERE layer = ? AND category = ?`,
    [input.layer, input.category]
  )
  const next = {
    layer: input.layer,
    category: input.category.slice(0, 40),
    content: input.content.slice(0, 500),
    confidence: Math.min(1, Math.max(0, input.confidence ?? 0.8))
  }

  if (existing) {
    agentRun(
      `UPDATE memories SET category = ?, content = ?, confidence = ?, source_session = ?, updated_at = ? WHERE id = ?`,
      [next.category, next.content, next.confidence, sourceSession, now, existing.id]
    )
    persistDb()
    return rowToMemory({ ...existing, ...next, source_session: sourceSession, updated_at: now })
  }

  const id = randomUUID()
  agentRun(
    `INSERT INTO memories (id, layer, category, content, confidence, source_session, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, next.layer, next.category, next.content, next.confidence, sourceSession, now, now]
  )
  persistDb()
  return {
    id,
    ...next,
    sourceSession: sourceSession ?? undefined,
    createdAt: now,
    updatedAt: now
  }
}

/** 组装 system prompt 的记忆块；无记忆时返回空串 */
export async function buildMemoryBlock(): Promise<string> {
  let memories: MemoryItem[] = []
  try {
    memories = await listMemories({ minConfidence: MIN_CONFIDENCE })
  } catch {
    // 数据库未就绪或读取失败时不影响本轮对话
    return ''
  }
  if (memories.length === 0) return ''

  const profile = memories.filter((item) => item.layer === 'profile')
  const state = memories.filter((item) => item.layer === 'state')
  const preference = memories.filter((item) => item.layer === 'preference')

  const block = ['## 关于用户的长期记忆（仅供参考，不要主动提及来源）']
  if (profile.length > 0) {
    block.push('', '### 静态画像')
    for (const item of profile) block.push(`- ${item.category}：${item.content}`)
  }
  if (state.length > 0) {
    block.push('', '### 动态状态')
    for (const item of state) block.push(`- ${item.category}：${item.content}`)
  }
  if (preference.length > 0) {
    block.push('', '### 偏好规则')
    for (const item of preference) block.push(`- ${item.category}：${item.content}`)
  }
  return block.join('\n')
}

/** 每轮对话结束后调用；每 3 轮抽取一次，失败静默忽略 */
export async function maybeExtractMemories(
  sessionId: string,
  messages: AgentMessage[]
): Promise<void> {
  const count = (roundCounters.get(sessionId) ?? 0) + 1
  roundCounters.set(sessionId, count)
  if (count % EXTRACT_EVERY_ROUNDS !== 0) return

  const exchange = lastExchange(messages)
  if (!exchange.userText && !exchange.assistantText) return
  await extractAndUpsert(exchange.userText, exchange.assistantText, sessionId)
}

/** 明确由用户要求记住的内容，立即抽取（供工具或后续显式入口复用） */
export async function rememberExplicitly(text: string, sessionId?: string): Promise<number> {
  return extractAndUpsert(text, '', sessionId)
}

// ==========================================
// 内部：抽取与 LLM 调用
// ==========================================

/** 取最后一轮用户与助手文本 */
function lastExchange(messages: AgentMessage[]): { userText: string; assistantText: string } {
  let userText = ''
  let assistantText = ''
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!message) continue
    if (message.role === 'user' && !userText) {
      userText = message.content.trim()
      break
    }
    if (message.role === 'assistant' && !assistantText) {
      assistantText = message.content.trim()
    }
  }
  return { userText, assistantText }
}

/** 单次非流式 LLM 调用，返回解析后的 JSON；任何异常返回 null */
async function llmJson<T>(systemPrompt: string, userText: string): Promise<T | null> {
  try {
    const config = await getAgentConfig()
    const model = resolveModel(config.model.baseUrl, config.model.model)
    const message = await models.completeSimple(
      model,
      {
        systemPrompt,
        messages: [{ role: 'user' as const, content: userText, timestamp: Date.now() }]
      },
      { apiKey: config.model.apiKey, temperature: 0.2, maxTokens: 800 }
    )
    if (!message) return null
    if (message.stopReason === 'error' || message.stopReason === 'aborted') return null

    const text = message.content
      .filter((item) => item.type === 'text')
      .map((item) => (item.type === 'text' ? item.text : ''))
      .join('')
      .trim()
    if (!text) return null

    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    return JSON.parse(fenced?.[1] ?? text) as T
  } catch {
    return null
  }
}

/** 抽取并写入记忆，返回写入条数 */
async function extractAndUpsert(
  userText: string,
  assistantText: string,
  sessionId?: string
): Promise<number> {
  const result = await llmJson<ExtractionResult>(
    EXTRACT_SYSTEM,
    `用户：${userText}\n\n助手：${assistantText}`
  )
  if (!result?.shouldUpdate || !Array.isArray(result.newMemories)) return 0

  let count = 0
  for (const memory of result.newMemories) {
    if (!memory?.content?.trim() || !memory.category?.trim()) continue
    if (!LAYERS.includes(memory.layer)) continue
    await upsertMemory({
      layer: memory.layer,
      category: memory.category,
      content: memory.content,
      confidence: typeof memory.confidence === 'number' ? memory.confidence : 0.7,
      sourceSession: sessionId
    })
    count += 1
  }
  return count
}
