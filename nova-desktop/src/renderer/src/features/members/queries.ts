import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { MemberBalanceInput, MemberFilters, MemberPointInput } from '@shared/types/member'
import {
  createMember,
  fetchMember,
  fetchMembers,
  rechargeMember,
  updateMemberBalance,
  updateMemberPoint,
  updateMemberProfile
} from './api'

/**
 * 会员域 Query Key。
 * 统一从 memberKeys 派生，充值 / 编辑成功后整域失效即可同步列表与详情。
 */
export const memberKeys = {
  all: ['members'] as const,
  list: (filters: MemberFilters) => [...memberKeys.all, 'list', filters] as const,
  detail: (id: string) => [...memberKeys.all, 'detail', id] as const
}

/** 翻页与筛选时保留上一页数据，避免表格闪回骨架 */
export function useMembersQuery(filters: MemberFilters) {
  return useQuery({
    queryKey: memberKeys.list(filters),
    queryFn: () => fetchMembers(filters),
    placeholderData: keepPreviousData
  })
}

export function useMemberQuery(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: memberKeys.detail(id ?? ''),
    queryFn: () => fetchMember(id as string),
    enabled: Boolean(id) && enabled
  })
}

/** 充值成功后刷新会员列表与详情 */
export function useRechargeMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: rechargeMember,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: memberKeys.all })
  })
}

function useInvalidateMembers() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: memberKeys.all })
}

/** 新增会员成功后刷新列表 */
export function useCreateMember() {
  const invalidate = useInvalidateMembers()
  return useMutation({ mutationFn: createMember, onSuccess: invalidate })
}

/** 修改基本信息与手动调整积分都属于「编辑会员」，成功后整域失效 */
export function useUpdateMemberProfile() {
  const invalidate = useInvalidateMembers()
  return useMutation({ mutationFn: updateMemberProfile, onSuccess: invalidate })
}

export function useUpdateMemberPoint() {
  const invalidate = useInvalidateMembers()
  return useMutation({
    mutationFn: (input: MemberPointInput) => updateMemberPoint(input),
    onSuccess: invalidate
  })
}

export function useUpdateMemberBalance() {
  const invalidate = useInvalidateMembers()
  return useMutation({
    mutationFn: (input: MemberBalanceInput) => updateMemberBalance(input),
    onSuccess: invalidate
  })
}
