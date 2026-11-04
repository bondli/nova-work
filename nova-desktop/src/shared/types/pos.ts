/**
 * 桌面端访问 nova-pos-server 的请求 / 响应契约。
 * 只允许主进程白名单内的 GET / POST 路径；身份与令牌由主进程注入。
 */

export type PosMethod = 'GET' | 'POST'

export interface PosRequestInput {
  method: PosMethod
  /** 必须命中主进程端点的白名单，例如 /order/queryList */
  path: string
  query?: Record<string, string | number | boolean | null | undefined>
  body?: unknown
}

export interface PosHealth {
  status: string
  service: string
}

/** 导出类请求：服务端返回文件二进制（如 xlsx），由主进程落盘 */
export interface PosExportInput {
  /** 必须命中主进程端点的白名单，例如 /order/exportOrderItemList */
  path: string
  body?: unknown
  /** 保存对话框的默认文件名，含扩展名 */
  filename: string
}

export interface PosExportResult {
  /** 用户在保存对话框取消时为 null */
  filePath: string | null
}

/** Excel 上传解析结果，字段对应 /common/uploadFile */
export interface PosUploadResult {
  /** 解析后的行数据，键为 Excel 表头 */
  data: Array<Record<string, string>>
  total: number
  /** 本地文件名，由主进程补充 */
  filename?: string
}

/** 小程序素材图片上传结果，字段对应 /marketing/uploadImage */
export interface PosImageUploadResult {
  /** 可直接被小程序 <Image> 引用的绝对地址 */
  url: string
  /** 服务端落盘后的文件名 */
  filename: string
}
