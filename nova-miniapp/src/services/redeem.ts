import type { RedeemItem, RedeemOrder } from '@/types/api'
import { request, requestMeta, requestPage } from './request'

export interface RedeemListResult {
  items: RedeemItem[]
  points: number
}

/** 礼品列表额外返回当前积分，用于按钮可用态与库存进度 */
export const getRedeemItems = async (current = 1, pageSize = 20): Promise<RedeemListResult> => {
  const body = await requestMeta<RedeemItem[]>('/mini/redeems', { data: { current, pageSize } })
  return { items: body.data ?? [], points: Number(body.points ?? 0) }
}

export interface RedeemResult {
  order: RedeemOrder
  remainStock: number
  points: number
}

export const redeemItem = (id: number, requestId: string): Promise<RedeemResult> =>
  request<RedeemResult>(`/mini/redeems/${id}/redeem`, { method: 'POST', data: { requestId } })

export const getRedeemOrders = (status?: string, current = 1, pageSize = 20) =>
  requestPage<RedeemOrder>('/mini/redeem-orders', {
    data: status ? { status, current, pageSize } : { current, pageSize }
  })
