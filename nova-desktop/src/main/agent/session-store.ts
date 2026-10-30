/**
 * 分析与会话的本地存储。
 * 数据统一落在 SQLite（`~/.nova/analysis/agent.db`），表结构见 db.ts；
 * 首次启动会把旧版 JSON 会话迁移进库，旧文件保留不删。
 * 三个固定任务（日报/周报/月报）首次启动自动补齐。
 */
import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { addDays, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns'
import type {
  AgentMessage,
  AgentSession,
  AgentSessionDetail,
  AgentSessionStatus,
  AgentSessionType,
  ArtifactMeta,
  ChatAttachment,
  CreateSessionInput
} from '@shared/types/analysis'
import { GROUP_ORDER } from '@shared/types/analysis'
import { NOVA_HOME, getSettings } from '../services/settings'
import { formatScheduleLabel } from '../services/task-schedule'
import { ensureWorkspace, getWorkspaceDir } from './workspace'
import {
  agentQuery,
  agentQueryOne,
  agentRun,
  initAgentDb,
  persistDb,
  writeSessionRecord
} from './db'

type SessionRecord = AgentSessionDetail

/** 旧版 JSON 会话目录；迁移完成后仅用于诊断 */
const SESSIONS_DIR = join(NOVA_HOME, 'analysis', 'sessions')

/** 会话不存在 */
export class SessionNotFoundError extends Error {
  constructor(message = '会话不存在') {
    super(message)
    this.name = 'SessionNotFoundError'
  }
}

/** 当前状态不允许该操作（内置任务、运行中等） */
export class SessionOperationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SessionOperationError'
  }
}

interface SessionRow {
  id: string
  title: string
  session_group: string
  type: string
  status: string
  range_label: string
  schedule: string | null
  model: string | null
  last_run_at: string | null
  error: string | null
  created_at: string
  updated_at: string
}

interface MessageRow {
  id: string
  session_id: string
  seq: number
  role: string
  content: string
  created_at: string
  status: string
  tool_calls: string | null
  artifact_ids: string | null
  attachments: string | null
  skill_id: string | null
  scheduled: number | null
}

interface ArtifactRow {
  id: string
  session_id: string
  title: string
  path: string
  kind: string
  size: number
  created_at: string
  message_id: string | null
}

function nowIso(): string {
  return new Date().toISOString()
}

/** TEXT 列 JSON 解析；损坏数据回退到空值，不影响会话打开 */
function parseJson<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function rowToSession(row: SessionRow): AgentSession {
  return {
    id: row.id,
    title: row.title,
    group: row.session_group as AgentSession['group'],
    type: row.type as AgentSessionType,
    status: row.status as AgentSessionStatus,
    rangeLabel: row.range_label,
    schedule: row.schedule ?? undefined,
    model: row.model ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastRunAt: row.last_run_at ?? undefined,
    error: row.error ?? undefined
  }
}

function rowToMessage(row: MessageRow): AgentMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as AgentMessage['role'],
    content: row.content,
    createdAt: row.created_at,
    status: row.status as AgentMessage['status'],
    toolCalls: parseJson<AgentMessage['toolCalls']>(row.tool_calls) ?? [],
    artifactIds: parseJson<string[]>(row.artifact_ids) ?? [],
    attachments: parseJson<ChatAttachment[]>(row.attachments) ?? undefined,
    skillId: row.skill_id ?? undefined,
    scheduled: row.scheduled === 1 ? true : undefined
  }
}

function rowToArtifact(row: ArtifactRow): ArtifactMeta {
  return {
    id: row.id,
    sessionId: row.session_id,
    title: row.title,
    path: row.path,
    kind: row.kind as ArtifactMeta['kind'],
    size: row.size,
    createdAt: row.created_at,
    messageId: row.message_id ?? undefined
  }
}

