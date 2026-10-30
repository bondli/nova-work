/** 页内采集确认浮层：核对款号、品名与图片后上传 */
import { useEffect, useMemo, useState } from "react"

import { BrandMark } from "../components/brand-mark"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { extractProduct } from "../content/extract"
import { cn } from "../lib/utils"
import type { ExtractedProduct, UploadResult } from "../shared/types"

type StatusKind = "idle" | "error" | "success"

interface Status {
  text: string
  kind: StatusKind
}

interface PanelAppProps {
  /** 右键点击的图片地址；右键采集场景下只有这一张图 */
  initialImageUrl?: string
  onClose: () => void
}

function describe(product: ExtractedProduct, images: string[]): Status {
  if (!product.styleNo) return { text: "未识别到款号，请手动填写", kind: "error" }
  if (!images.length) return { text: "未识别到商品图片，可右键图片单独采集", kind: "error" }
  return {
    text: `已识别款号 ${product.styleNo}${product.productName ? ` · ${product.productName}` : ""}`,
    kind: "idle",
  }
}

export function PanelApp({ initialImageUrl = "", onClose }: PanelAppProps) {
  const [product, setProduct] = useState<ExtractedProduct>(() =>
    extractProduct(document, location.href),
  )

  // 采集统一从右键单张图片进入；只有未指定图片时才回退到页面候选图
  const images = useMemo(
    () => (initialImageUrl ? [initialImageUrl] : product.images),
    [initialImageUrl, product],
  )

  const [selected, setSelected] = useState(() => initialImageUrl || images[0] || "")
  const [styleNo, setStyleNo] = useState(product.styleNo)
  const [productName, setProductName] = useState(product.productName)
  const [status, setStatus] = useState<Status>(() => describe(product, images))
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(onClose, 1200)
    return () => clearTimeout(timer)
  }, [saved, onClose])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown, true)
    return () => document.removeEventListener("keydown", onKeyDown, true)
  }, [onClose])

  function rescan(): void {
    const next = extractProduct(document, location.href)
    const nextImages = initialImageUrl ? [initialImageUrl] : next.images
    setProduct(next)
    setSelected(nextImages[0] ?? "")
    setStyleNo(next.styleNo)
    setProductName(next.productName)
    setStatus(describe(next, nextImages))
  }

  async function submit(): Promise<void> {
    if (busy) return

    const sn = styleNo.trim()
    if (!sn) {
      setStatus({ text: "请填写款号", kind: "error" })
      return
    }
    if (!/^[A-Za-z0-9_-]+$/.test(sn)) {
      setStatus({ text: "款号只能包含字母、数字、下划线和短横线", kind: "error" })
      return
    }
    if (!selected) {
      setStatus({ text: "没有可上传的图片", kind: "error" })
      return
    }

    setBusy(true)
    setStatus({ text: "正在压缩并上传…", kind: "idle" })

    try {
      const result = (await chrome.runtime.sendMessage({
        type: "NOVA_UPLOAD",
        payload: {
          styleNo: sn,
          productName: productName.trim(),
          imageUrl: selected,
          pageUrl: location.href,
        },
      })) as UploadResult | undefined

      if (!result?.ok) throw new Error(result?.error || "上传失败，请检查插件设置")

      let suffix = ""
      if (result.updated != null) {
        suffix =
          result.updated > 0
            ? ` · 已同步 ${result.updated} 个 SKU 的品名`
            : "（库存中未找到该款号，品名未同步）"
      }

      setStatus({ text: `已保存：${result.sn ?? sn}.jpg${suffix}`, kind: "success" })
      setSaved(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatus({ text: `上传失败：${message}`, kind: "error" })
      setBusy(false)
    }
  }

  return (
    <div className="fixed right-4 top-4 z-[2147483647] w-[348px] rounded-[14px] border border-border bg-background p-3.5 font-sans text-foreground shadow-[0_14px_40px_rgba(31,34,51,.18)]">
      <header className="mb-3 flex items-center gap-2.5">
        <BrandMark size={26} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold leading-tight">采集商品图片</div>
          <div className="text-[11px] leading-tight text-muted-foreground/80">DaveBella POS</div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label="关闭"
          className="h-6 w-6 shrink-0 p-0"
          onClick={onClose}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </Button>
      </header>

      <div className="mb-2 flex h-[148px] items-center justify-center overflow-hidden rounded-lg bg-muted">
        {selected ? (
          <img src={selected} alt="主图预览" className="max-h-[148px] max-w-full object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground">未识别到图片</span>
        )}
      </div>

      {images.length > 1 ? (
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {images.map((url) => (
            <button
              key={url}
              type="button"
              title={url}
              onClick={() => setSelected(url)}
              className={cn(
                "h-[38px] w-[38px] overflow-hidden rounded-md border bg-muted p-0",
                url === selected
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border hover:border-foreground/20",
              )}
            >
              <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="mb-2.5">
        <Label htmlFor="nova-style-no" className="mb-1">
          款号 <span className="text-destructive">*</span>
        </Label>
        <Input
          id="nova-style-no"
          value={styleNo}
          spellCheck={false}
          placeholder="如 DB32524338"
          onChange={(event) => setStyleNo(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit()
          }}
        />
      </div>

      <div className="mb-2.5">
        <Label htmlFor="nova-product-name" className="mb-1">
          品名
        </Label>
        <Input
          id="nova-product-name"
          value={productName}
          placeholder="如 IPHelloKittyT恤"
          onChange={(event) => setProductName(event.target.value)}
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button className="flex-1" disabled={busy} onClick={() => void submit()}>
          {saved ? "已保存" : busy ? "上传中…" : "上传并保存"}
        </Button>
        <Button variant="outline" disabled={busy} onClick={rescan}>
          重新识别
        </Button>
      </div>

      <p
        className={cn(
          "mt-2 min-h-[17px] text-xs",
          status.kind === "error" && "text-destructive",
          status.kind === "success" && "text-success",
          status.kind === "idle" && "text-muted-foreground",
        )}
      >
        {status.text}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground/70">
        保存后桌面端与手机端刷新即可看到新图。
      </p>
    </div>
  )
}
