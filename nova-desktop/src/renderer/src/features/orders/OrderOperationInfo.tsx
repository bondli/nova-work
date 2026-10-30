import type { Order } from '@shared/types/order'
import { formatMoney } from '@renderer/lib/format'
import { PAYMENT_LABEL } from '@renderer/lib/payment'

/** 订单信息：字段与老系统退货 / 换货抽屉一致，展示样式对齐订单详情抽屉 */
export function OrderOperationInfo({ order }: { order: Order }) {
  const rows: Array<[string, string]> = [
    ['订单号', order.no],
    ['订单时间', order.paidAt],
    ['吊牌价', formatMoney(order.goodsAmount)],
    ['应付金额', formatMoney(order.payable)],
    ['实付金额', formatMoney(order.amount)],
    ['支付方式', PAYMENT_LABEL[order.payment]],
    ['商品数量', String(order.itemCount)],
    ['会员', order.memberPhone || '—'],
    ['导购员', order.clerk || '—'],
    ['使用优惠券', order.coupon > 0 ? formatMoney(order.coupon) : '—'],
    ['使用积分', order.usePoint > 0 ? String(order.usePoint) : '—'],
    ['使用余额', order.balanceUsed > 0 ? formatMoney(order.balanceUsed) : '—'],
    ['备注', order.remark || '—']
  ]

  return (
    <section className="space-y-3">
      <h3 className="text-ui font-semibold">订单信息</h3>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border text-ui">
        {rows.map(([label, value]) => (
          <div key={label} className="flex bg-card">
            <dt className="w-[92px] shrink-0 bg-surface px-3 py-2 text-meta text-muted-foreground">
              {label}
            </dt>
            <dd className="min-w-0 flex-1 truncate px-3 py-2">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