/** 三个固定任务的标题、周期与默认数据范围 */
function buildFixedSessions(now: Date): SessionRecord[] {
  const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 })
  const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 })
  const lastMonthStart = startOfMonth(subMonths(now, 1))
  const lastMonthEnd = endOfMonth(subMonths(now, 1))

  const fixed: Array<{
    id: string
    title: string
    type: AgentSessionType
    rangeLabel: string
    schedule: string
  }> = [
    {
      id: 'task-daily',
      title: '店铺经营日报',
      type: 'daily',
      rangeLabel: format(now, 'MM/dd'),
      schedule: '每晚 21:20'
    },
    {
      id: 'task-weekly',
      title: '店铺经营周报',
      type: 'weekly',
      rangeLabel: `${format(lastWeekStart, 'MM/dd')} - ${format(lastWeekEnd, 'MM/dd')}`,
      schedule: '每周一 10:10'
    },
    {
      id: 'task-monthly',
      title: '店铺经营月报',
      type: 'monthly',
      rangeLabel: `${format(lastMonthStart, 'MM/dd')} - ${format(lastMonthEnd, 'MM/dd')}`,
      schedule: '每月 1 日 10:20'
    }
  ]

  return fixed.map((item, index) => {
    const createdAt = new Date(now.getTime() - index * 60_000).toISOString()
    return {
      session: {
        id: item.id,
        title: item.title,
        group: 'analysis',
        type: item.type,
        status: 'idle',
        rangeLabel: item.rangeLabel,
        schedule: item.schedule,
        createdAt,
        updatedAt: createdAt
      },
      messages: [],
      artifacts: []
    }
  })
}

/** 保证三个固定任务存在：缺失的补齐，已有记录不覆盖 */
async function ensureSeeded(): Promise<void> {
  await initAgentDb()
  const existing = new Set(
    agentQuery<{ id: string }>(`SELECT id FROM sessions`).map((row) => row.id)
  )
  const missing = buildFixedSessions(new Date()).filter(
    (record) => !existing.has(record.session.id)
  )
  if (missing.length === 0) return

  for (const record of missing) {
    await ensureWorkspace(record.session.id)
    writeSessionRecord(record)
  }
  persistDb()
}

async function readRecord(id: string): Promise<SessionRecord> {
  await initAgentDb()
  const row = agentQueryOne<SessionRow>(`SELECT * FROM sessions WHERE id = ?`, [id])
  if (!row) throw new SessionNotFoundError()

  const messages = agentQuery<MessageRow>(
    `SELECT * FROM messages WHERE session_id = ? ORDER BY seq`,
    [id]
  ).map(rowToMessage)
  const artifacts = agentQuery<ArtifactRow>(
    `SELECT * FROM artifacts WHERE session_id = ? ORDER BY created_at, rowid`,
    [id]
  ).map(rowToArtifact)

  return { session: rowToSession(row), messages, artifacts }
}

async function saveRecord(record: SessionRecord): Promise<void> {
  await initAgentDb()
  record.session.updatedAt = nowIso()
  writeSessionRecord(record)
  persistDb()
}

/** 会话列表：按固定分组顺序排列，组内更新时间倒序；固定任务的时间文案跟随设置 */
export async function listSessions(): Promise<AgentSession[]> {
  await ensureSeeded()
  const rows = agentQuery<SessionRow>(`SELECT * FROM sessions`)
  const settings = await getSettings()

  return rows
    .map((row) => {
      const session = rowToSession(row)
      if (session.type === 'free') return session
      return { ...session, schedule: formatScheduleLabel(session.type, settings.task) }
    })
    .sort((a, b) => {
      const groupDelta = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)
      if (groupDelta !== 0) return groupDelta
      return b.updatedAt.localeCompare(a.updatedAt)
    })
}

/** 读取会话详情（深拷贝，避免调用方修改内部数据） */
export async function getSessionDetail(id: string): Promise<AgentSessionDetail> {
  return structuredClone(await readRecord(id))
}

/** 新建自由对话；经营分析三个任务固定存在，不允许新增 */
export async function createSession(input: CreateSessionInput): Promise<AgentSession> {
  if (input.group !== 'free') throw new Error('经营分析任务固定存在，仅自由对话可新建')

  await initAgentDb()
  const id = randomUUID()
  const timestamp = nowIso()
  const record: SessionRecord = {
    session: {
      id,
      title: input.title?.trim() || '新对话',
      group: 'free',
      type: 'free',
      status: 'idle',
      rangeLabel: input.rangeLabel?.trim() || '待确认',
      createdAt: timestamp,
      updatedAt: timestamp
    },
    messages: [],
    artifacts: []
  }

  await ensureWorkspace(id)
  await saveRecord(record)
  return structuredClone(record.session)
}

/** 只有自由对话允许重命名、归档与删除 */
async function assertFreeSession(sessionId: string): Promise<SessionRecord> {
  const record = await readRecord(sessionId)
  if (record.session.type !== 'free') {
    throw new SessionOperationError('内置分析任务不支持该操作')
  }
  return record
}

