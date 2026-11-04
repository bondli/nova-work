import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ImageIcon, Loader2, Plus, RotateCw, Save, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import type {
  MiniHomeBanner,
  MiniHomeBrandStory,
  MiniHomeCategory,
  MiniHomeContent,
  MiniHomeProduct,
  MiniHomeProductDetail,
  MiniHomeStore
} from '@shared/types/mini-home'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { Switch } from '@renderer/components/ui/switch'
import { Textarea } from '@renderer/components/ui/textarea'
import { fetchStyleSkus } from '@renderer/features/inventory/api'
import { posUploadImage } from '@renderer/lib/pos'
import { useMiniHomeContentQuery, useSaveMiniHomeContent } from './queries'

/** 小程序配置分区：基础信息 / 顶部 Banner / 本季新品，三个页签各自保存同一份配置 */
export type MiniHomeSection = 'base' | 'banners' | 'products'

const SECTION_META: Record<MiniHomeSection, { title: string; desc: string }> = {
  base: {
    title: '小程序基础信息',
    desc: '维护主营类目、品牌价值与门店信息；门店信息同时用于首页「到店体验」和「我的-门店信息」'
  },
  banners: {
    title: '小程序 Banner',
    desc: '仅配置首页顶部轮播 Banner，保存后小程序实时生效'
  },
  products: {
    title: '小程序新品',
    desc: '仅配置首页「本季新品」商品，保存后小程序实时生效'
  }
}

const EMPTY_BANNER: MiniHomeBanner = {
  tag: '',
  title: '',
  desc: '',
  cta: '',
  image: '',
  link: ''
}

const EMPTY_CATEGORY: MiniHomeCategory = { name: '', size: '', image: '' }

const EMPTY_PRODUCT: MiniHomeProduct = {
  tag: '',
  name: '',
  desc: '',
  price: '',
  originPrice: '',
  image: '',
  sn: '',
  detailImages: []
}

const DEFAULT_PRODUCT_DETAIL: MiniHomeProductDetail = {
  enabled: false,
  path: '/pages/product/index'
}

const MAX_BANNERS = 5
const MAX_CATEGORIES = 8
const MAX_PRODUCTS = 8

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <Label className="text-xs font-normal text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function SectionCard({
  title,
  count,
  children
}: {
  title: string
  count?: number
  children: ReactNode
}) {
  return (
    <Card className="gap-0">
      <CardHeader className="border-b border-border py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          {title}
          {count !== undefined ? (
            <span className="text-xs font-normal text-muted-foreground">共 {count} 项</span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-3">{children}</CardContent>
    </Card>
  )
}

function RemoveButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="h-7 px-2 text-muted-foreground hover:text-destructive"
    >
      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      删除
    </Button>
  )
}

function AddButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={disabled}>
      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </Button>
  )
}

/**
 * 图片上传字段：主进程弹选择框上传到服务端 mini-image 目录，成功后回显缩略图与地址。
 * 不再允许手填 URL，避免填写不可用的外链。
 */
function ImageField({
  label,
  value,
  onChange,
  hint,
  className
}: {
  label: string
  value: string
  onChange: (url: string) => void
  /** 小程序实际展示尺寸提示，避免上传比例不对导致裁切 */
  hint?: string
  className?: string
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
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <Label className="text-xs font-normal text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
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
          <span className="truncate text-xs text-muted-foreground" title={value}>
            {value || '未上传，页面使用渐变兜底'}
          </span>
          {hint ? <span className="text-xs text-muted-foreground/70">{hint}</span> : null}
        </div>
      </div>
    </div>
  )
}

/**
 * 小程序配置面板：按页签只渲染对应模块。
 * 保存后由 nova-pos-server 写入 `~/.nova/mini-content.json`，小程序端实时读取。
 */
