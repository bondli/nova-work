/**
 * Agent 本地数据库（SQLite / sql.js）。
 * 数据文件 `~/.nova/analysis/agent.db`，保存会话、消息、产物与长期记忆。
 * sql.js 是纯内存库，写操作后统一导出二进制落盘；
 * 首次启动把旧版 JSON 会话（analysis/sessions/*.json）迁移进库，旧文件保留不删。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import type { AgentMessage, AgentSessionDetail, ArtifactMeta } from '@shared/types/analysis'
import { NOVA_HOME } from '../services/settings'

/** 数据库文件路径 */
export const AGENT_DB_PATH = join(NOVA_HOME, 'analysis', 'agent.db')

/** 旧版 JSON 会话目录，仅用于一次性迁移 */
const LEGACY_SESSIONS_DIR = join(NOVA_HOME, 'analysis', 'sessions')

/** sql.js 没有 WAL，用 DELETE 日志模式；外键用于删除会话时级联清理 */
const PRAGMA_SETUP = `PRAGMA journal_mode = DELETE; PRAGMA foreign_keys = ON;`

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  session_group TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  range_label TEXT NOT NULL,
  schedule TEXT,
  model TEXT,
  last_run_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL,
  tool_calls TEXT,
  artifact_ids TEXT,
  attachments TEXT,
  skill_id TEXT,
  scheduled INTEGER,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  title TEXT NOT NULL,
  path TEXT NOT NULL,
  kind TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  message_id TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  layer TEXT NOT NULL,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  confidence REAL NOT NULL,
  source_session TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (source_session) REFERENCES sessions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, seq);
CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_memories_layer ON memories(layer);
`

let database: SqlJsDatabase | null = null
let initPromise: Promise<void> | null = null

function failUninitialized(): never {
  throw new Error('Agent 数据库尚未初始化')
}

/**
 * 初始化数据库（懒加载单例）：加载 wasm → 读文件 → 建表 → 迁移旧 JSON → 落盘。
 * 重复调用共享同一个 Promise，失败后再次调用会重新尝试。
 */
export function initAgentDb(): Promise<void> {
  if (database) return Promise.resolve()
  if (initPromise) return initPromise

  initPromise = (async () => {
    const SQL = await initSqlJs()
    mkdirSync(dirname(AGENT_DB_PATH), { recursive: true })

    const handle = existsSync(AGENT_DB_PATH)
      ? new SQL.Database(readFileSync(AGENT_DB_PATH))
      : new SQL.Database()
    handle.exec(PRAGMA_SETUP)
    handle.exec(SCHEMA_SQL)

    database = handle

    migrateLegacySessions()
    persistDb()
  })()

  return initPromise.catch((error) => {
    initPromise = null
    try {
      database?.close()
    } catch {
      // 关闭失败不影响重试
    }
    database = null
    throw error
  })
}

/** 关闭数据库并落盘；仅在应用退出时调用 */
export function closeAgentDb(): void {
  if (!database) return
  persistDb()
  database.close()
  database = null
  initPromise = null
}

/** 导出二进制写回磁盘；每次写操作后调用，进程异常退出最多丢最后一次写入 */
export function persistDb(): void {
  if (!database) return
  writeFileSync(AGENT_DB_PATH, Buffer.from(database.export()))
}

/** 执行一条写 SQL（不自动落盘，批量写完后调用 persistDb） */
export function agentRun(sql: string, params: unknown[] = []): void {
  if (!database) failUninitialized()
  database.run(sql, params as never)
}

/** 查询多行 */
export function agentQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): T[] {
  if (!database) failUninitialized()
  const stmt = database.prepare(sql)
  stmt.bind(params as never)
  const rows: T[] = []
  while (stmt.step()) rows.push(stmt.getAsObject() as T)
  stmt.free()
  return rows
}

/** 查询单行 */
export function agentQueryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): T | undefined {
  return agentQuery<T>(sql, params)[0]
}

/** 数据库是否已就绪 */
export function isAgentDbReady(): boolean {
  return database !== null
}

// ==========================================
// 旧 JSON 会话迁移
// ==========================================

/** 从旧版 JSON 会话迁移一次；用 meta 表打标记，避免删除的会话被旧文件反复复活 */
function migrateLegacySessions(): void {
  const marker = agentQueryOne<{ value: string }>(
    `SELECT value FROM meta WHERE key = 'migrated_from_json'`
  )
  if (marker?.value === '1') return

  let names: string[] = []
  try {
    names = readdirSync(LEGACY_SESSIONS_DIR).filter((name) => name.endsWith('.json'))
  } catch {
    // 没有旧目录视为已迁移完成
    names = []
  }

  for (const name of names) {
    try {
      const record = JSON.parse(
        readFileSync(join(LEGACY_SESSIONS_DIR, name), 'utf8')
      ) as AgentSessionDetail
      if (!record?.session?.id) continue
      writeSessionRecord(record)
    } catch (error) {
      // 单个损坏文件跳过，不阻塞启动
      console.error('[agent] 迁移会话失败', name, error)
    }
  }

  agentRun(
    `INSERT OR REPLACE INTO meta (key, value) VALUES ('migrated_from_json', '1')`
  )
}

/** 会话记录写入：整条替换（会话行 + 消息 + 产物），供迁移与存储层复用 */
export function writeSessionRecord(record: AgentSessionDetail): void {
  const session = record.session
  agentRun(
    `INSERT OR REPLACE INTO sessions
       (id, title, session_group, type, status, range_label, schedule, model, last_run_at, error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      session.id,
      session.title,
      session.group,
      session.type,
      session.status,
      session.rangeLabel,
      session.schedule ?? null,
      session.model ?? null,
      session.lastRunAt ?? null,
      session.error ?? null,
      session.createdAt,
      session.updatedAt
    ]
  )

  replaceMessages(session.id, record.messages)
  replaceArtifacts(session.id, record.artifacts)
}

/** 覆盖会话的全部消息（会话消息量很小，整段重写比增量更简单可靠） */
export function replaceMessages(sessionId: string, messages: AgentMessage[]): void {
  agentRun(`DELETE FROM messages WHERE session_id = ?`, [sessionId])
  messages.forEach((message, index) => {
    agentRun(
      `INSERT INTO messages
         (id, session_id, seq, role, content, created_at, status, tool_calls, artifact_ids, attachments, skill_id, scheduled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        message.id,
        sessionId,
        index,
        message.role,
        message.content,
        message.createdAt,
        message.status,
        JSON.stringify(message.toolCalls ?? []),
        JSON.stringify(message.artifactIds ?? []),
        message.attachments ? JSON.stringify(message.attachments) : null,
        message.skillId ?? null,
        message.scheduled ? 1 : 0
      ]
    )
  })
}

/** 覆盖会话的全部产物索引 */
export function replaceArtifacts(sessionId: string, artifacts: ArtifactMeta[]): void {
  agentRun(`DELETE FROM artifacts WHERE session_id = ?`, [sessionId])
  artifacts.forEach((artifact) => {
    agentRun(
      `INSERT INTO artifacts (id, session_id, title, path, kind, size, created_at, message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        artifact.id,
        sessionId,
        artifact.title,
        artifact.path,
        artifact.kind,
        artifact.size,
        artifact.createdAt,
        artifact.messageId ?? null
      ]
    )
  })
}
