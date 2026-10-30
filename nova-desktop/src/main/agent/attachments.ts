/**
 * 聊天图片附件落盘与回读。
 * 存放到 `~/.nova/analysis/uploads/<sessionId>`：附件是输入而非产物，
 * 因此与工作区隔离，不会出现在产物面板的文件列表里。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import type { AttachmentInput, ChatAttachment } from '@shared/types/analysis'
import { NOVA_HOME } from '../services/settings'

const UPLOADS_DIR = join(NOVA_HOME, 'analysis', 'uploads')

/** 仅接受常见图片格式 */
const IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/bmp'
])

/** 单张图片 10MB 上限，避免 IPC 传输过大 */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

/** 去掉路径分隔符等危险字符，保留扩展名 */
function safeName(name: string): string {
  const cleaned = name.replace(/[^\w.-]/g, '_').slice(-60)
  return cleaned || 'image.png'
}

/** dataURL → { mimeType, buffer } */
function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
  const matched = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl)
  if (!matched) return null
  const mimeType = matched[1]?.toLowerCase()
  const payload = matched[2]
  if (!mimeType || !payload) return null
  try {
    return { mimeType, buffer: Buffer.from(payload, 'base64') }
  } catch {
    return null
  }
}

/** 落盘一批附件；非法格式、非图片或超限的项直接跳过 */
export function saveAttachments(
  sessionId: string,
  inputs: AttachmentInput[] | undefined
): ChatAttachment[] {
  if (!inputs?.length) return []
  const dir = join(UPLOADS_DIR, sessionId)
  mkdirSync(dir, { recursive: true })

  const saved: ChatAttachment[] = []
  inputs.forEach((input, index) => {
    const parsed = parseDataUrl(input.dataUrl)
    if (!parsed) return
    const mimeType = IMAGE_MIME.has(parsed.mimeType) ? parsed.mimeType : input.mimeType.toLowerCase()
    if (!IMAGE_MIME.has(mimeType)) return
    if (parsed.buffer.byteLength > MAX_IMAGE_BYTES) return

    const baseName = safeName(input.name)
    // 剪贴板或部分拖拽来源可能没有扩展名，按 MIME 补一个，保证回读时能还原类型
    const fileName = baseName.includes('.')
      ? baseName
      : `${baseName}.${mimeType.split('/')[1] ?? 'png'}`
    const filePath = join(dir, `${Date.now()}-${index}-${fileName}`)
    writeFileSync(filePath, parsed.buffer)
    saved.push({
      path: filePath,
      name: input.name || safeName(input.name),
      mimeType,
      size: parsed.buffer.byteLength
    })
  })

  return saved
}

/**
 * 读取附件为 dataURL（消息气泡缩略图用）。
 * 只允许 uploads 目录内的文件，避免渲染层借该接口读取任意本地文件。
 */
export function readAttachmentDataUrl(filePath: string): string | null {
  const root = resolve(UPLOADS_DIR)
  const target = resolve(filePath)
  if (target !== root && !target.startsWith(root + sep)) return null
  if (!existsSync(target)) return null

  try {
    const buffer = readFileSync(target)
    const ext = target.slice(target.lastIndexOf('.') + 1).toLowerCase()
    const mimeType =
      ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'svg'
          ? 'image/svg+xml'
          : `image/${ext}`
    return `data:${mimeType};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}
