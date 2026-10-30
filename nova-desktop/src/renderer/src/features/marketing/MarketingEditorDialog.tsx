import { useEffect, useState, type FormEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { CampaignDetail, CampaignInput, CampaignType } from '@shared/types/campaign'
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
import { Skeleton } from '@renderer/components/ui/skeleton'
import { DateRangePicker, type DateRangeValue } from '@renderer/components/common/DateRangePicker'
import { SheetDrawer } from '@renderer/components/common/SheetDrawer'
import { formatDate } from '@renderer/lib/format'
import { useCampaignDetailQuery, useCreateCampaign, useUpdateCampaign } from './queries'
import { CAMPAIGN_TYPE } from './labels'

const TYPE_OPTIONS: CampaignType[] = ['full_reduce', 'full_send', 'full_gift']

const INPUT_CLASS = 'h-8 text-ui'

interface RuleRow {
  full: string
  reduce: string
}

interface DistributionRow {
  full: string
  reduce: string
  count: string
}

interface MarketingFormState {
  name: string
  description: string
  type: CampaignType | ''
  start: string
  end: string
  /** 活动主图 URL */
  theme: string
  /** 内容图 URL */
  image: string
  /** 满减活动规则 */
  rules: RuleRow[]
  /** 满送活动：整体满送值 + 券分配规则 */
  sendFull: string
  sendReduce: string
  distributionRules: DistributionRow[]
  /** 买赠活动：买几件送几件 */
  giftFull: string
  giftCount: string
}

function emptyForm(): MarketingFormState {
  const today = formatDate(new Date())
  return {
    name: '',
    description: '',
    type: '',
    start: today,
    end: today,
    theme: '',
    image: '',
    rules: [{ full: '', reduce: '' }],
    sendFull: '',
    sendReduce: '',
    distributionRules: [{ full: '', reduce: '', count: '' }],
    giftFull: '',
    giftCount: ''
  }
}

/** 表单日期字符串（YYYY-MM-DD）转区间值，空值回落到今天 */
function toRange(start: string, end: string): DateRangeValue {
  const fallback = new Date()
  return {
    start: start ? new Date(`${start}T00:00:00`) : fallback,
    end: end ? new Date(`${end}T00:00:00`) : fallback
  }
}

function formFromDetail(detail: CampaignDetail): MarketingFormState {
  return {
    ...emptyForm(),
    name: detail.name,
    description: detail.description,
    type: detail.type,
    start: detail.start ?? '',
    end: detail.end ?? ''
  }
}

/** 活动内容按类型组装成服务端可解析的结构 */
function buildContent(form: MarketingFormState): unknown {
  if (form.type === 'full_send') {
    return {
      full: form.sendFull,
      reduce: form.sendReduce,
      distributionRules: form.distributionRules
    }
  }
  if (form.type === 'full_gift') {
    return { full: form.giftFull, gift: form.giftCount }
  }
  return { rules: form.rules }
}

/** 表头小标题，用于活动内容内的分组 */
function ContentHint({ children }: { children: string }) {
  return <p className="text-meta text-muted-foreground">{children}</p>
}

interface MarketingFormProps {
  /** 表单 id，抽屉页脚的提交按钮通过 form 属性关联 */
  formId: string
  initial: MarketingFormState
  isEdit: boolean
  loading: boolean
  onSubmit: (input: CampaignInput) => void
}

/**
 * 营销活动表单：活动名称 / 活动描述 / 活动时间 / 活动类型 / 活动主图 / 内容图 / 活动内容。
 * 活动类型创建后不可修改（老系统同样禁止），活动内容按类型切换规则编辑器。
 * 提交与关闭按钮由外层抽屉页脚渲染，表单通过 form 属性被触发。
 */
function MarketingForm({ formId, initial, isEdit, loading, onSubmit }: MarketingFormProps) {
  const [form, setForm] = useState<MarketingFormState>(initial)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    setForm(initial)
    setFormError('')
  }, [initial])

  function patch(partial: Partial<MarketingFormState>) {
    setForm((current) => ({ ...current, ...partial }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.name.trim()) {
      setFormError('请输入活动名称')
      return
    }
    if (!form.description.trim()) {
      setFormError('请输入活动描述')
      return
    }
    if (!form.start || !form.end) {
      setFormError('请选择活动时间')
      return
    }
    if (!form.type) {
      setFormError('请选择活动类型')
      return
    }
    if (new Date(form.start) > new Date(form.end)) {
      setFormError('开始时间不能晚于结束时间')
      return
    }
    if (form.type === 'full_send' && form.distributionRules.length === 0) {
      setFormError('满送活动至少需要一条分配规则')
      return
    }
    setFormError('')

    onSubmit({
      marketingName: form.name.trim(),
      marketingDesc: form.description.trim(),
      marketingType: form.type,
      startTime: new Date(`${form.start}T00:00:00`).toISOString(),
      endTime: new Date(`${form.end}T23:59:59`).toISOString(),
      marketingTheme: form.theme.trim(),
      marketingImage: form.image.trim(),
      marketingContent: buildContent(form)
    })
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="marketing-name" className="text-ui">
          活动名称
        </Label>
        <Input
          id="marketing-name"
          className={INPUT_CLASS}
          placeholder="输入活动名称"
          value={form.name}
          onChange={(event) => patch({ name: event.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="marketing-desc" className="text-ui">
          活动描述
        </Label>
        <Input
          id="marketing-desc"
          className={INPUT_CLASS}
          placeholder="输入活动描述"
          value={form.description}
          onChange={(event) => patch({ description: event.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-ui">活动时间</Label>
        <DateRangePicker
          value={toRange(form.start, form.end)}
          allowFuture
          onChange={(next) =>
            patch({ start: formatDate(next.start), end: formatDate(next.end) })
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="marketing-type" className="text-ui">
          活动类型
        </Label>
        <Select
          value={form.type}
          onValueChange={(value) => patch({ type: value as CampaignType })}
          disabled={isEdit}
        >
          <SelectTrigger id="marketing-type" className={INPUT_CLASS}>
            <SelectValue placeholder="选择活动类型" />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((type) => (
              <SelectItem key={type} value={type} className="text-ui">
                {CAMPAIGN_TYPE[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isEdit ? (
          <ContentHint>活动类型创建后不可修改</ContentHint>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="marketing-theme" className="text-ui">
          活动主图
        </Label>
        <Input
          id="marketing-theme"
          className={INPUT_CLASS}
          placeholder="输入活动主图地址"
          value={form.theme}
          onChange={(event) => patch({ theme: event.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="marketing-image" className="text-ui">
          内容图
        </Label>
        <Input
          id="marketing-image"
          className={INPUT_CLASS}
          placeholder="输入内容图地址"
          value={form.image}
          onChange={(event) => patch({ image: event.target.value })}
        />
      </div>

      <div className="space-y-2 rounded-lg border border-border p-3">
        <p className="text-ui font-semibold">活动内容</p>
        {isEdit ? <ContentHint>修改活动不会更新活动内容，仅新建时生效</ContentHint> : null}

        {form.type === 'full_reduce' ? (
          <div className="space-y-2">
            {form.rules.map((rule, index) => (
              <div key={`rule-${index}`} className="flex items-center gap-2">
                <Input
                  className={INPUT_CLASS}
                  type="number"
                  min={0}
                  placeholder="满（元）"
                  value={rule.full}
                  onChange={(event) => {
                    const rules = [...form.rules]
                    rules[index] = { ...rule, full: event.target.value }
                    patch({ rules })
                  }}
                />
                <Input
                  className={INPUT_CLASS}
                  type="number"
                  min={0}
                  placeholder="减（元）"
                  value={rule.reduce}
                  onChange={(event) => {
                    const rules = [...form.rules]
                    rules[index] = { ...rule, reduce: event.target.value }
                    patch({ rules })
                  }}
                />
                {form.rules.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="删除规则"
                    className="text-destructive hover:text-destructive"
                    onClick={() => patch({ rules: form.rules.filter((_, i) => i !== index) })}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => patch({ rules: [...form.rules, { full: '', reduce: '' }] })}
            >
              添加满减规则
            </Button>
          </div>
        ) : null}

        {form.type === 'full_send' ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                className={INPUT_CLASS}
                type="number"
                min={0}
                placeholder="满（元）"
                value={form.sendFull}
                onChange={(event) => patch({ sendFull: event.target.value })}
              />
              <Input
                className={INPUT_CLASS}
                type="number"
                min={0}
                placeholder="送（元）"
                value={form.sendReduce}
                onChange={(event) => patch({ sendReduce: event.target.value })}
              />
            </div>
            <ContentHint>送的钱按以下规则拆成满减优惠券</ContentHint>
            {form.distributionRules.map((rule, index) => (
              <div key={`distribution-${index}`} className="flex items-center gap-2">
                <Input
                  className={INPUT_CLASS}
                  type="number"
                  min={0}
                  placeholder="满（元）"
                  value={rule.full}
                  onChange={(event) => {
                    const rows = [...form.distributionRules]
                    rows[index] = { ...rule, full: event.target.value }
                    patch({ distributionRules: rows })
                  }}
                />
                <Input
                  className={INPUT_CLASS}
                  type="number"
                  min={0}
                  placeholder="减（元）"
                  value={rule.reduce}
                  onChange={(event) => {
                    const rows = [...form.distributionRules]
                    rows[index] = { ...rule, reduce: event.target.value }
                    patch({ distributionRules: rows })
                  }}
                />
                <Input
                  className={INPUT_CLASS}
                  type="number"
                  min={0}
                  placeholder="张数"
                  value={rule.count}
                  onChange={(event) => {
                    const rows = [...form.distributionRules]
                    rows[index] = { ...rule, count: event.target.value }
                    patch({ distributionRules: rows })
                  }}
                />
                {form.distributionRules.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="删除分配规则"
                    className="text-destructive hover:text-destructive"
                    onClick={() =>
                      patch({
                        distributionRules: form.distributionRules.filter((_, i) => i !== index)
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                patch({
                  distributionRules: [
                    ...form.distributionRules,
                    { full: '', reduce: '', count: '' }
                  ]
                })
              }
            >
              添加分配规则
            </Button>
          </div>
        ) : null}

        {form.type === 'full_gift' ? (
          <div className="flex items-center gap-2">
            <Input
              className={INPUT_CLASS}
              type="number"
              min={0}
              placeholder="买（件）"
              value={form.giftFull}
              onChange={(event) => patch({ giftFull: event.target.value })}
            />
            <Input
              className={INPUT_CLASS}
              type="number"
              min={0}
              placeholder="送（件）"
              value={form.giftCount}
              onChange={(event) => patch({ giftCount: event.target.value })}
            />
          </div>
        ) : null}

        {!form.type ? <ContentHint>请先选择活动类型，再设置活动内容</ContentHint> : null}
      </div>

      {formError ? <p className="text-meta text-destructive">{formError}</p> : null}
    </form>
  )
}

/** 表单 id，抽屉页脚按钮通过 form 属性关联 */
const FORM_ID = 'marketing-form'

interface MarketingEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: string | null
}

/**
 * 修改营销活动抽屉：回填活动详情后提交 /marketing/update。
 * 服务端不更新营销内容，因此活动内容区块仅对新建生效。
 */
export function MarketingEditorDialog({
  open,
  onOpenChange,
  campaignId
}: MarketingEditorDialogProps) {
  const { data: detail, isLoading } = useCampaignDetailQuery(campaignId, open)
  const updateMutation = useUpdateCampaign()
  const [initial, setInitial] = useState<MarketingFormState>(() => emptyForm())

  useEffect(() => {
    if (!open || !detail) return
    setInitial(formFromDetail(detail))
  }, [open, detail])

  function handleSubmit(input: CampaignInput) {
    if (!campaignId) return
    updateMutation.mutate(
      { id: campaignId, input },
      {
        onSuccess: () => {
          toast.success('更新营销活动成功')
          onOpenChange(false)
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : '更新营销活动失败')
        }
      }
    )
  }

  return (
    <SheetDrawer
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      title="修改营销活动"
      description={detail ? detail.name : '加载活动详情中'}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateMutation.isPending}
          >
            关闭
          </Button>
          <Button type="submit" form={FORM_ID} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? '提交中' : '确定'}
          </Button>
        </>
      }
    >
      <MarketingForm
        formId={FORM_ID}
        initial={initial}
        isEdit
        loading={isLoading && !detail}
        onSubmit={handleSubmit}
      />
    </SheetDrawer>
  )
}

interface NewMarketingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * 新增营销活动抽屉：提交 /marketing/create。
 * 满减 / 满送活动会由服务端按活动内容生成对应的店铺优惠券。
 */
export function NewMarketingDialog({ open, onOpenChange }: NewMarketingDialogProps) {
  const createMutation = useCreateCampaign()
  const [initial, setInitial] = useState<MarketingFormState>(() => emptyForm())

  // 每次打开重置表单，避免上次输入残留
  useEffect(() => {
    if (open) setInitial(emptyForm())
  }, [open])

  function handleSubmit(input: CampaignInput) {
    createMutation.mutate(input, {
      onSuccess: () => {
        toast.success('新增营销活动成功')
        onOpenChange(false)
      },
      onError: (error) => {
        toast.error(error instanceof Error ? error.message : '新增营销活动失败')
      }
    })
  }

  return (
    <SheetDrawer
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      title="新增营销活动"
      description="按活动内容生成对应的店铺优惠券"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            关闭
          </Button>
          <Button type="submit" form={FORM_ID} disabled={createMutation.isPending}>
            {createMutation.isPending ? '提交中' : '确定'}
          </Button>
        </>
      }
    >
      <MarketingForm
        formId={FORM_ID}
        initial={initial}
        isEdit={false}
        loading={false}
        onSubmit={handleSubmit}
      />
    </SheetDrawer>
  )
}
