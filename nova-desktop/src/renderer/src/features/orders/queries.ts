import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { OrderFilters, OrderModifyInput } from '@shared/types/order'
import {
  confirmReceipt,
  exchangeOrder,
  fetchClerks,
  fetchOrder,
  fetchOrderGoods,
  fetchOrders,
  fetchReceiptMember,
  fetchReconcile,
  markOrderPrinted,
  modifyOrder,
  refundOrder,
  toggleOrderShow,
  type ExchangeProduct,
  type RefundLine
} from './api'
import { useOrderShowStatus } from '@renderer/stores/order-show-status-store'

/**
 * 订单域 Query Key。
 * 统一从 orderKeys 派生，便于按域失效缓存。
 */
export const orderKeys = {
  all: ['orders'] as const,
  list: (filters: OrderFilters) => [...orderKeys.all, 'list', filters] as const,
  detail: (no: string) => [...orderKeys.all, 'detail', no] as const,
  reconcile: (filters: OrderFilters) => [...orderKeys.all, 'reconcile', filters] as const,
  goods: (filters: OrderFilters) => [...orderKeys.all, 'goods', filters] as const,
  clerks: () => [...orderKeys.all, 'clerks'] as const,
  receiptMember: (phone: string) => [...orderKeys.all, 'receipt-member', phone] as const
}

/** 导购下拉数据，仅管理员有权限；无权限时静默返回空列表 */
export function useClerksQuery() {
  return useQuery({
    queryKey: orderKeys.clerks(),
    queryFn: fetchClerks,
    staleTime: 5 * 60_000,
    retry: false
  })
}

/** 翻页时保留上一页数据，避免表格闪回骨架；隐藏开关变化时重新取数 */
export function useOrdersQuery(filters: OrderFilters) {
  const showStatus = useOrderShowStatus()
  return useQuery({
    queryKey: [...orderKeys.list(filters), showStatus],
    queryFn: () => fetchOrders(filters),
    placeholderData: keepPreviousData
  })
}

export function useOrderQuery(no: string | null) {
  return useQuery({
    queryKey: orderKeys.detail(no ?? ''),
    queryFn: () => fetchOrder(no as string),
    enabled: Boolean(no)
  })
}

/** 对账抽屉打开时才请求，避免无谓的列表查询 */
export function useReconcileQuery(filters: OrderFilters, enabled: boolean) {
  return useQuery({
    queryKey: orderKeys.reconcile(filters),
    queryFn: () => fetchReconcile(filters),
    enabled
  })
}

export function useOrderGoodsQuery(filters: OrderFilters, enabled: boolean) {
  return useQuery({
    queryKey: orderKeys.goods(filters),
    queryFn: () => fetchOrderGoods(filters),
    enabled
  })
}

/** 确认到账后刷新对账与列表缓存 */
export function useConfirmReceipt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: confirmReceipt,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orderKeys.all })
  })
}

/** 切换订单有效状态后刷新对账缓存 */
export function useToggleOrderShow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ no, hidden }: { no: string; hidden: boolean }) => toggleOrderShow(no, hidden),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orderKeys.all })
  })
}

/** 修改订单成功后刷新列表与详情 */
export function useModifyOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: OrderModifyInput) => modifyOrder(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orderKeys.all })
  })
}

/** 小票上的会员权益，仅在会员手机号存在时请求 */
export function useReceiptMemberQuery(phone: string | null) {
  return useQuery({
    queryKey: orderKeys.receiptMember(phone ?? ''),
    queryFn: () => fetchReceiptMember(phone as string),
    enabled: Boolean(phone),
    staleTime: 60_000,
    retry: false
  })
}

/** 退货成功后刷新订单列表、详情与对账 */
export function useRefundOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      orderNo: string
      refundAmount: number
      amountType: 'money' | 'balance'
      lines: RefundLine[]
    }) => refundOrder(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orderKeys.all })
  })
}

/** 换货成功后刷新订单列表、详情与对账 */
export function useExchangeOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      orderNo: string
      lines: RefundLine[]
      exchangeItems: ExchangeProduct[]
      exchangeAmount: number
      amountType: 'add' | 'sub' | 'none'
      refundBalance: boolean
    }) => exchangeOrder(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orderKeys.all })
  })
}

/** 打印成功后只回写打印状态，列表与对账同步刷新 */
export function useMarkOrderPrinted() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markOrderPrinted,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orderKeys.all })
  })
}
