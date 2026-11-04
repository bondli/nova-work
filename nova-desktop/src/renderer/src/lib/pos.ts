/**
 * 渲染层访问 nova-pos-server 的统一入口。
 * 所有请求经主进程白名单转发，这里只做类型声明与 IpcResult 解包。
 */
import type {
  PosExportInput,
  PosExportResult,
  PosImageUploadResult,
  PosRequestInput,
  PosUploadResult
} from '@shared/types/pos'
import { unwrap } from './ipc'

/** 发起一次 GET / POST 请求，失败时抛出带错误码的 IpcCallError */
export async function posRequest<T>(input: PosRequestInput): Promise<T> {
  return unwrap(await window.nova.pos.request(input)) as T
}

export function posGet<T>(
  path: string,
  query?: PosRequestInput['query']
): Promise<T> {
  // IPC 校验不接受 undefined，可选筛选项在这里直接剔除
  const normalized = query
    ? Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined))
    : undefined
  return posRequest<T>({ method: 'GET', path, query: normalized })
}

export function posPost<T>(path: string, body?: unknown, query?: PosRequestInput['query']): Promise<T> {
  return posRequest<T>({ method: 'POST', path, body, query })
}

/** 导出文件：服务端生成二进制 → 主进程弹保存对话框并落盘；取消时 filePath 为 null */
export async function posExport(input: PosExportInput): Promise<PosExportResult> {
  return unwrap(await window.nova.pos.export(input))
}

/** 让用户选择本地 Excel，主进程上传解析；取消时返回 null */
export async function posUploadFile(): Promise<PosUploadResult | null> {
  return unwrap(await window.nova.pos.upload())
}

/** 让用户选择本地图片上传为小程序素材，返回服务端地址；取消时返回 null */
export async function posUploadImage(): Promise<PosImageUploadResult | null> {
  return unwrap(await window.nova.pos.uploadImage())
}
