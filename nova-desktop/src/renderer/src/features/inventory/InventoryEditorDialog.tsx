import { useEffect, useState, type FormEvent } from 'react'
import { PackageOpen } from 'lucide-react'
import { toast } from 'sonner'
import type { InventoryRow } from '@shared/types/inventory'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { CopyButton } from '@renderer/components/common/CopyText'
import { useInventoryDetailQuery, useUpdateInventory } from './queries'

interface InventoryEditorDialogProps {
  /** 为 null 时弹窗关闭 */
  row: InventoryRow | null
  onClose: () => void
}

/** 只读字段统一样式，弱化视觉以突出可编辑项；条码字段支持一键复制 */
function ReadonlyField({
  label,
  value,
  copy = false
}: {
  label: string
  value: string
  copy?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-meta text-muted-foreground">{label}</p>
      <p
        className="flex min-w-0 items-center gap-1 truncate rounded-md bg-surface px-3 py-2 text-ui"
        title={value}
      >
        <span className="truncate">{value || '—'}</span>
        {copy && value ? <CopyButton text={value} label={label} /> : null}
      </p>
    </div>
  )
}

/**
 * 库存编辑弹窗，对齐老系统 Inventory/Editor：
 * 条码 / 名称 / 品牌 / 颜色 / 尺码 只读回填，仅「库存」可编辑，底部「确定 / 关闭」。
 */
export function InventoryEditorDialog({ row, onClose }: InventoryEditorDialogProps) {
  const { data: detail, isLoading } = useInventoryDetailQuery(row?.sku ?? null)
  const mutation = useUpdateInventory()

  const [counts, setCounts] = useState('')

  useEffect(() => {
    const source = detail ?? row
    if (source) setCounts(String(source.counts))
  }, [detail, row])

  const source = detail ?? row
  const stock = Number(counts)
  const valid = counts !== '' && Number.isFinite(stock) && stock >= 0
  const delta = source && valid ? stock - source.counts : 0

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!source) return
    if (!valid) {
      toast.error('请输入不小于 0 的库存数量')
      return
    }

    try {
      await mutation.mutateAsync({
        sku: source.sku,
        sn: source.styleNo,
        name: source.name,
        brand: source.brand,
        color: source.color,
        size: source.size,
        counts: stock
      })
      toast.success('更新库存成功')
      onClose()
    } catch (error) {
      toast.error((error as Error).message || '更新库存失败')
    }
  }

  return (
    <Dialog
      open={Boolean(row)}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="max-w-[520px] gap-4">
        <DialogHeader className="flex-row items-center gap-3 space-y-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <PackageOpen className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-title">编辑库存</DialogTitle>
            <DialogDescription className="text-meta">
              除库存外，其余字段由商品基础资料维护
            </DialogDescription>
          </div>
        </DialogHeader>

        {isLoading && !source ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-border p-3">
              <ReadonlyField label="条码" value={source?.sku ?? ''} copy />
              <ReadonlyField label="名称" value={source?.name ?? ''} />
              <ReadonlyField label="品牌" value={source?.brand ?? ''} />
              <ReadonlyField label="颜色" value={source?.color ?? ''} />
              <ReadonlyField label="尺码" value={source?.size ?? ''} />
              <ReadonlyField label="当前库存" value={source ? String(source.counts) : ''} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-counts" className="text-ui">
                调整后库存 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="inv-counts"
                className="h-9"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={counts}
                onChange={(event) => setCounts(event.target.value)}
              />
              {valid && delta !== 0 ? (
                <p
                  className={
                    delta > 0 ? 'text-meta text-success' : 'text-meta text-destructive'
                  }
                >
                  {delta > 0 ? `较当前 +${delta}` : `较当前 ${delta}`}
                </p>
              ) : null}
            </div>

            <DialogFooter className="pt-1">
              <Button type="button" variant="outline" onClick={onClose}>
                关闭
              </Button>
              <Button type="submit" disabled={mutation.isPending || !valid}>
                {mutation.isPending ? '提交中' : '确定'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
