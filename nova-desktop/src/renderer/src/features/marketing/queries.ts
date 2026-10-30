import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CampaignFilters, CampaignInput } from '@shared/types/campaign'
import {
  createCampaign,
  deleteCampaign,
  fetchCampaignCoupons,
  fetchCampaignDetail,
  fetchCampaigns,
  toggleCampaign,
  updateCampaign
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