export function MiniHomeConfigPanel({ section }: { section: MiniHomeSection }) {
  const { data, isLoading, isFetching, error, refetch } = useMiniHomeContentQuery()
  const saveMutation = useSaveMiniHomeContent()
  const [draft, setDraft] = useState<MiniHomeContent | null>(null)
  /** 款号校验结果：按商品下标记录，用于提示是否存在该款及 SKU 数量 */
  const [styleHints, setStyleHints] = useState<Record<number, { ok: boolean; text: string }>>({})

  useEffect(() => {
    if (data) setDraft(data)
  }, [data])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (error || !draft) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card py-12 text-center">
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : '配置加载失败，请稍后重试'}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          重新加载
        </Button>
      </div>
    )
  }

  const meta = SECTION_META[section]

  const patch = <K extends keyof MiniHomeContent>(key: K, value: MiniHomeContent[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  }

  const updateBanner = (index: number, value: Partial<MiniHomeBanner>) => {
    setDraft((current) =>
      current
        ? { ...current, banners: current.banners.map((item, i) => (i === index ? { ...item, ...value } : item)) }
        : current
    )
  }

  const updateCategory = (index: number, value: Partial<MiniHomeCategory>) => {
    setDraft((current) =>
      current
        ? { ...current, categories: current.categories.map((item, i) => (i === index ? { ...item, ...value } : item)) }
        : current
    )
  }

  const updateProduct = (index: number, value: Partial<MiniHomeProduct>) => {
    setDraft((current) =>
      current
        ? { ...current, products: current.products.map((item, i) => (i === index ? { ...item, ...value } : item)) }
        : current
    )
  }

  const updateProductDetail = (value: Partial<MiniHomeProductDetail>) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            productDetail: { ...(current.productDetail ?? DEFAULT_PRODUCT_DETAIL), ...value }
          }
        : current
    )
  }

  /** 校验款号是否存在：用库存查询接口取该款 SKU，并把商品名/数量作为提示 */
  const checkStyle = async (index: number, sn: string) => {
    const value = sn.trim()
    if (!value) {
      setStyleHints((current) => {
        const next = { ...current }
        delete next[index]
        return next
      })
      return
    }
    try {
      const skus = await fetchStyleSkus(value)
      setStyleHints((current) => ({
        ...current,
        [index]: skus.length
          ? { ok: true, text: `已关联：${skus[0]?.name ?? value} · 共 ${skus.length} 个 SKU` }
          : { ok: false, text: '库存中未找到该款号' }
      }))
    } catch {
      setStyleHints((current) => ({ ...current, [index]: { ok: false, text: '款号校验失败，请重试' } }))
    }
  }

  const updateStory = (value: Partial<MiniHomeBrandStory>) => {
    setDraft((current) => (current ? { ...current, brandStory: { ...current.brandStory, ...value } } : current))
  }

  const updateStore = (value: Partial<MiniHomeStore>) => {
    setDraft((current) => (current ? { ...current, store: { ...current.store, ...value } } : current))
  }

  const handleSave = () => {
    saveMutation.mutate(draft, {
      onSuccess: () => toast.success('小程序配置已保存，小程序端实时生效'),
      onError: (saveError) =>
        toast.error(saveError instanceof Error ? saveError.message : '保存失败，请稍后重试')
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">{meta.title}</span>
          <span className="text-xs text-muted-foreground">{meta.desc}</span>
        </div>
        <Button type="button" size="sm" onClick={handleSave} disabled={saveMutation.isPending || isFetching}>
          <Save className="h-3.5 w-3.5" aria-hidden="true" />
          {saveMutation.isPending ? '保存中' : '保存配置'}
        </Button>
      </div>

      {section === 'base' ? (
        <>
          <SectionCard title="主营类目" count={draft.categories.length}>
            <div className="grid grid-cols-2 gap-3">
              {draft.categories.map((category, index) => (
                <div key={index} className="rounded-md border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">类目 {index + 1}</span>
                    <RemoveButton onClick={() => patch('categories', draft.categories.filter((_, i) => i !== index))} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="名称">
                      <Input
                        className="h-8 text-ui"
                        value={category.name}
                        maxLength={20}
                        onChange={(event) => updateCategory(index, { name: event.target.value })}
                      />
                    </Field>
                    <Field label="年龄段">
                      <Input
                        className="h-8 text-ui"
                        value={category.size}
                        maxLength={20}
                        onChange={(event) => updateCategory(index, { size: event.target.value })}
                      />
                    </Field>
                    <ImageField
                      label="类目图片（留空用渐变兜底）"
                      className="col-span-2"
                      hint="展示约 110 × 104（三列宫格），建议上传 220 × 208 px，接近 1:1，主体居中"
                      value={category.image}
                      onChange={(url) => updateCategory(index, { image: url })}
                    />
                  </div>
                </div>
              ))}
            </div>
            <AddButton
              onClick={() => patch('categories', [...draft.categories, { ...EMPTY_CATEGORY }])}
              disabled={draft.categories.length >= MAX_CATEGORIES}
            >
              添加类目
            </AddButton>
          </SectionCard>

          <SectionCard title="品牌价值">
            <div className="grid grid-cols-2 gap-3">
              <Field label="品牌名">
                <Input
                  className="h-8 text-ui"
                  value={draft.brand.name}
                  maxLength={40}
                  onChange={(event) => patch('brand', { ...draft.brand, name: event.target.value })}
                />
              </Field>
              <Field label="副标题">
                <Input
                  className="h-8 text-ui"
                  value={draft.brand.sublabel}
                  maxLength={60}
                  onChange={(event) => patch('brand', { ...draft.brand, sublabel: event.target.value })}
                />
              </Field>
              <Field label="英文标题">
                <Input
                  className="h-8 text-ui"
                  value={draft.brandStory.title}
                  maxLength={40}
                  onChange={(event) => updateStory({ title: event.target.value })}
                />
              </Field>
              <Field label="中文标语">
                <Input
                  className="h-8 text-ui"
                  value={draft.brandStory.slogan}
                  maxLength={40}
                  onChange={(event) => updateStory({ slogan: event.target.value })}
                />
              </Field>
            </div>
            <Field label="品牌介绍">
              <Textarea
                className="min-h-20 text-ui"
                value={draft.brandStory.desc}
                maxLength={300}
                onChange={(event) => updateStory({ desc: event.target.value })}
              />
            </Field>
            <ImageField
              label="品牌横图（留空用渐变兜底）"
              hint="展示 347 × 150（整卡宽），建议上传 694 × 300 px，比例约 2.3:1，左右可裁切"
              value={draft.brandStory.images[0] ?? ''}
              onChange={(url) => updateStory({ images: url ? [url] : [] })}
            />
            <div className="grid grid-cols-3 gap-3">
              {draft.brandStory.stats.map((stat, index) => (
                <div key={index} className="rounded-md border border-border p-3">
                  <div className="grid grid-cols-1 gap-2">
                    <Field label={`数据 ${index + 1}`}>
                      <Input
                        className="h-8 text-ui"
                        value={stat.value}
                        maxLength={20}
                        onChange={(event) =>
                          updateStory({
                            stats: draft.brandStory.stats.map((item, i) =>
                              i === index ? { ...item, value: event.target.value } : item
                            )
                          })
                        }
                      />
                    </Field>
                    <Field label="说明">
                      <Input
                        className="h-8 text-ui"
                        value={stat.label}
                        maxLength={20}
                        onChange={(event) =>
                          updateStory({
                            stats: draft.brandStory.stats.map((item, i) =>
                              i === index ? { ...item, label: event.target.value } : item
                            )
                          })
                        }
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="店铺信息">
            <div className="grid grid-cols-2 gap-3">
              <Field label="门店名称">
                <Input
                  className="h-8 text-ui"
                  value={draft.store.name}
                  maxLength={40}
                  onChange={(event) => updateStore({ name: event.target.value })}
                />
              </Field>
              <Field label="联系电话">
                <Input
                  className="h-8 text-ui"
                  value={draft.store.phone}
                  maxLength={30}
                  onChange={(event) => updateStore({ phone: event.target.value })}
                />
              </Field>
              <Field label="门店地址" className="col-span-2">
                <Input
                  className="h-8 text-ui"
                  value={draft.store.address}
                  maxLength={100}
                  onChange={(event) => updateStore({ address: event.target.value })}
                />
              </Field>
              <Field label="营业时间" className="col-span-2">
                <Input
                  className="h-8 text-ui"
                  placeholder="10:00 - 22:00 · 周一至周日"
                  value={draft.store.hours}
                  maxLength={60}
                  onChange={(event) => updateStore({ hours: event.target.value })}
                />
              </Field>
              <Field label="纬度">
                <Input
                  className="h-8 text-ui"
                  type="number"
                  value={String(draft.store.lat)}
                  onChange={(event) => updateStore({ lat: Number(event.target.value) || 0 })}
                />
              </Field>
              <Field label="经度">
                <Input
                  className="h-8 text-ui"
                  type="number"
                  value={String(draft.store.lng)}
                  onChange={(event) => updateStore({ lng: Number(event.target.value) || 0 })}
                />
              </Field>
              <ImageField
                label="门店图片（留空用渐变兜底）"
                className="col-span-2"
                hint="展示 347 × 132（整卡宽），建议上传 694 × 264 px，比例约 2.6:1，上下可裁切"
                value={draft.store.image}
                onChange={(url) => updateStore({ image: url })}
              />
            </div>
          </SectionCard>
        </>
      ) : null}

      {section === 'banners' ? (
        <SectionCard title="活动 Banner" count={draft.banners.length}>
          {draft.banners.map((banner, index) => (
            <div key={index} className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Banner {index + 1}</span>
                <RemoveButton onClick={() => patch('banners', draft.banners.filter((_, i) => i !== index))} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="角标">
                  <Input
                    className="h-8 text-ui"
                    value={banner.tag}
                    maxLength={20}
                    onChange={(event) => updateBanner(index, { tag: event.target.value })}
                  />
                </Field>
                <Field label="标题" className="col-span-2">
                  <Input
                    className="h-8 text-ui"
                    value={banner.title}
                    maxLength={60}
                    onChange={(event) => updateBanner(index, { title: event.target.value })}
                  />
                </Field>
                <Field label="描述" className="col-span-2">
                  <Input
                    className="h-8 text-ui"
                    value={banner.desc}
                    maxLength={100}
                    onChange={(event) => updateBanner(index, { desc: event.target.value })}
                  />
                </Field>
                <Field label="按钮文案">
                  <Input
                    className="h-8 text-ui"
                    value={banner.cta}
                    maxLength={20}
                    onChange={(event) => updateBanner(index, { cta: event.target.value })}
                  />
                </Field>
                <ImageField
                  label="Banner 图片（留空用渐变兜底）"
                  className="col-span-2"
                  hint="展示 272 × 152（横滑卡片，约 16:9），建议上传 544 × 304 px，左右可裁切"
                  value={banner.image}
                  onChange={(url) => updateBanner(index, { image: url })}
                />
                <Field label="跳转路径（可选）">
                  <Input
                    className="h-8 text-ui"
                    placeholder="/pages/activity-detail/index?id=活动ID"
                    value={banner.link}
                    onChange={(event) => updateBanner(index, { link: event.target.value })}
                  />
                  <span className="text-xs text-muted-foreground/70">
                    填活动详情页路径可跳转活动页，活动ID 见「营销活动」列表第一列；留空则只提示活动信息
                  </span>
                </Field>
              </div>
            </div>
          ))}
          <AddButton
            onClick={() => patch('banners', [...draft.banners, { ...EMPTY_BANNER }])}
            disabled={draft.banners.length >= MAX_BANNERS}
          >
            添加 Banner
          </AddButton>
        </SectionCard>
      ) : null}

      {section === 'products' ? (
        <>
          <SectionCard title="商品点击与商详页">
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">允许点击「本季新品」商品卡</span>
                <span className="text-xs text-muted-foreground">
                  开启后点击商品会跳转到下方配置的小程序商详页，并携带关联款号 sn
                </span>
              </div>
              <Switch
                checked={(draft.productDetail ?? DEFAULT_PRODUCT_DETAIL).enabled}
                onCheckedChange={(checked) => updateProductDetail({ enabled: checked })}
              />
            </div>
            <Field label="商详页路径">
              <Input
                className="h-8 text-ui"
                placeholder="/pages/product/index"
                value={(draft.productDetail ?? DEFAULT_PRODUCT_DETAIL).path}
                maxLength={200}
                onChange={(event) => updateProductDetail({ path: event.target.value })}
              />
              <span className="text-xs text-muted-foreground/70">
                留空默认使用 /pages/product/index；跳转时自动追加 ?sn=款号
              </span>
            </Field>
          </SectionCard>

          <SectionCard title="本季新品" count={draft.products.length}>
          <div className="grid grid-cols-2 gap-3">
            {draft.products.map((product, index) => (
              <div key={index} className="rounded-md border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">商品 {index + 1}</span>
                  <RemoveButton onClick={() => patch('products', draft.products.filter((_, i) => i !== index))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="角标">
                    <Input
                      className="h-8 text-ui"
                      value={product.tag}
                      maxLength={20}
                      onChange={(event) => updateProduct(index, { tag: event.target.value })}
                    />
                  </Field>
                  <Field label="商品名">
                    <Input
                      className="h-8 text-ui"
                      value={product.name}
                      maxLength={40}
                      onChange={(event) => updateProduct(index, { name: event.target.value })}
                    />
                  </Field>
                  <Field label="描述" className="col-span-2">
                    <Input
                      className="h-8 text-ui"
                      value={product.desc}
                      maxLength={60}
                      onChange={(event) => updateProduct(index, { desc: event.target.value })}
                    />
                  </Field>
                  <Field label="销售价">
                    <Input
                      className="h-8 text-ui"
                      placeholder="¥399"
                      value={product.price}
                      maxLength={20}
                      onChange={(event) => updateProduct(index, { price: event.target.value })}
                    />
                  </Field>
                  <Field label="划线价">
                    <Input
                      className="h-8 text-ui"
                      placeholder="¥499"
                      value={product.originPrice}
                      maxLength={20}
                      onChange={(event) => updateProduct(index, { originPrice: event.target.value })}
                    />
                  </Field>
                  <ImageField
                    label="商品图片（留空用渐变兜底）"
                    className="col-span-2"
                    hint="展示 132 × 150（竖版商品卡），建议上传 264 × 300 px，比例约 0.88:1，主体居中"
                    value={product.image}
                    onChange={(url) => updateProduct(index, { image: url })}
                  />
                  <Field label="关联款号（商详页 SKU 来源）" className="col-span-2">
                    <Input
                      className="h-8 text-ui"
                      placeholder="例如 A23A1A1234"
                      value={product.sn ?? ''}
                      maxLength={40}
                      onChange={(event) => updateProduct(index, { sn: event.target.value.trim() })}
                      onBlur={(event) => void checkStyle(index, event.target.value)}
                    />
                    {styleHints[index] ? (
                      <span
                        className={
                          styleHints[index].ok ? 'text-xs text-emerald-600' : 'text-xs text-destructive'
                        }
                      >
                        {styleHints[index].text}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/70">
                        填写库存中的款号，商详页据此展示 SKU 列表；留空则该商品无法跳转
                      </span>
                    )}
                  </Field>
                  <Field label="详描图片（商详页展示）" className="col-span-2">
                    <div className="flex flex-col gap-2">
                      {(product.detailImages ?? []).map((image, detailIndex) => (
                        <div key={detailIndex} className="flex items-end gap-2">
                          <ImageField
                            className="flex-1"
                            label={`详描图 ${detailIndex + 1}`}
                            hint="商详页整宽展示，建议上传 750 × 750 px 或更高"
                            value={image}
                            onChange={(url) =>
                              updateProduct(index, {
                                detailImages: product.detailImages.map((item, i) => (i === detailIndex ? url : item))
                              })
                            }
                          />
                          <RemoveButton
                            onClick={() =>
                              updateProduct(index, {
                                detailImages: product.detailImages.filter((_, i) => i !== detailIndex)
                              })
                            }
                          />
                        </div>
                      ))}
                      {product.detailImages.length < 3 ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateProduct(index, { detailImages: [...product.detailImages, ''] })
                          }
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          添加详描图
                        </Button>
                      ) : null}
                    </div>
                  </Field>
                </div>
              </div>
            ))}
          </div>
          <AddButton
            onClick={() => patch('products', [...draft.products, { ...EMPTY_PRODUCT }])}
            disabled={draft.products.length >= MAX_PRODUCTS}
          >
            添加商品
          </AddButton>
          </SectionCard>
        </>
      ) : null}
    </div>
  )
}
