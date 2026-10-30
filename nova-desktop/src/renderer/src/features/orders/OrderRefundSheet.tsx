import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
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
import type { RefundLine } from './api'
import { OrderOperationInfo } from './OrderOperationInfo'
import { useOrderQuery, useRefundOrder } from './queries'

interface OrderRefundSheetProps {
  orderNo: string | null
  onClose: () => void
}

/** 退货：勾选商品、确认退回数量与退款金额，提交 /order/refundItem */
export function OrderRefundSheet({ orderNo, onClose }: OrderRefundSheetProps) {
  const { data: order, isLoading } = useOrderQuery(orderNo)
  const refundOrder = useRefundOrder()

  const [selected, setSelected] = useState<string[]>([])
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [refundAmount, setRefundAmount] = useState('')
  const [amountType, setAmountType] = useState<'money' | 'balance'>('money')

  useEffect(() => {
    setSelected([])
    setCounts({})
    setRefundAmount('')
    setAmountType('money')
  }, [orderNo])

  // 已退完的商品不再展示，避免对 counts 为 0 的行重复退货
  const items = useMemo(() => (order?.items ?? []).filter((item) => item.quantity > 0), [order])

  const selectedItems = useMemo(
    () => items.filter((item) => selected.includes(item.id)),
    [items, selected]
  )

  const selectedTotal = selectedItems.reduce(
    (sum, item) => sum + item.price * parseCount(counts[item.id], item.quantity),
    0
  )

  function toggle(id: string): void {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
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
      toast.error('请选择退货商品')
      return
    }
    const amount = Number(refundAmount)
    if (!refundAmount.trim() || !Number.isFinite(amount) || amount < 0) {
      toast.error('请输入正确的退货金额')
      return
    }

    try {
      await refundOrder.mutateAsync({
        orderNo: order.no,
        refundAmount: amount,
        amountType: order.balanceUsed > 0 ? amountType : 'money',
        lines
      })
      toast.success('退货成功')
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '退货失败')
    }
  }

  return (
    <SheetDrawer
      open={Boolean(orderNo)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="订单退货"
      description={order ? `订单号 ${order.no}` : undefined}
      width="2xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={refundOrder.isPending}>
            取消
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!order || refundOrder.isPending}
          >
            {refundOrder.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            {refundOrder.isPending ? '正在提交…' : '执行退货'}
          </Button>
        </>
      }
    >
      {isLoading ? (
        <p className="py-10 text-ui text-muted-foreground">正在加载订单…</p>
      ) : !order ? (
        <p className="py-10 text-ui text-muted-foreground">订单已不存在，无法退货</p>
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
            <h3 className="text-ui font-semibold">输入退货金额</h3>
            {order.balanceUsed > 0 ? (
              <RadioGroup
                value={amountType}
                onValueChange={(value) => setAmountType(value as 'money' | 'balance')}
                className="flex items-center gap-5"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="money" id="refund-money" />
                  <Label htmlFor="refund-money" className="text-ui">
                    退实付金额
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="balance" id="refund-balance" />
                  <Label htmlFor="refund-balance" className="text-ui">
                    退账户余额
                  </Label>
                </div>
              </RadioGroup>
            ) : null}
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="输入退货金额"
              aria-label="退货金额"
              className="h-9 text-right text-ui tnum"
              value={refundAmount}
              onChange={(event) => setRefundAmount(event.target.value)}
            />
            {selectedItems.length > 0 ? (
              <p className="text-meta text-muted-foreground">
                选中商品实付合计 {formatMoney(selectedTotal)}，可按实际情况调整退款金额
              </p>
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
