/**
 * 手机端共享文件本地操作（基于 expo-file-system SDK 58 面向对象 API）。
 * 共享目录：Paths.document/sharefiles/
 */
import * as FileSystem from 'expo-file-system'
import * as DocumentPicker from 'expo-document-picker'
import * as Sharing from 'expo-sharing'

import type { ShareFileInfo } from './relay-client'

const { Paths, Directory, File } = FileSystem

/** 共享目录对象 */
export function getShareDir(): FileSystem.Directory {
  return new Directory(Paths.document, 'sharefiles')
}

/** 确保共享目录存在 */
export function ensureShareDir(): void {
  const dir = getShareDir()
  if (!dir.exists) dir.create({ idempotent: true })
}

/** 列出共享目录下的文件 */
export async function listLocalShareFiles(): Promise<ShareFileInfo[]> {
  ensureShareDir()
  const dir = getShareDir()
  const entries = dir.list()
  const files: ShareFileInfo[] = []
  for (const entry of entries) {
    if (entry instanceof File) {
      try {
        const info = entry.info()
        files.push({
          name: entry.name,
          size: info.size ?? entry.size,
          mtime: info.modificationTime ? info.modificationTime * 1000 : Date.now(),
        })
      } catch {
        /* ignore */
      }
    }
  }
  files.sort((a, b) => b.mtime - a.mtime)
  return files
}

/** 读取共享文件为 base64 */
export async function readShareFileBase64(name: string): Promise<{ base64: string; size: number }> {
  const file = new File(getShareDir(), name)
  if (!file.exists) throw new Error('文件不存在')
  const base64 = await file.base64()
  return { base64, size: file.size }
}

/** 将 base64 内容写入共享目录 */
export async function writeShareFileBase64(name: string, base64: string): Promise<string> {
  ensureShareDir()
  const file = new File(getShareDir(), name)
  await file.write(base64)
  return file.uri
}

/** 删除共享目录中的文件 */
export function deleteShareFile(name: string): void {
  const file = new File(getShareDir(), name)
  if (file.exists) file.delete()
}

/**
 * 从系统文件选择器选一个文件，复制到共享目录。
 * 返回新文件名。
 */
export async function pickAndAddToShare(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true })
  if (result.canceled) return null
  const picked = result.assets?.[0]
  if (!picked?.uri) return null
  const name = picked.name || picked.uri.split('/').pop() || 'file'
  ensureShareDir()
  const src = new File(picked.uri)
  const dest = new File(getShareDir(), name)
  await src.copy(dest)
  return name
}

/** 调起系统分享/另存为，把文件导出到系统 */
export async function shareFile(uri: string): Promise<void> {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri)
  }
}
