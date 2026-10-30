import { useEffect, useMemo, useState } from 'react'
import { Loader2, ScanLine, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@renderer/components/ui/radio-group'
import { TableCell, TableRow } from '@renderer/components/ui/table'
import { DetailEmptyRow, DetailTable, DETAIL_CELL } from '@renderer/components/common/DetailTable'
import { SheetDrawer } from '@renderer/components/common/SheetDrawer'
import { formatMoney } from '@renderer/lib/format'
import { fetchExchangeProduct, type ExchangeProduct, type RefundLine } from './api'
import { OrderOperationInfo } from './OrderOperationInfo'
import { useExchangeOrder, useOrderQuery } from './queries'

/** 与老系统 DEFAULT_DISCOUNT 一致：换货商品按 6 折展示销售价 */
const EXCHANGE_DISCOUNT = 0.6

type AmountType = 'add' | 'sub' | 'none'

interface OrderExchangeSheetProps {
  orderNo: string | null
  onClose: () => void
}

/** 换货：选择退回商品 + 扫码换出商品 + 价差处理，提交 /order/changeItem */
export function OrderExchangeSheet({ orderNo, onClose }: OrderExchangeSheetProps) {
  const { data: order, isLoading } = useOrderQuery(orderNo)
  const exchangeOrder = useExchangeOrder()

  const [selected, setSelected] = useState<string[]>([])
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [exchangeItems, setExchangeItems] = useState<ExchangeProduct[]>([])
  const [scanSku, setScanSku] = useState('')
  const [lookingUp, setLookingUp] = useState(false)
  const [exchangeAmount, setExchangeAmount] = useState('')
  const [amountType, setAmountType] = useState<AmountType | ''>('')
  const [refundBalance, setRefundBalance] = useState(false)

  useEffect(() => {
    setSelected([])
    setCounts({})
    setExchangeItems([])
    setScanSku('')
    setExchangeAmount('')
    setAmountType('')
    setRefundBalance(false)
  }, [orderNo])

  // 已退完的商品不再展示，避免对 counts 为 0 的行重复退货
  const items = useMemo(() => (order?.items ?? []).filter((item) => item.quantity > 0), [order])

  const selectedItems = useMemo(
    () => items.filter((item) => selected.includes(item.id)),
    [items, selected]
  )

  function toggle(id: string): void {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  async function addExchangeItem(raw: string): Promise<void> {
    const sku = raw.trim()
    if (!sku || lookingUp) return

    setLookingUp(true)
    try {
      const product = await fetchExchangeProduct(sku)
      setExchangeItems((prev) => {
        const exists = prev.find((item) => item.sku === product.sku)
        if (!exists) return [...prev, { ...product, counts: 1 }]
        return prev.map((item) =>
          item.sku === product.sku ? { ...item, counts: item.counts + 1 } : item
        )
      })
      setScanSku('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '查询商品失败')
    } finally {
      setLookingUp(false)
    }
  }

  function buildLines(): RefundLine[] | null {
    const lines: RefundLine[] = []
    for (const item of selectedItems) {
      const count = parseCount(counts[item.id], item.quantity)
      if (!Number.isInteger(count) || count <= 0 || count > item.quantity) {
        toast.error(`${item.name} 的退回数量需在 1~${item.quantity} 之间`)
        return null
      }
      lines.push({ item, counts: count })
    }
    return lines
  }

  async function handleSubmit(): Promise<void> {
    if (!order) return
    const lines = buildLines()
    if (!lines) return
    if (lines.length === 0) {
      toast.error('请选择需要退回的商品')
      return
    }
    if (exchangeItems.length === 0) {
      toast.error('请选择需要换货的商品')
      return
    }
    if (!amountType) {
      toast.error('请选择价差类型')
      return
    }

    const amount = amountType === 'none' ? 0 : Number(exchangeAmount)
    if (amountType !== 'none' && (!exchangeAmount.trim() || !Number.isFinite(amount) || amount < 0)) {
      toast.error('请输入正确的换货价差金额')
      return
    }

    try {
      await exchangeOrder.mutateAsync({
        orderNo: order.no,
        lines,
        exchangeItems,
        exchangeAmount: amount,
        amountType,
        refundBalance: amountType === 'sub' ? refundBalance : false
      })
      toast.success('换货成功')
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '换货失败')
    }
  }

  return (
    <SheetDrawer
      open={Boolean(orderNo)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="订单换货"
      description={order ? `订单号 ${order.no}` : undefined}
      width="2xl"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={exchangeOrder.isPending}
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!order || exchangeOrder.isPending}
          >
            {exchangeOrder.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            {exchangeOrder.isPending ? '正在提交…' : '执行换货'}
          </Button>
        </>
      }
    >
      {isLoading ? (
        <p className="py-10 text-ui text-muted-foreground">正在加载订单…</p>
      ) : !order ? (
        <p className="py-10 text-ui text-muted-foreground">订单已不存在，无法换货</p>
      ) : (
        <div className="space-y-5">
          <OrderOperationInfo order={order} />

          <section className="space-y-2">
            <h3 className="text-ui font-semibold">选择退货商品</h3>
            <DetailTable
              columns={[
                { label: '', width: 'w-10' },
                '商品',
                '条码',
                { label: '实付单价', align: 'right' },
                { label: '售出数量', align: 'right' }
              ]}
            >
              {items.length === 0 ? (
                <DetailEmptyRow colSpan={5}>暂无可退商品</DetailEmptyRow>
              ) : (
                items.map((item) => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer border-border/60 hover:bg-surface"
                    onClick={() => toggle(item.id)}
                  >
                    <TableCell className={DETAIL_CELL}>
                      <Checkbox
                        checked={selected.includes(item.id)}
                        aria-label={`选择 ${item.name}`}
                        onCheckedChange={() => toggle(item.id)}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </TableCell>
                    <TableCell className={DETAIL_CELL}>
                      <div>{item.name}</div>
                      <div className="text-meta text-muted-foreground">
                        {item.styleNo} / {item.color} / {item.size}
                      </div>
                    </TableCell>
                    <TableCell className={DETAIL_CELL}>{item.sku}</TableCell>
                    <TableCell className={`${DETAIL_CELL} text-right`}>
                      {formatMoney(item.price)}
                    </TableCell>
                    <TableCell className={`${DETAIL_CELL} text-right`}>{item.quantity}</TableCell>
                  </TableRow>
                ))
              )}
            </DetailTable>
          </section>

          {selectedItems.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-ui font-semibold">确认退回数量</h3>
              <DetailTable
                columns={[
                  '条码',
                  { label: '原售出数量', align: 'right' },
                  { label: '需退回数量', align: 'right', width: 'w-32' }
                ]}
              >
                {selectedItems.map((item) => (
                  <TableRow key={item.id} className="border-border/60 hover:bg-surface">
                    <TableCell className={DETAIL_CELL}>
                      {item.sku}
                      <span className="ml-1 text-meta text-muted-foreground">
                        [{item.color} / {item.size}]
                      </span>
                    </TableCell>
                    <TableCell className={`${DETAIL_CELL} text-right`}>{item.quantity}</TableCell>
                    <TableCell className={`${DETAIL_CELL} text-right`}>
                      <Input
                        type="number"
                        min={1}
                        max={item.quantity}
                        className="ml-auto h-8 w-24 text-right text-ui tnum"
                        aria-label={`${item.name} 退回数量`}
                        value={counts[item.id] ?? String(item.quantity)}
                        onChange={(event) =>
                          setCounts((prev) => ({ ...prev, [item.id]: event.target.value }))
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </DetailTable>
            </section>
          ) : null}

          <section className="space-y-3 rounded-xl border border-border p-4">
            <h3 className="text-ui font-semibold">查询换货商品</h3>
            <div className="relative">
              <ScanLine
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
                aria-hidden="true"
              />
              <Input
                className="h-9 pl-9 text-ui tnum"
                placeholder="扫描或输入条码，满 13 位自动查询"
                aria-label="换货商品条码"
                value={scanSku}
                onChange={(event) => {
                  const next = event.target.value
                  setScanSku(next)
                  if (next.trim().length === 13) void addExchangeItem(next)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void addExchangeItem(scanSku)
                  }
                }}
              />
              {lookingUp ? (
                <Loader2
                  className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-subtle"
                  aria-hidden="true"
                />
              ) : null}
            </div>

            {exchangeItems.length > 0 ? (
              <DetailTable
                columns={[
                  '条码',
                  { label: '吊牌价', align: 'right' },
                  { label: '销售价', align: 'right' },
                  { label: '折扣', align: 'right' },
                  { label: '数量', align: 'right' },
                  { label: '操作', align: 'right', width: 'w-16' }
                ]}
              >
                {exchangeItems.map((item) => (
                  <TableRow key={item.sku} className="border-border/60 hover:bg-surface">
                    <TableCell className={DETAIL_CELL}>
                      {item.sku}
                      <span className="ml-1 text-meta text-muted-foreground">
                        [{item.color} / {item.size}]
                      </span>
                    </TableCell>
                    <TableCell className={`${DETAIL_CELL} text-right`}>
                      {formatMoney(item.originalPrice)}
                    </TableCell>
                    <TableCell className={`${DETAIL_CELL} text-right`}>
                      {formatMoney(item.originalPrice * EXCHANGE_DISCOUNT)}
                    </TableCell>
                    <TableCell className={`${DETAIL_CELL} text-right`}>6.0 折</TableCell>
                    <TableCell className={`${DETAIL_CELL} text-right`}>{item.counts}</TableCell>
                    <TableCell className={`${DETAIL_CELL} text-right`}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`移除 ${item.sku}`}
                        onClick={() =>
                          setExchangeItems((prev) => prev.filter((row) => row.sku !== item.sku))
                        }
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </DetailTable>
            ) : (
              <p className="text-meta text-muted-foreground">尚未添加换货商品</p>
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-border p-4">
            <h3 className="text-ui font-semibold">输入换货价差金额</h3>
            <RadioGroup
              value={amountType}
              onValueChange={(value) => setAmountType(value as AmountType)}
              className="flex flex-wrap items-center gap-5"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="add" id="exchange-add" />
                <Label htmlFor="exchange-add" className="text-ui">
                  需顾客补差价
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="sub" id="exchange-sub" />
                <Label htmlFor="exchange-sub" className="text-ui">
                  退差价给顾客
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="none" id="exchange-none" />
                <Label htmlFor="exchange-none" className="text-ui">
                  无价差
                </Label>
              </div>
            </RadioGroup>

            {amountType !== 'none' ? (
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="输入换货价差金额"
                aria-label="换货价差金额"
                className="h-9 text-right text-ui tnum"
                value={exchangeAmount}
                onChange={(event) => setExchangeAmount(event.target.value)}
              />
            ) : null}

            {order.balanceUsed > 0 && amountType === 'sub' ? (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="exchange-refund-balance"
                  checked={refundBalance}
                  onCheckedChange={(checked) => setRefundBalance(checked === true)}
                />
                <Label htmlFor="exchange-refund-balance" className="text-ui">
                  因用户使用了余额支付，确认将差价退回余额
                </Label>
              </div>
            ) : null}
          </section>
        </div>
      )}
    </SheetDrawer>
  )
}

function parseCount(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback
  return Number(value)
}
