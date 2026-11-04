import type { OrderDetail, OrderRecord } from '@/types/api'
import { request, requestPage } from './request'

export const getOrders = (
  current = 1,
  pageSize = 20,
  status?: string
): Promise<{ list: OrderRecord[]; count: number }> =>
  requestPage<OrderRecord>('/mini/orders', { data: status ? { current, pageSize, status } : { current, pageSize } })

export const getOrderDetail = (orderSn: string): Promise<OrderDetail> =>
  request<OrderDetail>(`/mini/orders/${orderSn}`)
