import { useState } from 'react'
import {
  ClipboardCheck,
  Coins,
  CreditCard,
  Package,
  PackageSearch,
  ReceiptText,
  Wallet
} from 'lucide-react'
import type { Order, OrderFilters, PaymentMethod } from '@shared/types/order'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { DataTable } from '@renderer/components/common/DataTable'
import { DateRangePicker, type DateRangeValue } from '@renderer/components/common/DateRangePicker'
import { FilterBar, FilterField } from '@renderer/components/common/FilterBar'
import { PaginationBar } from '@renderer/components/common/PaginationBar'
import { StatCard } from '@renderer/components/common/StatCard'
import { buildDelta } from '@renderer/lib/delta'
import { formatDate, formatMoney, createRecentRange } from '@renderer/lib/format'
import { createOrderColumns } from '@renderer/features/orders/order-columns'
import { OrderDetailSheet } from '@renderer/features/orders/OrderDetailSheet'
import { OrderEditorDialog } from '@renderer/features/orders/OrderEditorDialog'
import { OrderGoodsSheet } from '@renderer/features/orders/OrderGoodsSheet'
import { OrderPrintSheet } from '@renderer/features/orders/OrderPrintSheet'
import { OrderRefundSheet } from '@renderer/features/orders/OrderRefundSheet'
import { OrderExchangeSheet } from '@renderer/features/orders/OrderExchangeSheet'
import { ReconcileSheet } from '@renderer/features/orders/ReconcileSheet'
import { PAYMENT_LABEL } from '@renderer/features/orders/labels'
import { useClerksQuery, useOrdersQuery } from '@renderer/features/orders/queries'

const PAGE_SIZE = 20

/** 默认筛选条件：当天、全部导购、全部支付方式 */
function createDefaultFilters(range: DateRangeValue): OrderFilters {
  return {
    orderSn: '',
    memberPhone: '',
    start: formatDate(range.start),
    end: formatDate(range.end),
    clerk: '',
    payment: 'all',
    page: 1,
    pageSize: PAGE_SIZE
  }
}

/** 11 位纯数字视为会员手机号，否则按订单号查询 */
function isPhoneLike(value: string): boolean {
  return /^1\d{10}$/.test(value)
}

/**
 * 订单中心：指标卡 + 筛选条 + 订单表格 + 分页。
 * 详情 / 修改 / 对账 / 订单商品四个抽屉由页面统一管理状态；
 * 查询条件与列文案对齐老系统 Order 页面。
 */
