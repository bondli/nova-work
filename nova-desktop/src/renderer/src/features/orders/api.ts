import type {
  Order,
  OrderCouponRow,
  OrderFilters,
  OrderGoodsRow,
  OrderItem,
  OrderItemStatus,
  OrderListResult,
  OrderModifyInput,
  OrderStatus,
  OrderSummary,
  PaymentMethod,
  ReconcileRow
} from '@shared/types/order'
import { posGet, posPost } from '@renderer/lib/pos'
import { getOrderShowStatus } from '@renderer/stores/order-show-status-store'

/**
 * 订单域数据访问层（D6 已接入 nova-pos-server）。
 * 服务端字段与桌面端视图模型集中在本文件内转换，页面只依赖共享类型。
 */

/** 服务端金额字段（DECIMAL 会以字符串返回）统一转成数字 */
type Numeric = string | number | null

/** 服务端订单行 */
interface ServerOrder {
  id: number
  orderSn: string
  orderStatus: string
  orderItems: number | null
  originalAmount: Numeric
  orderAmount: Numeric
  orderActualAmount: Numeric
  payType: string | null
  userPhone: string | null
  usePoint: Numeric
  useBalance: Numeric
  useCoupon: Numeric
  salerId: number | null
  salerName: string | null
  remark: string | null
  printStatus: string | null
  showStatus: string | null
  orderType: string | null
  createdAt: string
  updatedAt: string
}

/** 服务端订单商品行 */
interface ServerOrderItem {
  id: number
  sn: string
  sku: string
  name: string
  color: string
  size: string
  originalPrice: Numeric
  actualPrice: Numeric
  discount: Numeric
  counts: number
  orderSn: string
  status: string
}

/** 服务端订单优惠券行 */
interface ServerOrderCoupon {
  id: number
  orderSn: string
  couponId: number
  couponDesc: string | null
  couponType: string
  usedValue: Numeric
  usedTime: string | null
}

interface ServerList<T> {
  count: number
  data: T[]
}

/** 订单统计接口返回结构 */
interface ServerOrderSummary {
  orderCount: number
  orderActualAmount: Numeric
  balanceAmount: Numeric
  incomeAmount: Numeric
  itemCount: number
}

const PAYMENT_BY_SERVER: Record<string, PaymentMethod> = {
  weixin: 'wechat',
  wechat: 'wechat',
  alipay: 'alipay',
  cash: 'cash',
  card: 'card',
  other: 'other'
}

const PAYMENT_TO_SERVER: Record<PaymentMethod, string> = {
  wechat: 'weixin',
  alipay: 'alipay',
  cash: 'cash',
  card: 'card',
  other: 'other'
}

