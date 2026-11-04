import { useEffect, useState, type FormEvent } from 'react'
import { ImageIcon, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import type { RedeemItem, RedeemItemStatus } from '@shared/types/redeem'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Textarea } from '@renderer/components/ui/textarea'
import { SheetDrawer } from '@renderer/components/common/SheetDrawer'
import { posUploadImage } from '@renderer/lib/pos'
import { REDEEM_ITEM_STATUS } from './api'
import { useCreateRedeemItem, useUpdateRedeemItem } from './queries'

const FORM_ID = 'redeem-item-form'
const INPUT_CLASS = 'h-8 text-ui'

interface RedeemFormState {
  name: string
  image: string
  description: string
  detail: string
  points: string
  totalStock: string
  perMemberLimit: string
  status: RedeemItemStatus
  sort: string
}

function emptyForm(): RedeemFormState {
  return {
    name: '',
    image: '',
    description: '',
    detail: '',
    points: '',
    totalStock: '',
    perMemberLimit: '1',
    status: 'active',
    sort: '0'
  }
}

function formFromItem(item: RedeemItem): RedeemFormState {
  return {
    name: item.name,
    image: item.image,
    description: item.description,
    detail: item.detail,
    points: String(item.points),
    totalStock: String(item.totalStock),
    perMemberLimit: String(item.perMemberLimit),
    status: item.status,
    sort: String(item.sort)
  }
}

/** 礼品图上传：复用小程序素材上传通道，落盘后可被小程序直接引用 */
function RedeemImageField({
  value,
  onChange
}: {
  value: string
  onChange: (url: string) => void
}) {
  const [uploading, setUploading] = useState(false)

  async function handleUpload() {
    if (uploading) return
    setUploading(true)
    try {
      const uploaded = await posUploadImage()
      if (uploaded) onChange(uploaded.url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '图片上传失败')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-ui">礼品图</Label>
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
          {value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleUpload()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {uploading ? '上传中' : value ? '重新上传' : '上传图片'}
            </Button>
            {value ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-muted-foreground hover:text-destructive"
                onClick={() => onChange('')}
              >
                移除
              </Button>
            ) : null}
          </div>
          <span className="text-xs text-muted-foreground">
            小程序兑换列表展示 1:1 缩略图，建议上传 400 × 400 px
          </span>
        </div>
      </div>
    </div>
  )
}

interface RedeemItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null 表示新增；传入礼品表示编辑 */
  item: RedeemItem | null
}

/**
 * 新增 / 编辑兑换礼品：
 * 新增时剩余库存等于总库存；编辑时服务端按总库存差值同步剩余库存，不能小于已兑数量。
 */
