/**
 * 手机端共享文件本地操作（基于 expo-file-system SDK 58 面向对象 API）。
 * 共享目录：Paths.document/sharefiles/
 */
import * as FileSystem from 'expo-file-system'
import * as SecureStore from 'expo-secure-store'
import * as DocumentPicker from 'expo-document-picker'

import type { ShareFileInfo } from './relay-client'

const { Paths, Directory, File } = FileSystem

/** 记住用户选择的保存目录，后续下载直接写入，不再弹系统分享面板 */
const SAVE_DIR_KEY = 'nova.share.saveDirectoryUri'

/** 清洗文件名，避免路径片段写入沙盒目录 */
function safeFileName(name: string): string {
  return name.replace(/[\\/]/g, '_').trim() || 'download'
}

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
          // SDK 58 的 modificationTime 已经是毫秒时间戳，不要再乘 1000（否则年份溢出为 58821）
          mtime: info.modificationTime ?? Date.now(),
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

/** 创建（或清空）一个用于接收下载的文件 */
export function createShareDownloadFile(name: string): FileSystem.File {
  ensureShareDir()
  const file = new File(getShareDir(), safeFileName(name))
  if (file.exists) file.delete()
  return file
}

/**
 * 追加写入一片 base64 数据。
 * 必须显式指定 encoding: 'base64'——SDK 默认按 UTF-8 写入，
 * 会把 base64 文本当二进制落盘，导致下载文件损坏并膨胀约 1.33 倍。
 */
export async function appendShareChunk(
  file: FileSystem.File,
  base64: string,
  first: boolean
): Promise<void> {
  await file.write(base64, { encoding: 'base64', append: !first })
}

/** 删除未完成的下载文件 */
export function removeShareFile(file: FileSystem.File): void {
  try {
    if (file.exists) file.delete()
  } catch {
    /* ignore */
  }
}

/**
 * 局域网直连下载：返回可取消的任务与完成 Promise（本地 uri）。
 * 走 expo 原生下载任务，进度与取消都由系统网络层实现。
 */
export function startDirectDownload(
  url: string,
  file: FileSystem.File,
  onProgress?: (received: number, total: number) => void
): { task: { cancel: () => void }; done: Promise<string> } {
  const task = FileSystem.File.createDownloadTask(url, file, {
    onProgress: ({ bytesWritten, totalBytes }) => onProgress?.(bytesWritten, totalBytes),
  })
  const done = task.downloadAsync().then((result) => {
    if (!result) throw new Error('下载已取消')
    return result.uri
  })
  return { task, done }
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

/**
 * 下载完成后把文件直接保存到手机上：
 * 首次会弹出系统目录选择（Android 建议选「下载 / Downloads」），之后记住该目录直接写入，
 * 不再走微信 / 云空间这类系统分享面板。
 * 返回 true 表示已保存；false 表示用户取消选择（文件仍留在应用内共享目录）。
 */
export async function saveShareFileToDevice(uri: string): Promise<boolean> {
  const source = new File(uri)

  /**
   * 复制到目标目录。
   * 注意：必须把「目录」本身作为 copy 目标，expo 会在 SAF 目录下自动创建同名文件。
   * 若写成 `new File(dir, name)`，对 content:// 目录拼接出来的是无效 URI，复制会直接失败。
   */
  const copyTo = async (dir: FileSystem.Directory): Promise<void> => {
    await source.copy(dir, { overwrite: true })
  }

  // 1) 复用上次授权的目录：一次选择，后续直接保存
  const savedUri = await SecureStore.getItemAsync(SAVE_DIR_KEY)
  if (savedUri) {
    try {
      await copyTo(new Directory(savedUri))
      // 保存成功后清掉沙盒里的中转文件，避免它继续出现在「本机共享」列表
      removeShareFile(source)
      return true
    } catch {
      // 权限失效（如 iOS 重启后授权过期）：清掉记录重新选择
      await SecureStore.deleteItemAsync(SAVE_DIR_KEY)
    }
  }

  // 2) 首次或授权失效：让用户选择保存目录
  let dir: FileSystem.Directory
  try {
    dir = await Directory.pickDirectoryAsync()
  } catch {
    // 用户取消目录选择，不视为下载失败（文件保留在应用内共享目录）
    return false
  }

  // 目录已选定，复制失败要如实报错，不能静默当作取消
  await copyTo(dir)
  await SecureStore.setItemAsync(SAVE_DIR_KEY, dir.uri)
  removeShareFile(source)
  return true
}
