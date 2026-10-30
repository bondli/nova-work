import { useQuery } from '@tanstack/react-query'
import { fetchAnalyticsSnapshot, fetchSalerDaily, fetchStoreDaily } from './api'
import { useOrderShowStatus } from '@renderer/stores/order-show-status-store'

/**
 * 数据域 Query Key。
 * 区间进入查询键，切换日期区间后重新取数。
 */
export const analyticsKeys = {
  all: ['analytics'] as const,
  snapshot: (start: string, end: string) => [...analyticsKeys.all, 'snapshot', start, end] as const,
  storeDaily: (month: string) => [...analyticsKeys.all, 'store-daily', month] as const,
  salerDaily: (month: string) => [...analyticsKeys.all, 'saler-daily', month] as const
}

/** 指标卡与月度图表：区间或隐藏开关变化时重新取数，因此不缓存旧结果 */
export function useAnalyticsQuery(start: string, end: string) {
  const showStatus = useOrderShowStatus()
  return useQuery({
    queryKey: [...analyticsKeys.snapshot(start, end), showStatus],
    queryFn: () => fetchAnalyticsSnapshot(start, end),
    staleTime: 0
  })
}

/** 店铺按天数据：仅在进入按天视图时查询 */
export function useStoreDailyQuery(month: string | null) {
  const showStatus = useOrderShowStatus()
  return useQuery({
    queryKey: [...analyticsKeys.storeDaily(month ?? ''), showStatus],
    queryFn: () => fetchStoreDaily(month as string),
    enabled: month !== null,
    staleTime: 5 * 60_000
  })
}

/** 导购按天数据：仅在进入按天视图时查询 */
export function useSalerDailyQuery(month: string | null) {
  const showStatus = useOrderShowStatus()
  return useQuery({
    queryKey: [...analyticsKeys.salerDaily(month ?? ''), showStatus],
    queryFn: () => fetchSalerDaily(month as string),
    enabled: month !== null,
    staleTime: 5 * 60_000
  })
}
