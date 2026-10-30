/**
 * 本地 JSON 文件读写工具。
 * 写入采用「临时文件 + rename」的原子替换，避免进程中断导致文件损坏；
 * 同一路径的写入串行执行，避免并发读改写互相覆盖或 rename 竞态。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** 每个资源一把串行锁：key → 上一个任务的完成信号 */
const locks = new Map<string, Promise<void>>()

/**
 * 串行执行同一资源的读改写任务。
 * 用于会话记录、通知列表这类「读取 → 修改 → 写回」必须原子的场景。
 */
export async function withFileLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve()
  const run = previous.then(task, task)
  const guard = run.then(
    () => undefined,
    () => undefined
  )
  locks.set(key, guard)
  try {
    return await run
  } finally {
    if (locks.get(key) === guard) locks.delete(key)
  }
}

/** 读取 JSON 文件；文件不存在时返回 null，其他错误继续抛出 */
export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

/** 原子写入 JSON 文件，权限收紧为仅当前用户可读写 */
export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await withFileLock(`write:${filePath}`, async () => {
    await mkdir(dirname(filePath), { recursive: true })
    const tempPath = `${filePath}.tmp`
    await writeFile(tempPath, JSON.stringify(data, null, 2), { mode: 0o600 })
    await rename(tempPath, filePath)
  })
}
