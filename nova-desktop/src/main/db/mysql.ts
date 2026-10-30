/**
 * MySQL 只读连接池。
 * 所有 Agent 查询都从这里执行：SQL 先过 sql-guard，再以 10s 超时运行。
 */
import mysql, { type Pool } from 'mysql2/promise'
import { getAgentConfig } from '../agent/config'
import { assertReadOnlySql } from './sql-guard'

const QUERY_TIMEOUT_MS = 10_000

let pool: Pool | null = null

/** 懒加载连接池；配置缺失时由 getAgentConfig 抛出 AgentConfigError */
async function getPool(): Promise<Pool> {
  if (pool) return pool

  const config = await getAgentConfig()
  pool = mysql.createPool({
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    database: config.database.database,
    waitForConnections: true,
    connectionLimit: 4,
    maxIdle: 2,
    idleTimeout: 60_000,
    connectTimeout: 10_000,
    // 业务库以门店本地时间写入；统一按东八区解读，日期字段直接返回字符串避免时区偏移
    timezone: '+08:00',
    dateStrings: true
  })
  return pool
}

export type SqlRow = Record<string, unknown>

/** 执行一条只读查询；返回行数组（最多 200 行） */
export async function queryReadOnly(
  sql: string,
  params: readonly unknown[] = []
): Promise<SqlRow[]> {
  const safeSql = assertReadOnlySql(sql)
  const activePool = await getPool()
  const [rows] = await activePool.query(
    { sql: safeSql, timeout: QUERY_TIMEOUT_MS },
    params as unknown[]
  )
  if (!Array.isArray(rows)) return []
  return rows as SqlRow[]
}

/** 应用退出时释放连接池 */
export async function closeMysql(): Promise<void> {
  if (!pool) return
  const activePool = pool
  pool = null
  await activePool.end()
}
