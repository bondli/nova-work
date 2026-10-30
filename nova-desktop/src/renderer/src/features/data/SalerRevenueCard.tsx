import { ArrowLeft, ChartColumn } from 'lucide-react'
import type { DailyRevenue, SalerMonthlyRevenue } from '@shared/types/analytics'
import { Button } from '@renderer/components/ui/button'
import { EmptyState } from '@renderer/components/common/EmptyState'
import { formatMoney } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'

interface SalerRevenueCardProps {
  months: SalerMonthlyRevenue[]
  /** 按天视图下当前月份的数据 */
  daily: DailyRevenue[]
  /** 按天数据是否加载中 */
  dailyLoading: boolean
  /** 非空表示按天视图，值为 YYYY-MM */
  month: string | null
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
 * 导购员营业额卡片：对齐老系统 SalerChart。
 * 服务端按登录身份返回本人近 12 个月营业额，仅金额、不含成本。
 */
export function SalerRevenueCard({
  months,
  daily,
  dailyLoading,
  month,
  onSelectMonth,
  onBack,
  className
}: SalerRevenueCardProps) {
  const monthlyMax = Math.max(1, ...months.map((item) => item.sales))
  const dailyMax = Math.max(1, ...daily.map((item) => item.amount))

  return (
    <div
      className={cn('flex shrink-0 flex-col rounded-xl border border-border bg-card p-4', className)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-body font-semibold">
            {month ? `${monthLabel(month)} 按天营业额` : '我的营业额(CNY)'}
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
              title={`${monthLabel(item.month)} 营业额 ${formatMoney(item.sales)}`}
              aria-label={`查看 ${monthLabel(item.month)} 按天营业额`}
              className="group flex flex-1 cursor-pointer flex-col items-center gap-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              <div className="flex h-[210px] w-full items-end justify-center px-1">
                <div
                  className="w-1/2 rounded-t bg-chart-1/85 transition-colors group-hover:bg-chart-1"
                  style={{ height: `${(item.sales / monthlyMax) * 100}%` }}
                />
              </div>
              <span className="text-caption text-subtle">{axisLabel(item.month)}</span>
            </button>
          ))
        ) : (
          <EmptyState
            icon={ChartColumn}
            title="暂无数据"
            description="近 12 个月还没有营业额"
            className="w-full self-center"
          />
        )}
      </div>
    </div>
  )
}
