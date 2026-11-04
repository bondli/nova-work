import type { ActivityDetail } from '@/types/api'
import { request } from './request'

/** 活动详情：公开可浏览，带 token 时返回券的领取状态 */
export const getActivityDetail = (id: string | number): Promise<ActivityDetail> =>
  request<ActivityDetail>(`/mini/activities/${encodeURIComponent(String(id))}`)

/** 领取活动券：服务端按会员 + 券做幂等，重复领取返回错误提示 */
export const claimActivityCoupon = (
  activityId: number,
  couponId: number
): Promise<{ couponId: number; claimed: boolean }> =>
  request(`/mini/activities/${activityId}/coupons/${couponId}/claim`, { method: 'POST' })
