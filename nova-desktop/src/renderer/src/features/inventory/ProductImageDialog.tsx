import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import type { InventoryRow } from '@shared/types/inventory'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { unwrap } from '@renderer/lib/ipc'

interface ProductImageDialogProps {
  /** 为 null 时弹窗关闭 */
  row: InventoryRow | null
  onClose: () => void
}

/**
 * 商品图片预览弹窗，对齐老系统 Inventory/ProductImagePreview。
 * 图片地址由 POS 服务静态目录提供：<baseUrl>/inventory-image/<款号>.jpg
 */
export function ProductImageDialog({ row, onClose }: ProductImageDialogProps) {
  const [baseUrl, setBaseUrl] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
    if (!row) return
    let active = true
    window.nova.dataConfig
      .baseUrl()
      .then((result) => {
        if (active) setBaseUrl(unwrap(result))
      })
      .catch(() => {
        if (active) setBaseUrl('')
      })
    return () => {
      active = false
    }
  }, [row])

  const src = baseUrl
    ? `${baseUrl.replace(/\/$/, '')}/inventory-image/${encodeURIComponent(row?.styleNo ?? '')}.jpg`
    : ''

  return (
    <Dialog
      open={Boolean(row)}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>商品图片</DialogTitle>
          <DialogDescription>
            {row ? `${row.styleNo} · ${row.name}` : undefined}
          </DialogDescription>
        </DialogHeader>

        <div className="flex h-[360px] items-center justify-center overflow-hidden rounded-xl border border-border bg-surface">
          {src && !failed ? (
            <img
              src={src}
              alt={row ? `${row.styleNo} 商品图片` : '商品图片'}
              className="max-h-full max-w-full object-contain"
              onError={() => setFailed(true)}
            />
          ) : (
            <span className="flex flex-col items-center gap-2 text-ui text-muted-foreground">
              <ImageOff className="h-6 w-6" aria-hidden="true" />
              {src ? '该款号暂无图片' : '未配置服务地址，无法加载图片'}
            </span>
          )}
        </div>
        <p className="text-meta text-muted-foreground">
          图片来自 POS 服务 inventory-image 目录
        </p>
      </DialogContent>
    </Dialog>
  )
}
