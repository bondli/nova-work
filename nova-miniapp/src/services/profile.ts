import type { MemberSummary } from '@/types/api'
import { request } from './request'

export const getProfile = (): Promise<MemberSummary> => request<MemberSummary>('/mini/profile')

export const updateProfile = (payload: { name?: string; birthday?: string }): Promise<MemberSummary> =>
  request<MemberSummary>('/mini/profile', { method: 'PATCH', data: payload })
