/** 上传商品图片到 POS 服务：POST multipart，字段 sn + file，token 走查询参数 */
import { fetchImageBlob, toJpegBlob } from "./image"
import { buildUploadUrl, getConfig } from "./storage"
import type { CollectPayload, UploadResult } from "./types"

/** 与服务端 safeSnPattern 保持一致 */
const SAFE_SN = /^[A-Za-z0-9_-]+$/

export async function uploadProductImage(payload: CollectPayload): Promise<UploadResult> {
  const sn = payload.styleNo.trim()
  if (!sn) return { ok: false, error: "款号不能为空" }
  if (!SAFE_SN.test(sn)) return { ok: false, error: "款号只能包含字母、数字、下划线和短横线" }
  if (!payload.imageUrl) return { ok: false, error: "没有可上传的图片" }

  const config = await getConfig()
  const uploadUrl = buildUploadUrl(config.endpoint, config.token)
  if (!uploadUrl) {
    return { ok: false, error: "请先在插件设置中配置采集图片接口地址" }
  }

  try {
    const source = await fetchImageBlob(payload.imageUrl)
    const jpeg = await toJpegBlob(source)

    const form = new FormData()
    form.append("sn", sn)
    // 服务端会按款号把品名同步到库存表，为空时只更新图片
    const productName = payload.productName.trim()
    if (productName) form.append("name", productName)
    form.append("file", jpeg, `${sn}.jpg`)

    const res = await fetch(uploadUrl, { method: "POST", body: form })
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      body = null
    }

    const parsed = body as
      | {
          success?: boolean
          error?: string
          data?: { sn?: string; imageUrl?: string; updated?: number | null }
        }
      | null

    if (!res.ok || !parsed?.success) {
      const message = parsed?.error || `上传失败（HTTP ${res.status}）`
      return { ok: false, error: message }
    }

    return {
      ok: true,
      sn: parsed.data?.sn ?? sn,
      imageUrl: parsed.data?.imageUrl,
      updated: parsed.data?.updated ?? null,
      bytes: jpeg.size,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}