export function OrdersPage() {
  const [initialRange] = useState(() => createRecentRange(1))
  const [range, setRange] = useState<DateRangeValue>(initialRange)
  const [keyword, setKeyword] = useState('')
  const [clerk, setClerk] = useState('all')
  const [payment, setPayment] = useState<PaymentMethod | 'all'>('all')
  const [filters, setFilters] = useState<OrderFilters>(() => createDefaultFilters(initialRange))

  const [detailNo, setDetailNo] = useState<string | null>(null)
  const [printNo, setPrintNo] = useState<string | null>(null)
  const [refundNo, setRefundNo] = useState<string | null>(null)
  const [exchangeNo, setExchangeNo] = useState<string | null>(null)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [goodsOpen, setGoodsOpen] = useState(false)

  const { data, isLoading, error } = useOrdersQuery(filters)
  const { data: clerks = [] } = useClerksQuery()
  const summary = data?.summary
  const previous = data?.previous

  /** 打开操作抽屉前先关闭详情，避免两个抽屉叠在一起 */
  function openOperation(order: Order, setter: (no: string) => void): void {
    setDetailNo(null)
    setter(order.no)
  }

  const columns = createOrderColumns({
    onView: (order) => setDetailNo(order.no),
    onEdit: (order) => setEditingOrder(order),
    onPrint: (order) => openOperation(order, setPrintNo),
    onRefund: (order) => openOperation(order, setRefundNo),
    onExchange: (order) => openOperation(order, setExchangeNo)
  })

  /** 条件改动立即查询，交互对齐会员页面，无需再点「查询」 */
  function applyFilters(patch: Partial<OrderFilters>): void {
    setFilters((current) => ({ ...current, ...patch, page: 1 }))
  }

  /** 把筛选条草稿写入查询条件，并回到第一页 */
  function handleSubmit() {
    const value = keyword.trim()
    const phoneLike = isPhoneLike(value)
    setFilters({
      orderSn: phoneLike ? '' : value,
      memberPhone: phoneLike ? value : '',
      start: formatDate(range.start),
      end: formatDate(range.end),
      clerk: clerk === 'all' ? '' : clerk,
      payment,
      page: 1,
      pageSize: PAGE_SIZE
    })
  }

  /** 重置筛选条与查询条件 */
  function handleReset() {
    setKeyword('')
    setRange(initialRange)
    setClerk('all')
    setPayment('all')
    setFilters(createDefaultFilters(initialRange))
  }

  function handlePageChange(page: number) {
    setFilters((current) => ({ ...current, page }))
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4">
      <div className="grid grid-cols-5 gap-3">
        <StatCard
          label="订单数"
          value={(summary?.orderCount ?? 0).toLocaleString('zh-CN')}
          icon={ReceiptText}
          delta={buildDelta(summary?.orderCount ?? 0, previous?.orderCount ?? 0)}
        />
        <StatCard
          label="商品数"
          value={(summary?.itemCount ?? 0).toLocaleString('zh-CN')}
          icon={Package}
          delta={buildDelta(summary?.itemCount ?? 0, previous?.itemCount ?? 0)}
        />
        <StatCard
          label="订单金额"
          value={formatMoney(summary?.amount ?? 0)}
          icon={Wallet}
          delta={buildDelta(summary?.amount ?? 0, previous?.amount ?? 0)}
        />
        <StatCard
          label="余额消耗"
          value={formatMoney(summary?.balanceUsed ?? 0)}
          icon={Coins}
          delta={buildDelta(summary?.balanceUsed ?? 0, previous?.balanceUsed ?? 0)}
        />
        <StatCard
          label="充值金额"
          value={formatMoney(summary?.recharge ?? 0)}
          icon={CreditCard}
          delta={buildDelta(summary?.recharge ?? 0, previous?.recharge ?? 0)}
        />
      </div>

      <FilterBar
        onSubmit={handleSubmit}
        onReset={handleReset}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReconcileOpen(true)}
            >
              <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
              对账
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setGoodsOpen(true)}
            >
              <PackageSearch className="h-3.5 w-3.5" aria-hidden="true" />
              订单商品
            </Button>
          </>
        }
      >
        <FilterField label="创建时间">
          <DateRangePicker
            value={range}
            onChange={(next) => {
              setRange(next)
              applyFilters({ start: formatDate(next.start), end: formatDate(next.end) })
            }}
          />
        </FilterField>
        <FilterField label="订单号 / 会员手机">
          <Input
            className="h-8 w-[180px]"
            aria-label="订单号或会员手机号"
            value={keyword}
            onChange={(event) => {
              const value = event.target.value
              setKeyword(value)
              const phoneLike = isPhoneLike(value.trim())
              applyFilters({
                orderSn: phoneLike ? '' : value.trim(),
                memberPhone: phoneLike ? value.trim() : ''
              })
            }}
          />
        </FilterField>
        <FilterField label="支付方式">
          <Select
            value={payment}
            onValueChange={(value) => {
              const next = value as PaymentMethod | 'all'
              setPayment(next)
              applyFilters({ payment: next })
            }}
          >
            <SelectTrigger size="sm" className="h-8 w-[110px] text-xs" aria-label="支付方式">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              {Object.entries(PAYMENT_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="导购员">
          <Select
            value={clerk}
            onValueChange={(value) => {
              setClerk(value)
              applyFilters({ clerk: value === 'all' ? '' : value })
            }}
          >
            <SelectTrigger size="sm" className="h-8 w-[110px] text-xs" aria-label="导购员">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部导购</SelectItem>
              {clerks.map((item) => (
                <SelectItem key={item.id} value={String(item.id)}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
      </FilterBar>

      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        rowKey="no"
        isLoading={isLoading}
        error={error ? (error as Error).message : undefined}
        empty={{
          icon: ReceiptText,
          title: '暂无订单',
          description: '调整日期区间或清空筛选条件后再试'
        }}
        footer={
          <div className="p-3">
            <PaginationBar
              total={data?.total ?? 0}
              page={filters.page}
              pageSize={filters.pageSize}
              onPageChange={handlePageChange}
            />
          </div>
        }
      />

      <OrderDetailSheet
        orderNo={detailNo}
        onClose={() => setDetailNo(null)}
        onPrint={(order) => openOperation(order, setPrintNo)}
        onRefund={(order) => openOperation(order, setRefundNo)}
        onExchange={(order) => openOperation(order, setExchangeNo)}
      />
      <OrderPrintSheet orderNo={printNo} onClose={() => setPrintNo(null)} />
      <OrderRefundSheet orderNo={refundNo} onClose={() => setRefundNo(null)} />
      <OrderExchangeSheet orderNo={exchangeNo} onClose={() => setExchangeNo(null)} />
      <OrderEditorDialog order={editingOrder} onClose={() => setEditingOrder(null)} />
      <ReconcileSheet
        open={reconcileOpen}
        onOpenChange={setReconcileOpen}
        filters={{ ...filters, page: 1, pageSize: 1000 }}
      />
      <OrderGoodsSheet open={goodsOpen} onOpenChange={setGoodsOpen} />
    </div>
  )
}