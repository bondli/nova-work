/** 插件与服务端的共享类型 */

export interface NovaConfig {
  /** 采集图片接口地址，可填完整地址或只填服务地址 */
  endpoint: string
  /** 服务端 storage.uploadToken */
  token: string
}

/** 页面识别结果 */
export interface ExtractedProduct {
  styleNo: string
  productName: string
  /** 候选图片（绝对地址，首张为主图） */
  images: string[]
  pageTitle: string
  pageUrl: string
  /** 款号来源：text / json / url / empty */
  styleSource: string
}

/** 提交上传的参数 */
export interface CollectPayload {
  styleNo: string
  productName: string
  imageUrl: string
  pageUrl: string
}

export interface UploadResult {
  ok: boolean
  sn?: string
  imageUrl?: string
  /** 品名同步到库存表时命中的 SKU 数；未提交品名为 null，未命中为 0 */
  updated?: number | null
  bytes?: number
  error?: string
}