/** 服务端时间形如 2026-10-26 16:19:02，统一裁到分钟 */
function formatDateTime(value: string | null | undefined): string {
  if (!value) return ''
  const text = String(value)
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(text)) return text.slice(0, 16)
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  const pad = (input: number): string => String(input).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`
}

/** 老系统详情展示到秒 */
function formatDateTimeFull(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return String(value)
  const pad = (input: number): string => String(input).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** DECIMAL 在 mysql2 中以字符串返回，统一转数字避免后续 toFixed 报错 */
function num(value: Numeric | undefined): number {
  const result = Number(value ?? 0)
  return Number.isFinite(result) ? result : 0
}

/** 订单状态：商品全部退款视为已退款，存在换货记录视为换货中 */
function resolveStatus(items: ServerOrderItem[]): OrderStatus {
  if (items.length > 0 && items.every((item) => item.status === 'refund')) return 'refunded'
  if (items.some((item) => item.status === 'exchangein')) return 'exchanging'
  return 'completed'
}

/** 服务端订单转桌面端视图模型；items 缺省用于列表场景 */
function toOrder(order: ServerOrder, items: ServerOrderItem[] = []): Order {
  const originalAmount = num(order.originalAmount)

  return {
    id: order.id,
    no: order.orderSn,
    paidAt: formatDateTime(order.createdAt),
    items: items.map(toOrderItem),
    itemCount: order.orderItems ?? 0,
    goodsAmount: originalAmount,
    payable: num(order.orderAmount),
    discount: round2(Math.max(0, originalAmount - num(order.orderAmount))),
    coupon: num(order.useCoupon),
    usePoint: num(order.usePoint),
    balanceUsed: num(order.useBalance),
    amount: num(order.orderActualAmount),
    payment: PAYMENT_BY_SERVER[order.payType ?? 'other'] ?? 'other',
    clerk: order.salerName || '—',
    /** 服务端落库的 salerName 即用户表 name 字段，小票打印用它 */
    clerkAccount: order.salerName || '',
    clerkId: order.salerId ?? null,
    status: resolveStatus(items),
    checked: order.orderStatus === 'checked',
    printed: order.printStatus === 'printed',
    remark: order.remark ?? '',
    memberPhone: order.userPhone || undefined,
    isRecharge: order.orderType === 'income'
  }
}

const ITEM_STATUS: Record<string, OrderItemStatus> = {
  refund: 'refund',
  exchangein: 'exchangein'
}

function toOrderItem(item: ServerOrderItem): OrderItem {
  return {
    id: String(item.id),
    name: item.name,
    styleNo: item.sn,
    sku: item.sku,
    color: item.color,
    size: item.size,
    originalPrice: num(item.originalPrice),
    price: num(item.actualPrice) || num(item.originalPrice),
    discount: num(item.discount) || 100,
    quantity: item.counts,
    itemStatus: ITEM_STATUS[item.status] ?? 'normal'
  }
}

function toOrderCoupon(item: ServerOrderCoupon): OrderCouponRow {
  return {
    id: String(item.id),
    couponId: item.couponId,
    couponDesc: item.couponDesc ?? '',
    couponType: item.couponType === 'member' ? 'member' : 'store',
    usedValue: num(item.usedValue),
    usedTime: formatDateTimeFull(item.usedTime)
  }
}

/** /user/list 返回的用户字段（只取导购下拉需要的） */
interface ServerUser {
  id: number
  name: string
  realName?: string | null
  status?: string
  role?: string
}

export interface Clerk {
  id: number
  /** 登录用户名，真实姓名缺失时兜底展示 */
  username: string
  /** 界面展示与下单使用：真实姓名优先 */
  name: string
}

let clerkCache: Clerk[] | null = null

/**
 * 导购列表：仅保留在职（status 非 disabled）且非管理员的账号，
 * 展示名优先取真实姓名，未设置时回退用户名。
 * 该接口仅管理员可读，导购员调用会失败，调用方需自行降级。
 */
export async function fetchClerks(): Promise<Clerk[]> {
  if (clerkCache) return clerkCache
  const result = await posGet<ServerList<ServerUser>>('/user/list')
  clerkCache = (result.data ?? [])
    .filter((user) => user.role !== 'admin' && user.status !== 'disabled')
    .map((user) => ({
      id: user.id,
      username: user.name,
      name: user.realName?.trim() || user.name
    }))
  return clerkCache
}

/** 导购 ID → 真实姓名；导购员无权限读员工表时返回空映射 */
async function loadClerkNames(): Promise<Map<number, string>> {
  try {
    const clerks = await fetchClerks()
    return new Map(clerks.map((clerk) => [clerk.id, clerk.name]))
  } catch {
    return new Map()
  }
}

/**
 * 把桌面端筛选条件转成服务端查询参数。
 * includeShowStatus 为 true 时按「订单隐藏开关」过滤：仅隐藏时传 hidden（服务端只返回 normal）。
 * 对账等需要看到隐藏订单的场景不传该参数。
 */
async function toQuery(
  filters: OrderFilters,
  includeShowStatus = false,
  includeIncome = false
): Promise<Record<string, string | number>> {
  const query: Record<string, string | number> = {
    start: filters.start,
    end: filters.end,
    pageSize: filters.pageSize,
    current: filters.page
  }
  // 默认只看普通销售单；订单列表需要把会员充值单一起查出来
  if (!includeIncome) query['orderType'] = 'normal'
  if (filters.payment !== 'all') query['payType'] = PAYMENT_TO_SERVER[filters.payment]
  if (filters.orderSn.trim()) query['orderSn'] = filters.orderSn.trim()
  if (filters.memberPhone.trim()) query['userPhone'] = filters.memberPhone.trim()
  // 导购筛选直接传 ID，避免同名导购被合并
  if (filters.clerk) query['salerId'] = Number(filters.clerk)
  if (includeShowStatus && getOrderShowStatus() === 'hidden') query['showStatus'] = 'hidden'

  return query
}

/** 汇总接口直接给出区间指标；充值金额来自同区间的 income 订单 */
async function fetchSummary(filters: OrderFilters): Promise<OrderSummary> {
  const query = await toQuery({ ...filters, page: 1, pageSize: 1 }, true)
  delete query['pageSize']
  delete query['current']
  const summary = await posGet<ServerOrderSummary>('/order/queryOrderSummary', query)
  return {
    orderCount: summary.orderCount ?? 0,
    itemCount: summary.itemCount ?? 0,
    amount: round2(num(summary.orderActualAmount)),
    balanceUsed: round2(num(summary.balanceAmount)),
    recharge: round2(num(summary.incomeAmount))
  }
}

/** 取与当前区间等长、紧邻在上一个的时间窗，用于环比 */
function previousWindow(filters: OrderFilters): OrderFilters {
  const start = new Date(`${filters.start}T00:00:00`)
  const end = new Date(`${filters.end}T00:00:00`)
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
  const previousEnd = new Date(start)
  previousEnd.setDate(previousEnd.getDate() - 1)
  const previousStart = new Date(previousEnd)
  previousStart.setDate(previousStart.getDate() - (days - 1))
  return {
    ...filters,
    start: toDateString(previousStart),
    end: toDateString(previousEnd)
  }
}

function toDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** 订单列表：服务端分页，汇总与环比由统计接口提供 */
export async function fetchOrders(filters: OrderFilters): Promise<OrderListResult> {
  const query = await toQuery(filters, true, true)
  const [list, summary, previous, clerkNames] = await Promise.all([
    posGet<ServerList<ServerOrder>>('/order/queryList', query),
    fetchSummary(filters),
    fetchSummary(previousWindow(filters)),
    loadClerkNames()
  ])

  return {
    // 历史订单的 salerName 存的是用户名，按 salerId 映射为当前真实姓名
    rows: (list.data ?? []).map((order) => withClerkName(toOrder(order), order, clerkNames)),
    total: list.count ?? 0,
    summary,
    previous
  }
}

/** 用导购 ID 对应的真实姓名覆盖服务端存的用户名；映射缺失时保留原值 */
function withClerkName(
  order: Order,
  source: ServerOrder,
  clerkNames: Map<number, string>
): Order {
  const displayName = source.salerId ? clerkNames.get(source.salerId) : undefined
  return displayName ? { ...order, clerk: displayName } : order
}

/** 单条订单详情：订单主体 + 商品明细 + 优惠券 + 会员姓名 */
export async function fetchOrder(no: string): Promise<Order | null> {
  const order = await posGet<ServerOrder>('/order/queryDetail', { orderSn: no })
  if (!order || !order.orderSn) return null

  const [items, coupons] = await Promise.all([
    posGet<ServerList<ServerOrderItem>>('/order/queryItemList', { orderSn: no }),
    posGet<ServerList<ServerOrderCoupon>>('/order/queryCouponList', { orderSn: no }).catch(
      () => ({ count: 0, data: [] }) as ServerList<ServerOrderCoupon>
    )
  ])

  const mapped = withClerkName(toOrder(order, items.data ?? []), order, await loadClerkNames())
  mapped.coupons = (coupons.data ?? []).map(toOrderCoupon)

  if (order.userPhone) {
    try {
      const member = await posGet<{ name?: string }>('/member/detail', { phone: order.userPhone })
      if (member?.name) mapped.memberName = member.name
    } catch {
      // 会员可能已删除，详情页仍展示订单本体
    }
  }

  return mapped
}

/** 修改订单：对齐老系统 POST /order/modify?orderId= */
export async function modifyOrder(input: OrderModifyInput): Promise<void> {
  await posPost(
    '/order/modify',
    {
      orderSn: input.orderSn,
      payType: input.payType,
      orderActualAmount: input.orderActualAmount,
      salerId: input.salerId,
      userPhone: input.userPhone,
      remark: input.remark
    },
    { orderId: input.orderId }
  )
}

/** 对账：orderStatus=checked 视为已到账，今日订单由页面控制区间 */
export async function fetchReconcile(
  filters: OrderFilters
): Promise<{ rows: ReconcileRow[]; paidTotal: number; pendingTotal: number }> {
  const query = await toQuery({ ...filters, page: 1, pageSize: 1000 })
  const list = await posGet<ServerList<ServerOrder>>('/order/queryList', query)

  const rows = (list.data ?? []).map<ReconcileRow>((order) => ({
    no: order.orderSn,
    amount: num(order.orderActualAmount),
    payment: PAYMENT_BY_SERVER[order.payType ?? 'other'] ?? 'other',
    memberPhone: order.userPhone ?? '',
    done: order.orderStatus === 'checked',
    printed: order.printStatus === 'printed',
    hidden: order.showStatus === 'hidden',
    confirmedAt: order.orderStatus === 'checked' ? formatDateTime(order.updatedAt) : undefined
  }))

  const sum = (list2: ReconcileRow[]): number =>
    round2(list2.reduce((total, row) => total + row.amount, 0))

  return {
    rows,
    paidTotal: sum(rows.filter((row) => row.done)),
    pendingTotal: sum(rows.filter((row) => !row.done))
  }
}

/** 确认到账：写入订单的付款状态 */
export async function confirmReceipt(no: string): Promise<void> {
  await posPost('/order/checkBill', undefined, { orderSn: no })
}

/** 切换订单有效状态：normal ↔ hidden */
export async function toggleOrderShow(no: string, hidden: boolean): Promise<void> {
  await posPost('/order/toggleShow', { orderSn: no, showStatus: hidden ? 'normal' : 'hidden' })
}

interface ServerGoodsItem extends ServerOrderItem {
  orderActualAmount: Numeric
  orderCreatedAt: string | null
  orderItemCount: number
}

/** 订单商品：服务端按商品行返回，字段对齐老系统 OrderItemList */
export async function fetchOrderGoods(
  filters: OrderFilters
): Promise<{ rows: OrderGoodsRow[]; orderCount: number; itemCount: number }> {
  const list = await posGet<ServerList<ServerGoodsItem>>('/order/queryOrderItemListByDate', {
    start: filters.start,
    end: filters.end,
    pageSize: 1000,
    current: 1
  })

  const rows = (list.data ?? []).map<OrderGoodsRow>((item) => ({
    orderNo: item.orderSn,
    orderAmount: num(item.orderActualAmount),
    sku: item.sku,
    quantity: item.counts,
    itemStatus: ITEM_STATUS[item.status] ?? 'normal',
    originalPrice: num(item.originalPrice),
    actualPrice: num(item.actualPrice) || num(item.originalPrice),
    color: item.color,
    size: item.size
  }))

  return {
    rows,
    orderCount: new Set(rows.map((row) => row.orderNo)).size,
    itemCount: rows.reduce((sum, row) => sum + row.quantity, 0)
  }
}

/** 退货行：携带用户确认后的退回数量 */
export interface RefundLine {
  item: OrderItem
  counts: number
}

/** 退货：对齐老系统 POST /order/refundItem */
export async function refundOrder(input: {
  orderNo: string
  refundAmount: number
  amountType: 'money' | 'balance'
  lines: RefundLine[]
}): Promise<void> {
  await posPost('/order/refundItem', {
    orderSn: input.orderNo,
    refundAmount: input.refundAmount,
    amountType: input.amountType,
    refundItems: input.lines.map(({ item, counts }) => ({
      id: Number(item.id),
      sku: item.sku,
      counts
    }))
  })
}

/** 换货商品：从库存接口查到的完整商品行 */
export interface ExchangeProduct {
  id: number
  sku: string
  sn: string
  name: string
  brand: string
  color: string
  size: string
  originalPrice: number
  /** 可换库存 */
  counts: number
}

interface ServerInventory {
  id: number
  sku: string
  sn: string
  name: string
  brand: string | null
  color: string
  size: string
  originalPrice: Numeric
  counts: number
}

/** 换货扫码：按条码查库存，未找到时抛出可直接展示的错误 */
export async function fetchExchangeProduct(sku: string): Promise<ExchangeProduct> {
  const result = await posGet<ServerInventory | { sku: null; msg?: string }>(
    '/inventory/queryDetailBySku',
    { sku }
  )
  if (!result || !('sku' in result) || !result.sku) {
    throw new Error('没有找到对应的商品')
  }
  return {
    id: result.id,
    sku: result.sku,
    sn: result.sn,
    name: result.name,
    brand: result.brand ?? '',
    color: result.color,
    size: result.size,
    originalPrice: num(result.originalPrice),
    counts: result.counts
  }
}

/** 换货：对齐老系统 POST /order/changeItem */
export async function exchangeOrder(input: {
  orderNo: string
  lines: RefundLine[]
  exchangeItems: ExchangeProduct[]
  exchangeAmount: number
  amountType: 'add' | 'sub' | 'none'
  refundBalance: boolean
}): Promise<void> {
  await posPost('/order/changeItem', {
    orderSn: input.orderNo,
    returnItems: input.lines.map(({ item, counts }) => ({
      id: Number(item.id),
      sku: item.sku,
      counts
    })),
    exchangeItems: input.exchangeItems.map((item) => ({
      sku: item.sku,
      sn: item.sn,
      name: item.name,
      brand: item.brand,
      color: item.color,
      size: item.size,
      originalPrice: item.originalPrice,
      counts: item.counts
    })),
    exchangeAmount: input.exchangeAmount,
    amountType: input.amountType,
    refundBalance: input.refundBalance
  })
}

interface ServerMemberReceipt {
  point?: Numeric
  coupon?: Numeric
  balance?: Numeric
}

/** 小票会员权益：积分 / 可用券 / 储值余额 */
export async function fetchReceiptMember(
  phone: string
): Promise<{ point: number; coupon: number; balance: number }> {
  const member = await posGet<ServerMemberReceipt>('/member/detail', { phone })
  return {
    point: num(member?.point),
    coupon: num(member?.coupon),
    balance: num(member?.balance)
  }
}

/** 打印成功后回写订单打印状态 */
export async function markOrderPrinted(no: string): Promise<void> {
  await posPost('/order/updatePrintStatus', { orderSn: no, printStatus: 'printed' })
}
