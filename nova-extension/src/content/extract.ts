/**
 * 商品页面识别：款号、品名与候选图片
 *
 * 目标页面（伯俊 ERP 商品图片页）结构示例：
 *   <div class="title"><strong>款号：DB32524338&nbsp;品名：IPHelloKittyT恤</strong></div>
 *   <div id="pic" name="pic"><img src="…"/></div>
 *   <div class="divcss1"><img src="…缩略图"/></div>
 * 同时兼容常见商城的 JSON-LD、URL 参数与整页最大图兜底。
 */
import { upgradeImageUrl } from "../shared/image-url"
import type { ExtractedProduct } from "../shared/types"

const STYLE_TEXT_PATTERNS: RegExp[] = [
  /(?:款号|货号|商品编码|商品编号|款式编码|款式|style\s*no)\s*[:：]\s*([A-Za-z0-9_-]{4,24})/i,
  /(?:款号|货号|商品编码|商品编号)\s*([A-Za-z0-9_-]{4,24})/i,
]

const STYLE_JSON_PATTERNS: RegExp[] = [
  /"(?:styleCode|styleNo|goodsCode|productCode|itemCode|sku)"\s*:\s*"([A-Za-z0-9_-]{4,24})"/i,
]

const URL_PARAM_PATTERN = /[?&](?:styleNo|styleCode|goodsCode|productCode|sn|sku)=([A-Za-z0-9_-]{4,24})/i

const NAME_PATTERN = /品名\s*[:：]\s*([^\n\r]{2,80})/i
const NAME_ALT_PATTERN = /"(?:name|productName|title)"\s*:\s*"([^"]{2,80})"/i

/** 淘宝 / 天猫等商城：标题与主图结构另有特征，单独走站点规则 */
const MARKETPLACE_HOSTS = ["taobao.com", "tmall.com", "tmall.hk"]

/** 商城 title 尾部站点名，形如「商品名-淘宝网」「商品名-tmall.com」 */
const MARKETPLACE_TITLE_SUFFIX =
  /(?:\s*[-_|｜—–－·]?\s*)?(?:淘宝网|淘宝|天猫国际|天猫\s*Tmall\.com|天猫|tmall\.com|tmall\.hk|taobao\.com)\s*$/i

/** 品牌噪音：自家品牌名对品名没有意义，采集标题时去掉 */
const BRAND_NOISE =
  /[\s\-_/·、,，|｜]*?(?:戴维贝拉|dave\s*[&＆]\s*bella|davebella|dave\s+bella)[\s\-_/·、,，|｜]*/gi

/** 商城商品标题容器 */
const MARKETPLACE_NAME_SELECTORS: string[] = [
  "#J_Title h3",
  "#J_Title .tb-main-title",
  "h1.tb-main-title",
  "h1.tb-title",
  "#J_DetailMeta h1",
  "#J_DetailMeta .tb-detail-hd h1",
  ".tb-detail-hd h1",
  "h1.item-title",
]

/** 主图常见容器，命中即优先 */
const MAIN_IMAGE_SELECTORS: string[] = [
  "#pic img",
  '[name="pic"] img',
  ".divcss5 img",
  "#mainPic img",
  "#bigImg img",
  ".goods-img img",
  "#spec-img img",
  ".product-image img",
  // 淘宝 / 天猫
  "#J_ImgBooth img",
  "#J_UlThumb img",
  ".tb-booth img",
  ".tb-thumb img",
  ".tb-gallery img",
  "#J_DetailMeta .tb-gallery img",
  ".PicGallery img",
  ".main-pic img",
]

const NOISE_URL = /(?:logo|sprite|icon|avatar|qrcode|placeholder|loading|blank)\b/i

function normalizeStyleNo(raw: string): string {
  return raw
    .replace(/[\s\u00a0\u3000\u200b]/g, "")
    .replace(/[，,。;；]+$/g, "")
    .trim()
}

