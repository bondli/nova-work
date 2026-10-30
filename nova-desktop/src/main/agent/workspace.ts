/**
 * 会话工作目录与产物文件。
 * 每个会话独立目录 `~/.nova/workspaces/<sessionId>/`，文件工具只能访问目录内路径。
 */
import { mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { ArtifactKind, ArtifactMeta } from '@shared/types/analysis'
import { NOVA_HOME } from '../services/settings'

const WORKSPACES_ROOT = join(NOVA_HOME, 'workspaces')
const MAX_ARTIFACT_BYTES = 20 * 1024 * 1024
const TEXT_EXTENSIONS: Record<string, ArtifactKind> = {
  '.html': 'html',
  '.htm': 'html',
  '.csv': 'csv',
  '.md': 'md',
  '.txt': 'text'
}

/** 工作区越界错误 */
export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkspaceError'
  }
}

/** 返回会话目录绝对路径 */
export function getWorkspaceDir(sessionId: string): string {
  return join(WORKSPACES_ROOT, sessionId)
}

/** 创建会话目录与 artifacts 子目录 */
export async function ensureWorkspace(sessionId: string): Promise<void> {
  await mkdir(join(getWorkspaceDir(sessionId), 'artifacts'), { recursive: true })
}

/** 把相对路径解析到工作区内；绝对路径与 .. 越界一律拒绝 */
export function resolveWorkspacePath(sessionId: string, relativePath: string): string {
  if (!relativePath.trim()) throw new WorkspaceError('路径不能为空')
  if (isAbsolute(relativePath)) throw new WorkspaceError('只能使用工作区内的相对路径')

  const root = resolve(getWorkspaceDir(sessionId))
  const target = resolve(root, relativePath)
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new WorkspaceError('路径超出当前会话工作区')
  }
  return target
}

/** 写入工作区文件；自动创建父目录 */
export async function writeWorkspaceFile(
  sessionId: string,
  relativePath: string,
  content: string
): Promise<void> {
  const target = resolveWorkspacePath(sessionId, relativePath)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, content, 'utf8')
}

/** 读取工作区文本文件；先用 realpath 校验符号链接不会越界 */
export async function readWorkspaceFile(
  sessionId: string,
  relativePath: string,
  maxBytes = MAX_ARTIFACT_BYTES
): Promise<string> {
  const target = resolveWorkspacePath(sessionId, relativePath)
  const rootReal = await realpath(getWorkspaceDir(sessionId))
  const targetReal = await realpath(target)
  if (!targetReal.startsWith(`${rootReal}${sep}`)) {
    throw new WorkspaceError('路径超出当前会话工作区')
  }

  const info = await stat(targetReal)
  if (info.size > maxBytes) throw new WorkspaceError('文件超过 20MB，无法预览')
  return readFile(targetReal, 'utf8')
}

/** 按扩展名判断产物类型，未知类型按纯文本处理 */
export function resolveArtifactKind(filePath: string): ArtifactKind {
  return TEXT_EXTENSIONS[extname(filePath).toLowerCase()] ?? 'text'
}

/** 根据相对路径构造稳定的产物 id */
export function buildArtifactId(sessionId: string, relativePath: string): string {
  return `${sessionId}:${relativePath}`
}

/** 把已发布的文件转成产物元数据；文件不存在或过大时报错 */
export async function describeArtifact(
  sessionId: string,
  relativePath: string,
  title?: string,
  messageId?: string
): Promise<ArtifactMeta> {
  const target = resolveWorkspacePath(sessionId, relativePath)
  const info = await stat(target)
  if (!info.isFile()) throw new WorkspaceError('产物必须是文件')
  if (info.size > MAX_ARTIFACT_BYTES) throw new WorkspaceError('产物超过 20MB，无法发布')

  return {
    id: buildArtifactId(sessionId, relativePath),
    sessionId,
    title: title?.trim() || basename(relativePath),
    path: relativePath,
    kind: resolveArtifactKind(relativePath),
    size: info.size,
    createdAt: new Date().toISOString(),
    messageId
  }
}

/**
 * 扫描 artifacts 目录，作为 publish_artifact 漏调时的兜底。
 * 只返回可预览的文本类文件，按文件名排序。
 */
export async function scanArtifacts(
  sessionId: string,
  messageId?: string
): Promise<ArtifactMeta[]> {
  const root = join(getWorkspaceDir(sessionId), 'artifacts')

  let entries: string[]
  try {
    entries = await readdir(root)
  } catch {
    return []
  }

  const artifacts: ArtifactMeta[] = []
  for (const name of entries.sort()) {
    const relativePath = `artifacts/${name}`
    if (!TEXT_EXTENSIONS[extname(name).toLowerCase()]) continue
    try {
      artifacts.push(await describeArtifact(sessionId, relativePath, undefined, messageId))
    } catch {
      // 单个文件异常不影响其余产物展示
    }
  }
  return artifacts
}

/** 供诊断：工作区相对路径（用于日志，不含用户主目录） */
export function toWorkspaceRelative(sessionId: string, absolutePath: string): string {
  return relative(getWorkspaceDir(sessionId), absolutePath)
}
