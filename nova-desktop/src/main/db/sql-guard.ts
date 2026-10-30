/**
 * 只读 SQL 守卫。
 * 四层防护中的第一层：任何进入 MySQL 的 SQL 都必须先通过这里。
 * - 仅允许单条 SELECT
 * - 禁止注释、分号、写操作、锁与文件/网络函数
 * - 自动追加或收缩 LIMIT 到 200 行以内
 */

const MAX_SQL_LENGTH = 5000
const MAX_ROWS = 200

/** 禁止出现的写操作与危险函数，使用单词边界避免误伤普通字段名 */
const FORBIDDEN_PATTERN =
  /\b(?:insert|update|delete|drop|alter|truncate|create|replace|rename|grant|revoke|call|execute|handler|prepare|lock|unlock|outfile|dumpfile|load_file|sleep|benchmark)\b/i

/** SQL 守卫错误：IPC 层会把它翻译成工具错误返回给模型 */
export class SqlGuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SqlGuardError'
  }
}

/** 校验并返回可执行 SQL；非法时抛出 SqlGuardError */
export function assertReadOnlySql(rawSql: string): string {
  const sql = rawSql.trim()

  if (!sql) throw new SqlGuardError('SQL 不能为空')
  if (sql.length > MAX_SQL_LENGTH) throw new SqlGuardError('SQL 过长，请缩小查询范围')
  if (sql.includes(';')) throw new SqlGuardError('只允许单条 SQL，禁止分号与多语句')
  if (sql.includes('--') || sql.includes('#') || sql.includes('/*')) {
    throw new SqlGuardError('SQL 中不允许出现注释')
  }
  if (!/^select\b/i.test(sql)) throw new SqlGuardError('只允许执行 SELECT 查询')
  if (FORBIDDEN_PATTERN.test(sql)) throw new SqlGuardError('SQL 包含非只读关键字或危险函数')
  if (/\bfor\s+update\b/i.test(sql) || /\block\s+in\s+share\s+mode\b/i.test(sql)) {
    throw new SqlGuardError('只读查询不允许加锁')
  }

  return clampLimit(sql)
}

/**
 * 没有 LIMIT 时追加 LIMIT 200；已有 LIMIT 时把行数收缩到 200 以内。
 * 支持 `LIMIT n`、`LIMIT offset, n` 与 `LIMIT n OFFSET offset`。
 */
function clampLimit(sql: string): string {
  const limitMatch = /\blimit\s+(\d+)(?:\s*,\s*(\d+))?\s*(offset\s+\d+)?\s*$/i.exec(sql)

  if (!limitMatch) return `${sql} LIMIT ${MAX_ROWS}`

  const first = Number(limitMatch[1] ?? 0)
  const second = limitMatch[2] === undefined ? undefined : Number(limitMatch[2])
  const rows = second ?? first
  const offsetPart = limitMatch[3] ? ` ${limitMatch[3]}` : ''
  const prefix = sql.slice(0, limitMatch.index).trimEnd()

  if (rows <= MAX_ROWS) return sql

  if (second !== undefined) {
    return `${prefix} LIMIT ${first}, ${MAX_ROWS}${offsetPart}`
  }
  return `${prefix} LIMIT ${MAX_ROWS}${offsetPart}`
}

export const SQL_LIMIT = MAX_ROWS
