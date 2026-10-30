/** 配置读写与上传地址拼装 */
import type { NovaConfig } from "./types"

const CONFIG_KEY = "nova.config"

export async function getConfig(): Promise<NovaConfig> {
  const stored = await chrome.storage.local.get(CONFIG_KEY)
  const raw = stored[CONFIG_KEY] as Partial<NovaConfig> | undefined
  return {
    endpoint: String(raw?.endpoint ?? "").trim(),
    token: String(raw?.token ?? "").trim(),
  }
}

export async function saveConfig(config: NovaConfig): Promise<void> {
  await chrome.storage.local.set({
    [CONFIG_KEY]: {
      endpoint: config.endpoint.trim(),
      token: config.token.trim(),
    },
  })
}

/**
 * 拼装最终上传地址：
 * - 用户可粘贴完整地址（含 /inventory/uploadImage），也可只填服务地址
 * - token 为空时沿用地址里已有的 token 参数
 */
export function buildUploadUrl(endpoint: string, token: string): string {
  const value = endpoint.trim()
  if (!value) return ""

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return ""
  }
  if (!["http:", "https:"].includes(url.protocol)) return ""

  if (!url.pathname.includes("/inventory/uploadImage")) {
    const base = url.pathname.replace(/\/+$/, "")
    url.pathname = `${base}/inventory/uploadImage`
  }
  if (token.trim() && !url.searchParams.get("token")) {
    url.searchParams.set("token", token.trim())
  }
  return url.toString()
}
