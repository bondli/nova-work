/**
 * 产物文件工具：图标、类型判断与大小格式化。
 * 供文件列表、预览标题栏与消息内产物卡复用。
 */
import {
  File,
  FileCode2,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  History,
  type LucideIcon
} from 'lucide-react'
import type { AgentToolCall, ArtifactMeta } from '@shared/types/analysis'

export function isHtmlFile(name: string): boolean {
  return /\.html?$/i.test(name)
}

export function isMarkdownFile(name: string): boolean {
  return /\.mdx?$/i.test(name)
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** 按扩展名返回带色图标 */
export function FileIconFor({ file, className }: { file: ArtifactMeta; className?: string }) {
  const name = file.path || file.title
  const Icon = iconForName(name)
  return <Icon className={className} aria-hidden="true" />
}

function iconForName(name: string): LucideIcon {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'html' || ext === 'htm') return FileCode2
  if (ext === 'md' || ext === 'markdown') return FileText
  if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') return FileSpreadsheet
  if (ext === 'json') return FileJson
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return FileImage
  if (ext === 'txt' || ext === 'log') return History
  return File
}

/** 工具名对应的动作图标，历史轨迹里使用 */
export function toolStatusLabel(call: AgentToolCall): string {
  if (call.status === 'running') return '执行中'
  if (call.status === 'success') return '成功'
  return '失败'
}

/** 汇总工具耗时，作为轨迹条的耗时文案 */
export function totalDurationLabel(calls: AgentToolCall[]): string | null {
  const total = calls.reduce((sum, call) => sum + (call.durationMs ?? 0), 0)
  if (total <= 0) return null
  return total < 1000 ? `${total}ms` : `${(total / 1000).toFixed(1)}s`
}
