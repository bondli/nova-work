import type { ReactNode } from 'react'
import { Package, Printer, ReceiptText, TicketPercent } from 'lucide-react'
import type { Order, OrderItem, OrderItemStatus } from '@shared/types/order'
import { TableCell, TableRow } from '@renderer/components/ui/table'
import { Button } from '@renderer/components/ui/button'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { DetailTable, DETAIL_CELL } from '@renderer/components/common/DetailTable'
import { EmptyState } from '@renderer/components/common/EmptyState'
import { CopyableText } from '@renderer/components/common/CopyText'
import { Money } from '@renderer/components/common/Money'
import { SheetDrawer } from '@renderer/components/common/SheetDrawer'
import { StatusBadge } from '@renderer/components/common/StatusBadge'
import { useOrderQuery } from './queries'
import { PAYMENT_LABEL } from './labels'

interface OrderDetailSheetProps {
  /** 为 null 时抽屉关闭 */
  orderNo: string | null
  onClose: () => void
  onPrint?: (order: Order) => void
  onRefund?: (order: Order) => void
  onExchange?: (order: Order) => void
}

/** 商品行状态文案与语义色，对齐老系统「正常 / 有退货 / 换货追进」 */
const ITEM_STATUS: Record<OrderItemStatus, { label: string; tone: 'success' | 'danger' | 'warning' }> = {
  normal: { label: '正常', tone: 'success' },
  refund: { label: '有退货', tone: 'danger' },
  exchangein: { label: '换货追进', tone: 'warning' }
}

function itemQuantity(item: OrderItem): string {
  if (item.itemStatus === 'refund' && item.quantity <= 0) return '已退货'
  return String(item.quantity)
}

/**
 * 订单详情抽屉，结构与老系统 Order/Detail 一致：
 * 订单信息 12 项 + 订单商品表 + 订单优惠券表。
 */
export function OrderDetailSheet({
  orderNo,
  onClose,
  onPrint,
  onRefund,
  onExchange
}: OrderDetailSheetProps) {
  const { data: order, isLoading } = useOrderQuery(orderNo)
  const open = Boolean(orderNo)
  const coupons = order?.coupons ?? []

  const info: Array<{ label: string; value: ReactNode; wrap?: boolean }> = order
    ? [
        { label: '订单号', value: order.no },
        { label: '订单时间', value: order.paidAt },
        { label: '吊牌价', value: order.goodsAmount.toFixed(2) },
        { label: '应付金额', value: order.payable.toFixed(2) },
        { label: '实付金额', value: order.amount.toFixed(2) },
        { label: '支付方式', value: PAYMENT_LABEL[order.payment] },
        { label: '商品数量', value: String(order.itemCount) },
        {
          label: '会员',
          value: order.memberPhone ? (
            <CopyableText text={order.memberPhone} label="会员手机号" />
          ) : (
            '—'
          )
        },
        { label: '导购员', value: order.clerk || '—' },
        { label: '使用积分', value: order.usePoint ? String(order.usePoint) : '—' },
        { label: '使用余额', value: order.balanceUsed ? order.balanceUsed.toFixed(2) : '—' },
        // 备注可能较长，单独占满一行并换行展示完整内容
        { label: '备注', value: order.remark || '—', wrap: true }
      ]
    : []

  return (
    <SheetDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      width="xl"
      title="订单详情"
      description={order ? order.no : undefined}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!order}
            onClick={() => order && onRefund?.(order)}
          >
            退货
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!order}
            onClick={() => order && onExchange?.(order)}
          >
            换货
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!order}
            onClick={() => order && onPrint?.(order)}
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            打印小票
          </Button>
        </>
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : !order ? (
        <EmptyState
          icon={ReceiptText}
          title="未找到订单"
          description="请返回列表刷新后重试"
          className="min-h-64"
        />
      ) : (
        <>
          <SectionTitle>订单信息</SectionTitle>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border text-ui">
            {info.map((item) => (
              <div
                key={item.label}
                className={item.wrap ? 'col-span-2 flex bg-card' : 'flex bg-card'}
              >
                <dt
                  className={
                    item.wrap
                      ? 'w-[92px] shrink-0 bg-surface px-3 py-2 text-meta text-muted-foreground'
                      : 'w-[92px] shrink-0 bg-surface px-3 py-2 text-meta text-muted-foreground'
                  }
                >
                  {item.label}
                </dt>
                <dd
                  className={
                    item.wrap
                      ? 'min-w-0 flex-1 whitespace-pre-wrap break-words px-3 py-2'
                      : 'min-w-0 flex-1 truncate px-3 py-2'
                  }
                >
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>

          <SectionTitle>订单商品</SectionTitle>
          {order.items.length === 0 ? (
            <EmptyState
              icon={Package}
              title="暂无商品"
              description={order.isRecharge ? '会员充值订单没有商品明细' : '本单无商品明细'}
              className="min-h-40 rounded-xl border border-border bg-card"
            />
          ) : (
            <DetailTable columns={['款号', '条码', '吊牌价', '实付金额', '折扣', '数量', '状态']}>
              {order.items.map((item) => (
                <TableRow key={item.id} className="border-border/60 hover:bg-surface">
                  <TableCell className={DETAIL_CELL}>
                    <CopyableText text={item.styleNo} textClassName="font-medium" label="款号" />
                    <p className="text-meta text-muted-foreground">{item.name}</p>
                  </TableCell>
                  <TableCell className={DETAIL_CELL}>
                    <CopyableText text={item.sku} textClassName="text-ui tnum" label="条码" />
                    <p className="text-meta text-muted-foreground">
                      [{item.color} / {item.size}]
                    </p>
                  </TableCell>
                  <TableCell className={DETAIL_CELL}>
                    <Money value={item.originalPrice} />
                  </TableCell>
                  <TableCell className={DETAIL_CELL}>
                    <Money value={item.price} bold />
                  </TableCell>
                  <TableCell className={DETAIL_CELL}>{item.discount}</TableCell>
                  <TableCell className={DETAIL_CELL}>{itemQuantity(item)}</TableCell>
                  <TableCell className={DETAIL_CELL}>
                    <StatusBadge status={ITEM_STATUS[item.itemStatus].tone}>
                      {ITEM_STATUS[item.itemStatus].label}
                    </StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </DetailTable>
          )}

          <SectionTitle>订单优惠券</SectionTitle>
          {coupons.length === 0 ? (
            <EmptyState
              icon={TicketPercent}
              title="暂无优惠券"
              description="本单未使用优惠券"
              className="min-h-40 rounded-xl border border-border bg-card"
            />
          ) : (
            <DetailTable columns={['优惠券ID', '优惠券描述', '优惠券类型', '使用金额', '使用时间']}>
              {coupons.map((coupon) => (
                <TableRow key={coupon.id} className="border-border/60 hover:bg-surface">
                  <TableCell className={DETAIL_CELL}>{coupon.couponId}</TableCell>
                  <TableCell className={DETAIL_CELL}>{coupon.couponDesc || '—'}</TableCell>
                  <TableCell className={DETAIL_CELL}>
                    {coupon.couponType === 'member' ? '会员优惠券' : '店铺优惠券'}
                  </TableCell>
                  <TableCell className={DETAIL_CELL}>
                    <Money value={coupon.usedValue} />
                  </TableCell>
                  <TableCell className={`${DETAIL_CELL} text-muted-foreground`}>
                    {coupon.usedTime || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </DetailTable>
          )}
        </>
      )}
    </SheetDrawer>
  )
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className="mb-2 mt-4 text-ui font-semibold first:mt-0">{children}</h3>
}
