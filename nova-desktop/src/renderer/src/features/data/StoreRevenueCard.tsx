import type { DailyRevenue, MonthlyRevenue } from '@shared/types/analytics'
import { ArrowLeft, ChartColumn } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { EmptyState } from '@renderer/components/common/EmptyState'
import { formatMoney } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'

interface StoreRevenueCardProps {
  months: MonthlyRevenue[]
  /** 按天视图下当前月份的数据 */
  daily: DailyRevenue[]
  /** 按天数据是否加载中 */
  dailyLoading: boolean
  /** 非空表示按天视图，值为 YYYY-MM */
  month: string | null
  /** 导购员不可见成本、利润率 */
  canViewCost: boolean
  onSelectMonth: (month: string) => void
  onBack: () => void
  className?: string
}

/** 柱高按当月最大销售额等比缩放 */
const BAR_AREA = 210

/** 两位日期数字，用于按天柱的 title */
function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** 月份展示为老系统的 YYYY/MM */
function monthLabel(month: string): string {
  return month.replace('-', '/')
}

/** 横轴只标 1、4、7、10 月，其余留空，与老系统一致 */
function axisLabel(month: string): string {
  const monthNum = month.slice(5)
  return ['01', '04', '07', '10'].includes(monthNum) ? monthLabel(month) : ''
}

/**
 * 店铺营业额卡片：月视图双柱 + 点击下钻按天视图。
 * 版式对齐老系统 StoreChart：只保留图表本体与图例，金额按原值展示。
 */
export function StoreRevenueCard({
  months,
  daily,
  dailyLoading,
  month,
  canViewCost,
  onSelectMonth,
  onBack,
  className
}: StoreRevenueCardProps) {
  const monthlyMax = Math.max(1, ...months.map((item) => item.sales))
  const dailyMax = Math.max(1, ...daily.map((item) => item.amount))

  return (
    <div
      className={cn('flex shrink-0 flex-col rounded-xl border border-border bg-card p-4', className)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-body font-semibold">
            {month ? `${monthLabel(month)} 店铺按天营业额` : '店铺营业额(CNY)'}
          </p>
          {month ? (
            <Button type="button" variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              返回按月视图
            </Button>
          ) : (
            <span className="text-meta text-subtle">点击柱状图查看该月按天数据</span>
          )}
        </div>

        <div className="flex items-center gap-3 text-meta text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-chart-1" />
            销售额
          </span>
          {canViewCost ? (
            <>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-chart-2" />
                成本
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-success" />
                利润率
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex h-[240px] items-end gap-1.5">
        {month ? (
          dailyLoading ? (
            <p className="w-full self-center text-center text-ui text-muted-foreground">
              加载中…
            </p>
          ) : (
            daily.map((item) => (
              <div
                key={item.day}
                className="flex flex-1 flex-col items-center gap-1"
                title={`${monthLabel(month)}-${pad2(item.day)} ${formatMoney(item.amount)}`}
              >
                <div
                  className="w-full rounded-t bg-chart-1/80 transition-colors hover:bg-chart-1"
                  style={{ height: `${Math.round((item.amount / dailyMax) * BAR_AREA)}px` }}
                />
                <span className="text-caption text-subtle">
                  {item.day % 5 === 1 ? pad2(item.day) : ''}
                </span>
              </div>
            ))
          )
        ) : months.length > 0 ? (
          months.map((item) => (
            <button
              key={item.month}
              type="button"
              onClick={() => onSelectMonth(item.month)}
              title={
                canViewCost
                  ? `${monthLabel(item.month)} 销售额 ${formatMoney(item.sales)} · 成本 ${formatMoney(item.cost)} · 利润率 ${item.profitRate}%`
                  : `${monthLabel(item.month)} 销售额 ${formatMoney(item.sales)}`
              }
              aria-label={`查看 ${monthLabel(item.month)} 按天营业额`}
              className="group flex flex-1 cursor-pointer flex-col items-center gap-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              <div className="flex h-[210px] w-full items-end justify-center gap-1 px-1">
                <div
                  className="w-1/2 rounded-t bg-chart-1/85 transition-colors group-hover:bg-chart-1"
                  style={{ height: `${(item.sales / monthlyMax) * 100}%` }}
                />
                {canViewCost ? (
                  <div
                    className="w-2/5 rounded-t bg-chart-2 transition-[filter] group-hover:brightness-95"
                    style={{ height: `${(item.cost / monthlyMax) * 100}%` }}
                  />
                ) : null}
              </div>
              <span className="text-caption text-subtle">{axisLabel(item.month)}</span>
              {canViewCost ? (
                <span className="text-caption font-medium text-success tnum">
                  {item.profitRate}%
                </span>
              ) : null}
            </button>
          ))
        ) : (
          <EmptyState
            icon={ChartColumn}
            title="暂无营业额数据"
            description="稍后再试或联系管理员"
            className="w-full self-center"
          />
        )}
      </div>
    </div>
  )
}