/** 重命名自由对话 */
export async function renameSession(sessionId: string, title: string): Promise<AgentSession> {
  const record = await assertFreeSession(sessionId)
  const next = title.trim()
  if (!next) throw new SessionOperationError('标题不能为空')
  record.session.title = next.slice(0, 60)
  await saveRecord(record)
  return structuredClone(record.session)
}

/** 设置会话级模型；下轮对话生效 */
export async function setSessionModel(sessionId: string, model: string): Promise<AgentSession> {
  const record = await readRecord(sessionId)
  record.session.model = model.slice(0, 80)
  await saveRecord(record)
  return structuredClone(record.session)
}

/** 归档 / 取消归档自由对话 */
export async function setSessionArchived(
  sessionId: string,
  archived: boolean
): Promise<AgentSession> {
  const record = await assertFreeSession(sessionId)
  if (archived && record.session.status === 'running') {
    throw new SessionOperationError('任务正在运行，请先暂停后再归档')
  }
  record.session.group = archived ? 'archive' : 'free'
  await saveRecord(record)
  return structuredClone(record.session)
}

/** 删除自由对话：会话记录（消息与产物索引级联删除）与工作区文件一并清理 */
export async function deleteSession(sessionId: string): Promise<void> {
  const record = await assertFreeSession(sessionId)
  if (record.session.status === 'running') {
    throw new SessionOperationError('任务正在运行，请先暂停后再删除')
  }
  await initAgentDb()
  agentRun(`DELETE FROM sessions WHERE id = ?`, [sessionId])
  persistDb()
  await rm(getWorkspaceDir(sessionId), { recursive: true, force: true })
}

/** 打开会话工作区目录（供「打开文件夹」菜单使用） */
export async function ensureSessionWorkspace(sessionId: string): Promise<string> {
  await assertSessionExists(sessionId)
  await ensureWorkspace(sessionId)
  return getWorkspaceDir(sessionId)
}

/** 追加一条消息并落盘 */
export async function appendMessage(sessionId: string, message: AgentMessage): Promise<void> {
  const record = await readRecord(sessionId)
  record.messages.push(message)
  await saveRecord(record)
}

/** 更新会话可变字段 */
export async function updateSession(
  sessionId: string,
  patch: Partial<Pick<AgentSession, 'title' | 'status' | 'rangeLabel' | 'lastRunAt' | 'error'>>
): Promise<AgentSession> {
  const record = await readRecord(sessionId)
  record.session = { ...record.session, ...patch }
  await saveRecord(record)
  return structuredClone(record.session)
}

/** 记录一次运行结束后的状态与时间 */
export async function markRunFinished(
  sessionId: string,
  status: AgentSessionStatus,
  error?: string
): Promise<void> {
  const record = await readRecord(sessionId)
  record.session = {
    ...record.session,
    status,
    error,
    lastRunAt: nowIso()
  }
  await saveRecord(record)
}

/** 写入或替换产物索引 */
export async function upsertArtifact(sessionId: string, artifact: ArtifactMeta): Promise<void> {
  const record = await readRecord(sessionId)
  const index = record.artifacts.findIndex((item) => item.id === artifact.id)
  if (index >= 0) record.artifacts[index] = artifact
  else record.artifacts.push(artifact)
  await saveRecord(record)
}

/** 读取会话内消息，供 runtime 重建上下文 */
export async function getMessages(sessionId: string): Promise<AgentMessage[]> {
  return (await readRecord(sessionId)).messages
}

/** 供 runtime 校验会话是否存在 */
export async function assertSessionExists(sessionId: string): Promise<AgentSession> {
  return (await readRecord(sessionId)).session
}

/** 补跑/定时任务可直接读取固定任务记录 */
export async function getSession(id: string): Promise<AgentSession> {
  return (await readRecord(id)).session
}

/** 诊断用：旧版 JSON 数据目录（迁移后不再写入） */
export function resolveSessionsDir(): string {
  return SESSIONS_DIR
}

export const FIXED_TASK_IDS = ['task-daily', 'task-weekly', 'task-monthly'] as const

/** 计算「昨天」范围，供日报对比使用 */
export function yesterdayRange(now = new Date()): { start: string; end: string } {
  const yesterday = addDays(now, -1)
  const value = format(yesterday, 'yyyy-MM-dd')
  return { start: value, end: value }
}