export function RedeemItemDialog({ open, onOpenChange, item }: RedeemItemDialogProps) {
  const createMutation = useCreateRedeemItem()
  const updateMutation = useUpdateRedeemItem()
  const [form, setForm] = useState<RedeemFormState>(emptyForm)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm(item ? formFromItem(item) : emptyForm())
    setFormError('')
  }, [open, item])

  const isEdit = Boolean(item)
  const pending = createMutation.isPending || updateMutation.isPending

  function patch(partial: Partial<RedeemFormState>) {
    setForm((current) => ({ ...current, ...partial }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = form.name.trim()
    const points = Number(form.points)
    const totalStock = Number(form.totalStock)
    const perMemberLimit = Number(form.perMemberLimit)
    const sort = Number(form.sort)

    if (!name) {
      setFormError('请输入礼品名称')
      return
    }
    if (!Number.isInteger(points) || points < 0) {
      setFormError('所需积分需为不小于 0 的整数')
      return
    }
    if (!Number.isInteger(totalStock) || totalStock < 0) {
      setFormError('总库存需为不小于 0 的整数')
      return
    }
    if (!Number.isInteger(perMemberLimit) || perMemberLimit < 1) {
      setFormError('每人限兑需为不小于 1 的整数')
      return
    }
    if (!Number.isInteger(sort) || sort < 0) {
      setFormError('排序需为不小于 0 的整数')
      return
    }
    setFormError('')

    const input = {
      name,
      image: form.image,
      description: form.description.trim(),
      detail: form.detail.trim(),
      points,
      totalStock,
      perMemberLimit,
      status: form.status,
      sort
    }

    const onSuccess = () => {
      toast.success(isEdit ? '礼品已更新' : '礼品已新增')
      onOpenChange(false)
    }
    const onError = (error: unknown) => {
      toast.error(error instanceof Error ? error.message : isEdit ? '更新失败' : '新增失败')
    }

    if (item) {
      updateMutation.mutate({ id: item.id, input }, { onSuccess, onError })
    } else {
      createMutation.mutate(input, { onSuccess, onError })
    }
  }

  return (
    <SheetDrawer
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      title={isEdit ? '编辑兑换礼品' : '新增兑换礼品'}
      description={isEdit ? item?.name : '保存后小程序积分兑换页立即展示'}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            关闭
          </Button>
          <Button type="submit" form={FORM_ID} disabled={pending}>
            {pending ? '提交中' : '确定'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="redeem-name" className="text-ui">
            礼品名称
          </Label>
          <Input
            id="redeem-name"
            className={INPUT_CLASS}
            placeholder="例如：品牌帆布袋"
            maxLength={64}
            value={form.name}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="redeem-points" className="text-ui">
              所需积分
            </Label>
            <Input
              id="redeem-points"
              className={INPUT_CLASS}
              type="number"
              min={0}
              step={1}
              placeholder="0"
              value={form.points}
              onChange={(event) => patch({ points: event.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="redeem-stock" className="text-ui">
              总库存
            </Label>
            <Input
              id="redeem-stock"
              className={INPUT_CLASS}
              type="number"
              min={0}
              step={1}
              placeholder="0"
              value={form.totalStock}
              onChange={(event) => patch({ totalStock: event.target.value })}
            />
            {isEdit ? (
              <p className="text-meta text-muted-foreground">
                修改总库存会同步剩余库存，不能小于已兑数量（{item?.redeemedCount ?? 0} 件）
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="redeem-limit" className="text-ui">
              每人限兑
            </Label>
            <Input
              id="redeem-limit"
              className={INPUT_CLASS}
              type="number"
              min={1}
              step={1}
              placeholder="1"
              value={form.perMemberLimit}
              onChange={(event) => patch({ perMemberLimit: event.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="redeem-sort" className="text-ui">
              排序
            </Label>
            <Input
              id="redeem-sort"
              className={INPUT_CLASS}
              type="number"
              min={0}
              step={1}
              placeholder="0"
              value={form.sort}
              onChange={(event) => patch({ sort: event.target.value })}
            />
            <p className="text-meta text-muted-foreground">数值越小越靠前</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="redeem-status" className="text-ui">
            状态
          </Label>
          <Select
            value={form.status}
            onValueChange={(value) => patch({ status: value as RedeemItemStatus })}
          >
            <SelectTrigger id="redeem-status" className={INPUT_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(REDEEM_ITEM_STATUS).map(([value, label]) => (
                <SelectItem key={value} value={value} className="text-ui">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <RedeemImageField value={form.image} onChange={(url) => patch({ image: url })} />

        <div className="space-y-1.5">
          <Label htmlFor="redeem-desc" className="text-ui">
            规格 / 说明
          </Label>
          <Input
            id="redeem-desc"
            className={INPUT_CLASS}
            placeholder="例如：均码 / 米白色"
            maxLength={255}
            value={form.description}
            onChange={(event) => patch({ description: event.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="redeem-detail" className="text-ui">
            领取说明
          </Label>
          <Textarea
            id="redeem-detail"
            className="min-h-20 text-ui"
            placeholder="取货门店、领取期限等说明"
            maxLength={5000}
            value={form.detail}
            onChange={(event) => patch({ detail: event.target.value })}
          />
        </div>

        {formError ? <p className="text-meta text-destructive">{formError}</p> : null}
      </form>
    </SheetDrawer>
  )
}
