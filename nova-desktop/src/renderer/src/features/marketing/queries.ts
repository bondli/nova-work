import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CampaignFilters, CampaignInput } from '@shared/types/campaign'
import type { MiniHomeContent } from '@shared/types/mini-home'
import type {
  RedeemItemFilters,
  RedeemItemInput,
  RedeemOrderFilters
} from '@shared/types/redeem'
import {
  createCampaign,
  createRedeemItem,
  deleteCampaign,
  fetchCampaignCoupons,
  fetchCampaignDetail,
  fetchCampaigns,
  fetchMiniHomeContent,
  fetchRedeemItems,
  fetchRedeemOrders,
  saveMiniHomeContent,
  toggleCampaign,
  updateCampaign,
  updateRedeemItem,
  verifyRedeemOrder
} from './api'

/**
 * 营销域 Query Key。
 * 新增 / 编辑 / 上下线 / 删除成功后整域失效，指标卡与列表同步刷新。
 */
export const campaignKeys = {
  all: ['campaigns'] as const,
  list: (filters: CampaignFilters) => [...campaignKeys.all, 'list', filters] as const,
  detail: (id: string) => [...campaignKeys.all, 'detail', id] as const,
  coupons: (id: string) => [...campaignKeys.all, 'coupons', id] as const
}

export function useCampaignsQuery(filters: CampaignFilters) {
  return useQuery({
    queryKey: campaignKeys.list(filters),
    queryFn: () => fetchCampaigns(filters),
    placeholderData: keepPreviousData
  })
}

/** 活动详情，编辑弹窗打开时按需拉取 */
export function useCampaignDetailQuery(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: campaignKeys.detail(id ?? ''),
    queryFn: () => fetchCampaignDetail(id as string),
    enabled: Boolean(id) && enabled
  })
}

/** 活动下属优惠券，详情抽屉打开时按需拉取 */
export function useCampaignCouponsQuery(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: campaignKeys.coupons(id ?? ''),
    queryFn: () => fetchCampaignCoupons(id as string),
    enabled: Boolean(id) && enabled
  })
}

function useInvalidateCampaigns() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: campaignKeys.all })
}

export function useToggleCampaign() {
  const invalidate = useInvalidateCampaigns()
  return useMutation({ mutationFn: toggleCampaign, onSuccess: invalidate })
}

export function useDeleteCampaign() {
  const invalidate = useInvalidateCampaigns()
  return useMutation({ mutationFn: deleteCampaign, onSuccess: invalidate })
}

export function useCreateCampaign() {
  const invalidate = useInvalidateCampaigns()
  return useMutation({
    mutationFn: (input: CampaignInput) => createCampaign(input),
    onSuccess: invalidate
  })
}

export function useUpdateCampaign() {
  const invalidate = useInvalidateCampaigns()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CampaignInput }) => updateCampaign(id, input),
    onSuccess: invalidate
  })
}

/** 小程序首页素材：配置由桌面端编辑、文件落盘，手动保存后才刷新 */
export function useMiniHomeContentQuery() {
  return useQuery({
    queryKey: ['mini-home-content'],
    queryFn: fetchMiniHomeContent
  })
}

export function useSaveMiniHomeContent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (content: MiniHomeContent) => saveMiniHomeContent(content),
    onSuccess: (content) => {
      queryClient.setQueryData(['mini-home-content'], content)
    }
  })
}

/** 积分兑换 Query Key：礼品列表与某礼品的兑换记录分开缓存 */
export const redeemKeys = {
  all: ['redeem'] as const,
  items: (filters: RedeemItemFilters) => [...redeemKeys.all, 'items', filters] as const,
  orders: (itemId: number, filters: RedeemOrderFilters) =>
    [...redeemKeys.all, 'orders', itemId, filters] as const
}

export function useRedeemItemsQuery(filters: RedeemItemFilters) {
  return useQuery({
    queryKey: redeemKeys.items(filters),
    queryFn: () => fetchRedeemItems(filters),
    placeholderData: keepPreviousData
  })
}

/** 礼品兑换记录：抽屉打开时才请求 */
export function useRedeemOrdersQuery(
  itemId: number | null,
  filters: RedeemOrderFilters,
  enabled: boolean
) {
  return useQuery({
    queryKey: redeemKeys.orders(itemId ?? 0, filters),
    queryFn: () => fetchRedeemOrders(itemId as number, filters),
    enabled: Boolean(itemId) && enabled,
    placeholderData: keepPreviousData
  })
}

function useInvalidateRedeemItems() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: redeemKeys.all })
}

export function useCreateRedeemItem() {
  const invalidate = useInvalidateRedeemItems()
  return useMutation({ mutationFn: createRedeemItem, onSuccess: invalidate })
}

export function useUpdateRedeemItem() {
  const invalidate = useInvalidateRedeemItems()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: RedeemItemInput }) =>
      updateRedeemItem(id, input),
    onSuccess: invalidate
  })
}

/** 核销成功后同时刷新礼品列表（剩余库存不变）与当前记录抽屉 */
export function useVerifyRedeemOrder() {
  const invalidate = useInvalidateRedeemItems()
  return useMutation({ mutationFn: verifyRedeemOrder, onSuccess: invalidate })
}
