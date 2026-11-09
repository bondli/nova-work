import { useEffect, useState } from 'react'
import { Download, FileSpreadsheet, Loader2, UploadCloud } from 'lucide-react'
import { toast } from 'sonner'
import type { BatchStockRow, StockAction } from '@shared/types/inventory'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import { SheetDrawer } from '@renderer/components/common/SheetDrawer'
import { posUploadFile } from '@renderer/lib/pos'
import { cn } from '@renderer/lib/utils'
import { downloadBatchTemplate, processBatchStock } from './api'
import { useCommitBatchStock } from './queries'

interface BatchStockDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 由「批量操作」下拉菜单传入；为空时不渲染内容 */
  action: StockAction | null
}

/** 两种批量入口的文案差异 */
const ACTION_META: Record<StockAction, { title: string; confirm: string; billLabel: string }> = {
  'batch-in': {
    title: '批量入库',
    confirm: '执行入库',
    billLabel: '请输入入库单号'
  },
  'batch-out': {
    title: '批量退库',
    confirm: '执行退货',
    billLabel: '请输入退货单号'
  }
}

/** 入库预览的类型标记，对齐老系统的 新款 / 补款 / 补货 */
const TYPE_TAG: Record<string, { text: string; className: string }> = {
  newStyle: { text: '新款', className: 'bg-sky-50 text-sky-600' },
  addSku: { text: '补款', className: 'bg-emerald-50 text-emerald-600' },
  addNum: { text: '补货', className: 'bg-rose-50 text-rose-600' }
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

/**
 * 批量入库 / 批量退库。
 * 对齐老系统 BitchStock：先下载模板填 Excel，再上传解析、预览、填单据号执行。
 */
export function BatchStockDialog({ open, onOpenChange, action }: BatchStockDialogProps) {
  const currentAction = action ?? 'batch-in'
  const meta = ACTION_META[currentAction]
  const commit = useCommitBatchStock()

  const [rows, setRows] = useState<BatchStockRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [fileName, setFileName] = useState('')
  const [billNo, setBillNo] = useState('')
  const [formError, setFormError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // 每次打开都恢复初始值，避免上次数据残留
  useEffect(() => {
    if (!open) return
    setRows([])
    setTotalCount(0)
    setFileName('')
    setBillNo('')
    setFormError('')
  }, [open, action])

  function validatePurchaseHeaders(header: Record<string, string>): string | null {
    if (!header.品名 && !header.小类) return '表头缺少字段「品名」，请检查'
    if (!header.货号 && !header.商品) return '表头缺少字段「货号」，请检查'
    if (!header.条码) return '表头缺少字段「条码」，请检查'
    if (!header.尺码) return '表头缺少字段「尺码」，请检查'
    if (!header.颜色) return '表头缺少字段「颜色」，请检查'
    if (!header.吊牌价) return '表头缺少字段「吊牌价」，请检查'
    if (!header.出库数量 && !header.数量) return '表头缺少字段「数量」，请检查'
    if (!header.销售价 && !header.进货价) return '表头缺少字段「进货价」，请检查'
    return null
  }

  async function handleSelectFile(): Promise<void> {
    if (uploading) return
    setFormError('')
    setUploading(true)
    try {
      const uploaded = await posUploadFile()
      if (!uploaded) return

      if (!uploaded.data?.length) {
        setFormError('Excel 中没有可解析的数据，请检查文件内容')
        return
      }
      if (currentAction === 'batch-in') {
        const headerError = validatePurchaseHeaders(uploaded.data[0] ?? {})
        if (headerError) {
          setFormError(headerError)
          return
        }
      }

      const preview = await processBatchStock(currentAction, uploaded.data)
      if (preview.rows.length === 0) {
        setFormError('没有匹配到可处理的商品，请检查条码与数量')
        return
      }
      setRows(preview.rows)
      setTotalCount(preview.totalCount)
      setFileName(uploaded.filename ?? '')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '文件解析失败，请稍后重试')
    } finally {
      setUploading(false)
    }
  }

  function handleSubmit(): void {
    if (!action) return
    if (rows.length === 0) {
      setFormError('请先上传 Excel 文件')
      return
    }
    if (!billNo.trim()) {
      toast.error(meta.billLabel)
      setFormError(meta.billLabel)
      return
    }
    // 重复条码已在服务端预处理阶段合并数量，这里不再拦截

    commit.mutate(
      { action, rows, billNo: billNo.trim() },
      {
        onSuccess: (result) => {
          const verb = action === 'batch-in' ? '入库' : '退货'
          toast.success(
            `成功${verb} ${result.totalCount - result.errorCount} 个商品，失败 ${result.errorCount} 个商品`
          )
          onOpenChange(false)
        },
        onError: (error) => {
          setFormError(error instanceof Error ? error.message : '提交失败，请稍后重试')
        }
      }
    )
  }

  async function handleDownloadTemplate(): Promise<void> {
    if (downloading) return
    setDownloading(true)
    try {
      const filePath = await downloadBatchTemplate(currentAction)
      if (filePath) toast.success(`模板已保存到 ${filePath}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '下载模板失败')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <SheetDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={meta.title}
      description="按模板上传 Excel，确认后批量写入库存"
      width="2xl"
      headerActions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={downloading}
          onClick={() => void handleDownloadTemplate()}
        >
          {downloading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4" aria-hidden="true" />
          )}
          下载模板
        </Button>
      }
      footer={
        <>
          <Input
            className="mr-auto w-60 text-ui"
            placeholder={meta.billLabel}
            aria-label={meta.billLabel}
            value={billNo}
            onChange={(event) => setBillNo(event.target.value)}
          />
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={commit.isPending} onClick={handleSubmit}>
            {commit.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            {commit.isPending ? '提交中…' : meta.confirm}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => void handleSelectFile()}
          disabled={uploading}
          className={cn(
            'flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center transition-colors',
            uploading ? 'cursor-wait opacity-70' : 'hover:border-primary/60'
          )}
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : (
            <UploadCloud className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="text-ui font-medium">
            {uploading ? '正在解析 Excel…' : '点击选择 Excel 文件'}
          </span>
          <span className="text-meta text-muted-foreground">
            支持 .xlsx / .xls，表头需与下载的模板一致
          </span>
        </button>

        {fileName ? (
          <p className="flex items-center gap-1.5 text-meta text-muted-foreground">
            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
            当前文件：{fileName}
          </p>
        ) : null}

        {formError ? <p className="text-meta text-destructive">{formError}</p> : null}

        {rows.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-body font-semibold">
              上传的文件中记录（共 {rows.length} 条，商品 {totalCount} 个）
            </h3>
            <div className="overflow-hidden rounded-xl border border-border">
              {currentAction === 'batch-in' ? (
                <PurchasePreview rows={rows} />
              ) : (
                <ReturnsPreview rows={rows} />
              )}
            </div>
          </section>
        ) : null}
      </div>
    </SheetDrawer>
  )
}

/** 批量入库预览：中文表头 + 新款 / 补款 / 补货标记 */
function PurchasePreview({ rows }: { rows: BatchStockRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>品名</TableHead>
          <TableHead>货号</TableHead>
          <TableHead>品牌</TableHead>
          <TableHead>条码</TableHead>
          <TableHead>尺码</TableHead>
          <TableHead>颜色</TableHead>
          <TableHead className="text-right">吊牌价</TableHead>
          <TableHead className="text-right">数量</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => {
          const tag = TYPE_TAG[text(row.type)]
          return (
            <TableRow key={`${text(row.条码)}-${index}`}>
              <TableCell className="text-ui">{text(row.小类 || row.品名)}</TableCell>
              <TableCell className="text-ui">{text(row.商品 || row.货号)}</TableCell>
              <TableCell className="text-ui">{text(row.品牌)}</TableCell>
              <TableCell className="tnum text-ui">{text(row.条码)}</TableCell>
              <TableCell className="text-ui">{text(row.尺码)}</TableCell>
              <TableCell className="text-ui">{text(row.颜色)}</TableCell>
              <TableCell className="text-right tnum text-ui">{text(row.吊牌价)}</TableCell>
              <TableCell className="text-right tnum text-ui">
                <span>{text(row.出库数量 || row.数量)}</span>
                {tag ? (
                  <span className={cn('ml-1.5 rounded px-1 py-0.5 text-meta', tag.className)}>
                    {tag.text}
                  </span>
                ) : null}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

/** 批量退库预览：服务端返回库存 + 退货数量 */
function ReturnsPreview({ rows }: { rows: BatchStockRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>品名</TableHead>
          <TableHead>货号</TableHead>
          <TableHead>品牌</TableHead>
          <TableHead>条码</TableHead>
          <TableHead>尺码</TableHead>
          <TableHead>颜色</TableHead>
          <TableHead className="text-right">吊牌价</TableHead>
          <TableHead className="text-right">库存</TableHead>
          <TableHead className="text-right">退货数量</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={`${text(row.sku)}-${index}`}>
            <TableCell className="text-ui">{text(row.name)}</TableCell>
            <TableCell className="text-ui">{text(row.sn)}</TableCell>
            <TableCell className="text-ui">{text(row.brand)}</TableCell>
            <TableCell className="tnum text-ui">{text(row.sku)}</TableCell>
            <TableCell className="text-ui">{text(row.size)}</TableCell>
            <TableCell className="text-ui">{text(row.color)}</TableCell>
            <TableCell className="text-right tnum text-ui">{text(row.originalPrice)}</TableCell>
            <TableCell className="text-right tnum text-ui">{text(row.counts)}</TableCell>
            <TableCell className="text-right tnum text-ui">{text(row.returnCounts)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
