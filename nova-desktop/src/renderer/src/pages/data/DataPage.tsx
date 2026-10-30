import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import type { AnalyticsSummary } from '@shared/types/analytics'
import { Button } from '@renderer/components/ui/button'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { DateRangePicker, type DateRangeValue } from '@renderer/components/common/DateRangePicker'
import { EmptyState } from '@renderer/components/common/EmptyState'
import { StatCard } from '@renderer/components/common/StatCard'
import { SalerRevenueCard } from '@renderer/features/data/SalerRevenueCard'
import { StoreRevenueCard } from '@renderer/features/data/StoreRevenueCard'
import { useAnalyticsQuery, useSalerDailyQuery, useStoreDailyQuery } from '@renderer/features/data/queries'
import { buildDelta } from '@renderer/lib/delta'
import { createRecentRange, formatDate, formatMoney } from '@renderer/lib/format'
import { useAuthStore } from '@renderer/stores/auth-store'

interface SummaryCard {
  label: string
  value: (summary: AnalyticsSummary) => string
  /** 环比取数；库存与会员余额是当前时点快照，不参与环比 */
  metric?: (summary: AnalyticsSummary) => number
}

/** 6 个事实指标，对齐老系统：金额保留两位小数；带 metric 的参与较上期对比 */
const SUMMARY_CARDS: SummaryCard[] = [
  {
    label: '订单金额(CNY)',
    value: (item) => formatMoney(item.orderAmount),
    metric: (item) => item.orderAmount
  },
  {
    label: '余额消耗',
    value: (item) => formatMoney(item.balanceSpent),
    metric: (item) => item.balanceSpent
  },
  {
    label: '订单数量',
    value: (item) => item.orderCount.toLocaleString('zh-CN'),
    metric: (item) => item.orderCount
  },
  {
    label: '售出商品',
    value: (item) => item.soldItems.toLocaleString('zh-CN'),
    metric: (item) => item.soldItems
  },
  { label: '商品库存', value: (item) => item.stock.toLocaleString('zh-CN') },
  { label: '会员余额(CNY)', value: (item) => formatMoney(item.memberBalance) }
]

/** 营业额视图：月视图或某个月的按天视图 */
type RevenueView = { mode: 'month' } | { mode: 'day'; month: string }

/**
 * 数据中心：日期区间 + 6 个事实指标 + 我的营业额 + 店铺营业额。
 * 版式对齐老系统：只放两张图表，点击月份柱下钻按天，可返回按月视图。
 */
export function DataPage() {
  const [range, setRange] = useState<DateRangeValue>(() => createRecentRange(30))
  const [storeView, setStoreView] = useState<RevenueView>({ mode: 'month' })
  const [salerView, setSalerView] = useState<RevenueView>({ mode: 'month' })

  const role = useAuthStore((state) => state.user?.role)
  const canViewCost = role !== 'clerk'

  const { data, isLoading, error, refetch } = useAnalyticsQuery(
    formatDate(range.start),
    formatDate(range.end)
  )

  const storeMonth = storeView.mode === 'day' ? storeView.month : null
  const salerMonth = salerView.mode === 'day' ? salerView.month : null
  const storeDaily = useStoreDailyQuery(storeMonth)
  const salerDaily = useSalerDailyQuery(salerMonth)

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4">
      <div className="flex flex-wrap items-center gap-3">
        <DateRangePicker value={range} onChange={setRange} />
        <span className="text-meta text-muted-foreground">门店营业额按近 12 个月统计</span>
      </div>

      {error ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-border bg-card p-6">
          <EmptyState
            icon={TriangleAlert}
            title="数据加载失败"
            description={(error as Error).message}
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                重新加载
              </Button>
            }
          />
        </div>
      ) : isLoading ? (
        <>
          <div className="grid grid-cols-3 gap-3 xl:grid-cols-6">
            {Array.from({ length: SUMMARY_CARDS.length }, (_, index) => (
              <Skeleton key={index} className="h-[86px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="min-h-[420px] rounded-xl" />
          <Skeleton className="min-h-[420px] rounded-xl" />
        </>
      ) : data ? (
        <>
          <div className="grid grid-cols-3 gap-3 xl:grid-cols-6">
            {SUMMARY_CARDS.map((card) => (
              <StatCard
                key={card.label}
                label={card.label}
                value={card.value(data.summary)}
                size="compact"
                className="p-3.5"
                delta={
                  card.metric
                    ? buildDelta(card.metric(data.summary), card.metric(data.previousSummary))
                    : undefined
                }
              />
            ))}
          </div>

          <SalerRevenueCard
            months={data.salerMonths}
            daily={salerDaily.data ?? []}
            dailyLoading={salerDaily.isLoading}
            month={salerMonth}
            onSelectMonth={(month) => setSalerView({ mode: 'day', month })}
            onBack={() => setSalerView({ mode: 'month' })}
          />

          <StoreRevenueCard
            months={data.months}
            daily={storeDaily.data ?? []}
            dailyLoading={storeDaily.isLoading}
            month={storeMonth}
            canViewCost={canViewCost}
            onSelectMonth={(month) => setStoreView({ mode: 'day', month })}
            onBack={() => setStoreView({ mode: 'month' })}
          />
        </>
      ) : null}
    </div>
  )
}
