import type { BalanceLog, CouponRecord, DrawRecord, PointLog } from '@/types/api'
import { requestPage } from './request'

export const getPointLogs = (current = 1, pageSize = 20) =>
  requestPage<PointLog>('/mini/points', { data: { current, pageSize } })

export const getBalanceLogs = (current = 1, pageSize = 20) =>
  requestPage<BalanceLog>('/mini/balance', { data: { current, pageSize } })

export const getCoupons = (current = 1, pageSize = 20) =>
  requestPage<CouponRecord>('/mini/coupons', { data: { current, pageSize } })

export const getDrawRecords = (current = 1, pageSize = 20) =>
  requestPage<DrawRecord>('/mini/draws', { data: { current, pageSize } })
