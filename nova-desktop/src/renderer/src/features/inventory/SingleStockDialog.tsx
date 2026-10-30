import { useState, type FormEvent, type ReactNode } from 'react'
import { PackagePlus } from 'lucide-react'
import { toast } from 'sonner'
import type { InventoryCreateInput } from '@shared/types/inventory'
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
import { useCreateInventory } from './queries'

interface SingleStockDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface FormState {
  sn: string
  name: string
  brand: string
  sku: string
  color: string
  size: string
  originalPrice: string
  costPrice: string
  counts: string
}

/** 字段顺序与必填项对齐老系统 Inventory/SingleStock */
const EMPTY_FORM: FormState = {
  sn: '',
  name: '',
  brand: '',
  sku: '',
  color: '',
  size: '',
  originalPrice: '',
  costPrice: '',
  counts: ''
}

const INPUT_CLASS = 'h-8 text-ui'

/** 表单字段：统一标签 + 必填星号 */
function Field({
  id,
  label,
  children
}: {
  id: string
  label: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-ui">
        {label} <span className="text-destructive">*</span>
      </Label>
      {children}
    </div>
  )
}

function parseAmount(value: string): number | null {
  if (!value.trim()) return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

/**
 * 库存「单件新增」弹窗，对齐老系统 Inventory/SingleStock：
 * 款号 / 名称 / 品牌 / 条码 / 颜色 / 尺码 / 吊牌价 / 成本价 / 库存 全部必填，
 * 提交后写入库存并向流水追加一条「单品入库」。
 */
export function SingleStockDialog({ open, onOpenChange }: SingleStockDialogProps) {
  const mutation = useCreateInventory()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  /** 关闭时清空输入，避免下次打开残留上一次的数据 */
  function handleClose() {
    setForm(EMPTY_FORM)
    onOpenChange(false)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const textFields: (keyof FormState)[] = ['sn', 'name', 'brand', 'sku', 'color', 'size']
    if (textFields.some((key) => !form[key].trim())) {
      toast.error('请完整填写款号、名称、品牌、条码、颜色与尺码')
      return
    }

    const originalPrice = parseAmount(form.originalPrice)
    const costPrice = parseAmount(form.costPrice)
    const counts = parseAmount(form.counts)
    if (originalPrice === null || costPrice === null || counts === null) {
      toast.error('吊牌价、成本价与库存需为不小于 0 的数字')
      return
    }

    const input: InventoryCreateInput = {
      sn: form.sn.trim(),
      name: form.name.trim(),
      brand: form.brand.trim(),
      sku: form.sku.trim(),
      color: form.color.trim(),
      size: form.size.trim(),
      originalPrice,
      costPrice,
      counts
    }

    try {
      await mutation.mutateAsync(input)
      toast.success('新增入库成功')
      setForm(EMPTY_FORM)
      onOpenChange(false)
    } catch (error) {
      toast.error((error as Error).message || '新增入库失败')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setForm(EMPTY_FORM)
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-[520px] gap-4">
        <DialogHeader className="flex-row items-center gap-3 space-y-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <PackagePlus className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-title">新增单件商品</DialogTitle>
            <DialogDescription className="text-meta">
              新增商品后立即写入库存与商品流水
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field id="single-stock-sn" label="款号">
              <Input
                id="single-stock-sn"
                className={INPUT_CLASS}
                placeholder="输入款号"
                value={form.sn}
                onChange={(event) => update('sn', event.target.value)}
              />
            </Field>
            <Field id="single-stock-name" label="名称">
              <Input
                id="single-stock-name"
                className={INPUT_CLASS}
                placeholder="输入商品名称"
                value={form.name}
                onChange={(event) => update('name', event.target.value)}
              />
            </Field>
            <Field id="single-stock-brand" label="品牌">
              <Input
                id="single-stock-brand"
                className={INPUT_CLASS}
                placeholder="输入品牌"
                value={form.brand}
                onChange={(event) => update('brand', event.target.value)}
              />
            </Field>
            <Field id="single-stock-sku" label="条码">
              <Input
                id="single-stock-sku"
                className={INPUT_CLASS}
                placeholder="输入条码"
                value={form.sku}
                onChange={(event) => update('sku', event.target.value)}
              />
            </Field>
            <Field id="single-stock-color" label="颜色">
              <Input
                id="single-stock-color"
                className={INPUT_CLASS}
                placeholder="输入颜色"
                value={form.color}
                onChange={(event) => update('color', event.target.value)}
              />
            </Field>
            <Field id="single-stock-size" label="尺码">
              <Input
                id="single-stock-size"
                className={INPUT_CLASS}
                placeholder="输入尺码"
                value={form.size}
                onChange={(event) => update('size', event.target.value)}
              />
            </Field>
            <Field id="single-stock-original-price" label="吊牌价">
              <Input
                id="single-stock-original-price"
                className={INPUT_CLASS}
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                placeholder="输入吊牌价"
                value={form.originalPrice}
                onChange={(event) => update('originalPrice', event.target.value)}
              />
            </Field>
            <Field id="single-stock-cost-price" label="成本价">
              <Input
                id="single-stock-cost-price"
                className={INPUT_CLASS}
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                placeholder="输入成本价"
                value={form.costPrice}
                onChange={(event) => update('costPrice', event.target.value)}
              />
            </Field>
            <Field id="single-stock-counts" label="库存">
              <Input
                id="single-stock-counts"
                className={INPUT_CLASS}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                placeholder="输入库存"
                value={form.counts}
                onChange={(event) => update('counts', event.target.value)}
              />
            </Field>
          </div>

          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" onClick={handleClose} disabled={mutation.isPending}>
              关闭
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? '提交中' : '确定'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
