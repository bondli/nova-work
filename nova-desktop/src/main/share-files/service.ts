/**
 * 本机共享文件服务。
 * 共享目录：~/.nova/sharefiles
 * 提供：列表 / 上传（复制到共享目录）/ 删除 / 保存下载文件
 */
import { copyFile, mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { NOVA_HOME } from '../services/settings'

/** 共享目录路径 */
export const SHARE_DIR = join(NOVA_HOME, 'sharefiles')

/** 共享文件元信息 */
export interface ShareFileInfo {
  name: string
  size: number
  mtime: number
}

/** 确保共享目录存在 */
async function ensureShareDir(): Promise<void> {
  await mkdir(SHARE_DIR, { recursive: true })
}

/**
 * 列出共享目录下的文件（仅文件，不递归子目录）。
 */
export async function listShareFiles(): Promise<ShareFileInfo[]> {
  await ensureShareDir()
  const entries = await readdir(SHARE_DIR, { withFileTypes: true })
  const files: ShareFileInfo[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    try {
      const s = await stat(join(SHARE_DIR, entry.name))
      files.push({ name: entry.name, size: s.size, mtime: Math.floor(s.mtimeMs) })
    } catch {
      /* 单个文件 stat 失败不影响列表 */
    }
  }
  // 按修改时间倒序
  files.sort((a, b) => b.mtime - a.mtime)
  return files
}

/**
 * 将外部文件复制到共享目录。
 * @param sourcePath 源文件绝对路径
 * @returns 复制后的文件名
 */
export async function addToShare(sourcePath: string): Promise<string> {
  await ensureShareDir()
  const name = basename(sourcePath)
  await copyFile(sourcePath, join(SHARE_DIR, name))
  return name
}

/**
 * 删除共享目录中的文件。
 * 只接受文件名（basename），防止路径穿越。
 */
export async function deleteShareFile(name: string): Promise<void> {
  const safeName = basename(name)
  if (!safeName || safeName === '.' || safeName === '..') {
    throw new Error('文件名不合法')
  }
  await unlink(join(SHARE_DIR, safeName))
}

/**
 * 读取共享文件内容（供远程下载时分片发送）。
 */
export async function readShareFile(name: string): Promise<Buffer> {
  const safeName = basename(name)
  const { readFile } = await import('node:fs/promises')
  return readFile(join(SHARE_DIR, safeName))
}
