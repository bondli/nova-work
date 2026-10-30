import { Megaphone } from 'lucide-react'
import { Skeleton } from '@renderer/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import { EmptyState } from '@renderer/components/common/EmptyState'
import { SheetDrawer } from '@renderer/components/common/SheetDrawer'
import { StatusBadge } from '@renderer/components/common/StatusBadge'
import { cn } from '@renderer/lib/utils'
import { useCampaignCouponsQuery, useCampaignDetailQuery } from './queries'
import { CAMPAIGN_STATUS, CAMPAIGN_TYPE } from './labels'

interface MarketingDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: string | null
}

/** 券列表表头，列顺序与老系统 Detail/coupon.tsx 一致 */
const COUPON_HEADERS = ['id', '名称', '条件', '券值', '数量', '状态', '过期时间']

const HEAD_CLASS = 'h-8 px-3 text-meta text-muted-foreground'
const CELL_CLASS = 'px-3 py-2 text-ui'

/**
 * 活动详情抽屉：基本信息 + 活动下属优惠券列表。
 * 券列表走 /marketing/queryCouponList，字段与老系统一致。
 */
export function MarketingDetailSheet({
  open,
  onOpenChange,
  campaignId
}: MarketingDetailSheetProps) {
  const { data: campaign, isLoading } = useCampaignDetailQuery(campaignId, open)
  const { data: coupons = [], isLoading: couponsLoading } = useCampaignCouponsQuery(
    campaignId,
    open
  )

  const infoItems = campaign
    ? [
        { label: '活动名称', value: campaign.name },
        { label: '活动描述', value: campaign.description || '—' },
        { label: '活动类型', value: CAMPAIGN_TYPE[campaign.type] },
        { label: '开始时间', value: campaign.start ?? '长期' },
        { label: '结束时间', value: campaign.end ?? '长期' }
      ]
    : []

  return (
    <SheetDrawer
      open={open}
      onOpenChange={onOpenChange}
      width="xl"
      title="活动详情"
      description={campaign ? CAMPAIGN_TYPE[campaign.type] : '查看活动信息与优惠券'}
    >
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      ) : campaign ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-ui font-semibold">基本信息</h3>
            <StatusBadge status={CAMPAIGN_STATUS[campaign.status].tone}>
              {CAMPAIGN_STATUS[campaign.status].label}
            </StatusBadge>
          </div>

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border text-ui">
            {infoItems.map((item) => (
              <div key={item.label} className="flex bg-card">
                <dt className="w-[76px] shrink-0 bg-surface px-3 py-2 text-meta text-muted-foreground">
                  {item.label}
                </dt>
                <dd className="min-w-0 flex-1 truncate px-3 py-2">{item.value}</dd>
              </div>
            ))}
          </dl>

          <section>
            <h3 className="mb-2 text-ui font-semibold">优惠券列表</h3>
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader className="bg-surface">
                  <TableRow className="border-border hover:bg-transparent">
                    {COUPON_HEADERS.map((header) => (
                      <TableHead key={header} className={HEAD_CLASS}>
                        {header}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {couponsLoading ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={COUPON_HEADERS.length}
                        className="px-3 py-6 text-center text-ui text-muted-foreground"
                      >
                        加载中
                      </TableCell>
                    </TableRow>
                  ) : coupons.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={COUPON_HEADERS.length}
                        className="px-3 py-6 text-center text-ui text-muted-foreground"
                      >
                        暂无数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    coupons.map((coupon) => (
                      <TableRow key={coupon.id} className="border-border/60 hover:bg-surface">
                        <TableCell className={cn(CELL_CLASS, 'tnum')}>{coupon.id}</TableCell>
                        <TableCell className={CELL_CLASS}>{coupon.name}</TableCell>
                        <TableCell className={cn(CELL_CLASS, 'tnum')}>{coupon.condition}</TableCell>
                        <TableCell className={cn(CELL_CLASS, 'tnum')}>{coupon.value}</TableCell>
                        <TableCell className={cn(CELL_CLASS, 'tnum')}>
                          {coupon.count ?? '—'}
                        </TableCell>
                        <TableCell className={CELL_CLASS}>
                          <StatusBadge status={coupon.status === '有效' ? 'success' : 'neutral'}>
                            {coupon.status}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className={cn(CELL_CLASS, 'tnum text-muted-foreground')}>
                          {coupon.expiresAt}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        </div>
      ) : (
        <EmptyState
          icon={Megaphone}
          title="活动不存在"
          description="该活动可能已被删除，请刷新列表后重试"
        />
      )}
    </SheetDrawer>
  )
}
