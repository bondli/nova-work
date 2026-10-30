/**
 * 图片下载与压缩（在 Service Worker 中执行）
 * 输出统一为 JPEG：最长边 2000px、质量 0.85，满足服务端 jpg/jpeg 校验与 8MB 上限。
 */

const MAX_EDGE = 2000
const QUALITY = 0.85
/** 服务端 multer 限制 8MB，留出余量 */
const MAX_SOURCE_BYTES = 8 * 1024 * 1024

export async function fetchImageBlob(url: string): Promise<Blob> {
  if (url.startsWith("data:")) {
    const res = await fetch(url)
    return await res.blob()
  }

  // host_permissions: <all_urls> 允许后台跨域拉取；带上 cookie 兼容需要登录的图床
  const res = await fetch(url, {
    credentials: "include",
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`图片下载失败（HTTP ${res.status}）`)

  const blob = await res.blob()
  if (blob.size > MAX_SOURCE_BYTES) throw new Error("图片超过 8MB，无法上传")
  return blob
}

export async function toJpegBlob(source: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(source)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("无法创建画布")

    // 统一铺白底，避免透明 PNG 转 JPEG 后出现黑块
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    return await canvas.convertToBlob({ type: "image/jpeg", quality: QUALITY })
  } catch {
    // 已经是 JPEG 时直接使用原图，其余格式无法转换则明确报错
    if (source.type === "image/jpeg") return source
    throw new Error("图片格式不支持，请改用 jpg / png 图片")
  }
}