function cleanProductName(raw: string): string {
  const cut = raw.split(
    /\s+(?:款号|货号|商品编码|商品编号|品牌|颜色|尺码|规格|成分|面料|执行标准)\s*[:：]/,
  )[0]
  return cut
    .replace(/["'“”]/g, "")
    .replace(/[\s\u00a0\u3000]+/g, " ")
    .replace(/^\s*[：:]\s*/, "")
    .trim()
    .slice(0, 60)
}

/**
 * 页面文案常把款号写进品名（如「品名：外套两件套DB3241823」），
 * 这里统一把款号从品名里去掉，并清理残留的分隔符。
 */
function stripStyleNo(name: string, styleNo: string): string {
  if (!styleNo) return name
  const escaped = styleNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return name
    .replace(new RegExp(escaped, "gi"), " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-_/\\()（）【】\[\]:：·、,，]+/, "")
    .replace(/[\s\-_/\\()（）【】\[\]:：·、,，]+$/, "")
    .trim()
}

/** 清洗 + 去款号 + 限长，供各条识别路径统一收口 */
function finalizeProductName(raw: string, styleNo: string): string {
  return stripStyleNo(cleanProductName(raw), styleNo).slice(0, 60)
}

function pageText(doc: Document): string {
  const title = doc.querySelector("div.title, .title")
  const parts = [title?.textContent ?? "", doc.body?.innerText ?? ""]
  return parts.join("\n")
}

/** 是否淘宝 / 天猫等商城页面：这些页面走 title 等站点规则识别品名 */
export function isMarketplacePage(pageUrl: string): boolean {
  try {
    const { hostname } = new URL(pageUrl)
    return MARKETPLACE_HOSTS.some((host) => hostname.endsWith(host))
  } catch {
    return false
  }
}

function metaContent(doc: Document, selector: string): string {
  const content = doc.querySelector<HTMLMetaElement>(selector)?.content?.trim()
  return content && content.length >= 2 ? content : ""
}

/** 优先取 og:title / meta title，商城页通常与商品标题一致 */
function metaProductName(doc: Document): string {
  return (
    metaContent(doc, 'meta[property="og:title"]') ||
    metaContent(doc, 'meta[name="title"]') ||
    metaContent(doc, 'meta[name="og:title"]')
  )
}

function jsonLdProductName(doc: Document): string {
  const scripts = Array.from(
    doc.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
  ).slice(0, 6)
  for (const script of scripts) {
    try {
      const data: unknown = JSON.parse(script.textContent ?? "")
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        const name = (item as { name?: unknown } | null)?.name
        if (typeof name === "string" && name.trim().length >= 2) return name.trim()
      }
    } catch {
      // 非法 JSON 直接跳过
    }
  }
  return ""
}

/** 去掉标题里的品牌名，并清理留下的空括号与分隔符 */
function stripBrandNoise(name: string): string {
  return name
    .replace(BRAND_NOISE, " ")
    .replace(/[（(]\s*[)）]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** 去掉商城站点后缀；个别标题会叠加多个后缀，最多剥 3 次 */
function stripMarketplaceSuffix(name: string): string {
  let out = name.trim()
  for (let i = 0; i < 3; i += 1) {
    const next = out.replace(MARKETPLACE_TITLE_SUFFIX, "").trim()
    if (next === out) break
    out = next
  }
  return out
}

/** 标题类来源（标题容器 / meta / JSON-LD / document.title）统一收口 */
function finalizeTitleName(raw: string, styleNo: string, marketplace: boolean): string {
  const base = marketplace ? stripMarketplaceSuffix(raw) : raw
  return finalizeProductName(stripBrandNoise(base), styleNo)
}

/** 标题转品名：商城只去尾部站点名，其余站点沿用「第一个分隔符截断」 */
function titleToName(doc: Document, marketplace: boolean): string {
  const title = (doc.title || "").trim()
  if (!title) return ""
  if (marketplace) return title
  return title.replace(/\s*[-_|｜]\s*.*$/, "").trim()
}

export function extractStyleNo(
  doc: Document,
  pageUrl: string,
): { styleNo: string; source: string } {
  const text = pageText(doc)
  for (const pattern of STYLE_TEXT_PATTERNS) {
    const match = text.match(pattern)
    if (match?.[1]) {
      const styleNo = normalizeStyleNo(match[1])
      if (styleNo.length >= 4) return { styleNo, source: "text" }
    }
  }

  // 商城页面脚本数据太大，整页正则容易命中无关字段（如 "sku"），直接跳过
  if (!isMarketplacePage(pageUrl)) {
    const html = doc.documentElement?.innerHTML ?? ""
    for (const pattern of STYLE_JSON_PATTERNS) {
      const match = html.match(pattern)
      if (match?.[1]) {
        const styleNo = normalizeStyleNo(match[1])
        if (styleNo.length >= 4) return { styleNo, source: "json" }
      }
    }
  }

  const fromUrl = pageUrl.match(URL_PARAM_PATTERN)
  if (fromUrl?.[1]) {
    const styleNo = normalizeStyleNo(fromUrl[1])
    if (styleNo.length >= 4) return { styleNo, source: "url" }
  }

  return { styleNo: "", source: "empty" }
}

export function extractProductName(doc: Document, styleNo: string, pageUrl = ""): string {
  const marketplace = isMarketplacePage(pageUrl)

  // 1. 页面文案里的「品名：」
  const text = pageText(doc)
  const byLabel = text.match(NAME_PATTERN)
  if (byLabel?.[1]) {
    const name = finalizeProductName(byLabel[1], styleNo)
    if (name.length >= 2) return name
  }

  // 2. 商城商品标题容器
  if (marketplace) {
    for (const selector of MARKETPLACE_NAME_SELECTORS) {
      const raw = doc.querySelector(selector)?.textContent ?? ""
      const name = finalizeTitleName(raw, styleNo, true)
      if (name.length >= 2) return name
    }
  }

  // 3. og:title / meta title
  const fromMeta = metaProductName(doc)
  if (fromMeta) {
    const name = finalizeTitleName(fromMeta, styleNo, marketplace)
    if (name.length >= 2) return name
  }

  // 4. JSON-LD
  const fromLd = jsonLdProductName(doc)
  if (fromLd) {
    const name = finalizeTitleName(fromLd, styleNo, marketplace)
    if (name.length >= 2) return name
  }

  // 商城页面脚本数据太大，整页正则容易命中无关字段，直接跳过
  if (!marketplace) {
    const html = doc.documentElement?.innerHTML ?? ""
    const byJson = html.match(NAME_ALT_PATTERN)
    if (byJson?.[1]) {
      const name = finalizeTitleName(byJson[1], styleNo, false)
      if (name.length >= 2) return name
    }
  }

  // 5. 标题兜底
  return finalizeTitleName(titleToName(doc, marketplace), styleNo, marketplace)
}

function toAbsolute(raw: string, baseUrl: string): string | null {
  const value = (raw || "").trim()
  if (!value || value.startsWith("javascript:") || value.startsWith("blob:")) return null
  try {
    const url = new URL(value, baseUrl)
    if (!["http:", "https:", "data:"].includes(url.protocol)) return null
    return url.toString()
  } catch {
    return null
  }
}

interface ScoredImage {
  url: string
  score: number
}

function pushCandidate(
  list: ScoredImage[],
  seen: Set<string>,
  raw: string | null | undefined,
  baseUrl: string,
  score: number,
): void {
  if (!raw) return
  const absolute = toAbsolute(raw, baseUrl)
  if (!absolute) return
  // 商城缩略图还原为原图，同时让同一张图的不同尺寸去重
  const url = upgradeImageUrl(absolute)
  if (seen.has(url)) return
  seen.add(url)
  list.push({ url, score })
}

export function collectImages(doc: Document, pageUrl: string, max = 8): string[] {
  const list: ScoredImage[] = []
  const seen = new Set<string>()

  // 1. 明确的主图容器
  for (const selector of MAIN_IMAGE_SELECTORS) {
    for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>(selector))) {
      pushCandidate(list, seen, img.currentSrc || img.src || img.getAttribute("data-src"), pageUrl, 1000)
    }
  }

  // 2. og:image / twitter:image
  for (const meta of Array.from(doc.querySelectorAll<HTMLMetaElement>('meta[property="og:image"], meta[name="twitter:image"]'))) {
    pushCandidate(list, seen, meta.content, pageUrl, 900)
  }

  // 3. 整页图片按渲染面积排序兜底
  for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>("img"))) {
    const src = img.currentSrc || img.src || img.getAttribute("data-src")
    if (!src) continue
    const width = img.naturalWidth || img.clientWidth || 0
    const height = img.naturalHeight || img.clientHeight || 0
    const area = width * height
    if (area > 0 && area < 12_000) continue // 明显是图标 / 角标
    if (NOISE_URL.test(src)) continue
    pushCandidate(list, seen, src, pageUrl, Math.min(800, Math.round(area / 2000)))
  }

  // 4. 一个都没有时，兜底取前几张图（允许小图）
  if (list.length === 0) {
    for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>("img")).slice(0, 10)) {
      pushCandidate(list, seen, img.currentSrc || img.src, pageUrl, 1)
    }
  }

  return list
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((item) => item.url)
}

export function extractProduct(doc: Document, pageUrl: string): ExtractedProduct {
  const { styleNo, source } = extractStyleNo(doc, pageUrl)
  return {
    styleNo,
    productName: extractProductName(doc, styleNo, pageUrl),
    images: collectImages(doc, pageUrl),
    pageTitle: doc.title || "",
    pageUrl,
    styleSource: source,
  }
}
