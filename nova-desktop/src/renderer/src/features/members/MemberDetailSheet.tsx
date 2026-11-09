import { UserRound } from 'lucide-react'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { TableCell, TableRow } from '@renderer/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { CopyableText } from '@renderer/components/common/CopyText'
import { DetailEmptyRow, DetailTable, DETAIL_CELL } from '@renderer/components/common/DetailTable'
import { EmptyState } from '@renderer/components/common/EmptyState'
import { Money } from '@renderer/components/common/Money'
import { SheetDrawer } from '@renderer/components/common/SheetDrawer'
import { StatusBadge, type StatusTone } from '@renderer/components/common/StatusBadge'
import { cn } from '@renderer/lib/utils'
import { useMemberQuery } from './queries'
import { MEMBER_LEVEL, MEMBER_PAYMENT } from './labels'

interface MemberDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  memberId: string | null
}

/** 优惠券状态文案与语义色 */
const COUPON_STATUS: Record<'available' | 'used' | 'expired', { label: string; tone: StatusTone }> =
  {
    available: { label: '有效', tone: 'success' },
    used: { label: '已使用', tone: 'neutral' },
    expired: { label: '已过期', tone: 'danger' }
  }

/** 会员信息区块，字段顺序与老系统 Descriptions 一致 */
const INFO_ITEMS = [
  { key: 'phone', label: '手机号' },
  { key: 'name', label: '姓名' },
  { key: 'birthday', label: '生日' },
  { key: 'totalSpent', label: '实付' },
  { key: 'points', label: '积分' },
  { key: 'balance', label: '余额' },
  { key: 'couponCount', label: '优惠券' }
] as const

/**
 * 会员详情抽屉：会员信息 + 订单 / 积分 / 余额 / 优惠券四张明细表。
 * 表头文案与列顺序对齐老系统 Detail 目录。
 */
export function MemberDetailSheet({ open, onOpenChange, memberId }: MemberDetailSheetProps) {
  const { data: member, isLoading } = useMemberQuery(memberId, open)

  return (
    <SheetDrawer
      open={open}
      onOpenChange={onOpenChange}
      width="xl"
      title="会员详情"
      description={member ? `${member.name} · ${member.phone}` : '查看会员资料、积分与余额'}
    >
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      ) : member ? (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border text-ui">
            {INFO_ITEMS.map((item) => (
              <div key={item.key} className="flex bg-card">
                <dt className="w-[76px] shrink-0 bg-surface px-3 py-2 text-meta text-muted-foreground">
                  {item.label}
                </dt>
                <dd className="min-w-0 flex-1 truncate px-3 py-2">
                  {item.key === 'totalSpent' ? (
                    <Money value={member.totalSpent} />
                  ) : item.key === 'balance' ? (
                    <Money value={member.balance} />
                  ) : item.key === 'points' ? (
                    <span className="tnum">{member.points.toLocaleString('zh-CN')}</span>
                  ) : item.key === 'couponCount' ? (
                    <span className="tnum">{(member.couponCount ?? 0).toLocaleString('zh-CN')}</span>
                  ) : item.key === 'birthday' ? (
                    <span className="tnum">{member.birthday || '—'}</span>
                  ) : (
                    <span>{member[item.key]}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>

          <div className="flex items-center gap-2">
            <StatusBadge status={MEMBER_LEVEL[member.level].tone}>
              {MEMBER_LEVEL[member.level].label}
            </StatusBadge>
            <span className="text-meta text-muted-foreground">{member.joinedLabel} 加入</span>
          </div>

          <Tabs defaultValue="orders">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="orders" className="text-ui">
                订单
              </TabsTrigger>
              <TabsTrigger value="points" className="text-ui">
                积分
              </TabsTrigger>
              <TabsTrigger value="balance" className="text-ui">
                余额
              </TabsTrigger>
              <TabsTrigger value="coupons" className="text-ui">
                优惠券
              </TabsTrigger>
            </TabsList>

            <TabsContent value="orders" className="mt-3">
              <DetailTable columns={['订单', '应付金额', '实付', '商品数量', '支付方式', '创建时间']}>
                {member.orders.length === 0 ? (
                  <DetailEmptyRow colSpan={6} />
                ) : (
                  member.orders.map((order) => (
                    <TableRow key={order.no} className="border-border/60 hover:bg-surface">
                      <TableCell className={DETAIL_CELL}>
                        <CopyableText text={order.no} textClassName="tnum" label="订单号" />
                      </TableCell>
                      <TableCell className={DETAIL_CELL}>
                        {order.orderAmount
                          ? `¥${order.orderAmount.toFixed(2)}`
                          : order.itemCount <= 0 && order.amount > 0
                            ? '会员充值'
                            : '—'}
                      </TableCell>
                      <TableCell className={DETAIL_CELL}>
                        <Money value={order.amount} />
                      </TableCell>
                      <TableCell className={cn(DETAIL_CELL, 'tnum')}>{order.itemCount}</TableCell>
                      <TableCell className={DETAIL_CELL}>
                        {order.payment ? MEMBER_PAYMENT[order.payment] : '—'}
                      </TableCell>
                      <TableCell className={cn(DETAIL_CELL, 'tnum text-muted-foreground')}>
                        {order.time}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </DetailTable>
            </TabsContent>

            <TabsContent value="points" className="mt-3">
              <DetailTable columns={['变动值', '变动类型', '变动原因', '变动时间']}>
                {member.pointRecords.length === 0 ? (
                  <DetailEmptyRow colSpan={4} />
                ) : (
                  member.pointRecords.map((record) => (
                    <TableRow key={record.id} className="border-border/60 hover:bg-surface">
                      <TableCell
                        className={cn(
                          DETAIL_CELL,
                          'tnum font-medium',
                          record.change > 0 ? 'text-success' : 'text-destructive'
                        )}
                      >
                        {record.change > 0 ? `+${record.change}` : record.change}
                      </TableCell>
                      <TableCell className={DETAIL_CELL}>{record.type ?? '—'}</TableCell>
                      <TableCell className={DETAIL_CELL}>{record.reason}</TableCell>
                      <TableCell className={cn(DETAIL_CELL, 'tnum text-muted-foreground')}>
                        {record.time}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </DetailTable>
            </TabsContent>

            <TabsContent value="balance" className="mt-3">
              <DetailTable columns={['变动值', '变动类型', '变动原因', '变动时间']}>
                {member.balanceRecords.length === 0 ? (
                  <DetailEmptyRow colSpan={4} />
                ) : (
                  member.balanceRecords.map((record) => (
                    <TableRow key={record.id} className="border-border/60 hover:bg-surface">
                      <TableCell
                        className={cn(
                          DETAIL_CELL,
                          'tnum font-medium',
                          record.change > 0 ? 'text-success' : 'text-destructive'
                        )}
                      >
                        {record.change > 0 ? `+${record.change}` : record.change}
                      </TableCell>
                      <TableCell className={DETAIL_CELL}>{record.typeText ?? '—'}</TableCell>
                      <TableCell className={DETAIL_CELL}>{record.reason}</TableCell>
                      <TableCell className={cn(DETAIL_CELL, 'tnum text-muted-foreground')}>
                        {record.time}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </DetailTable>
            </TabsContent>

            <TabsContent value="coupons" className="mt-3">
              <DetailTable
                columns={['优惠券描述', '优惠券值', '状态', '过期时间', '获取时间']}
              >
                {member.coupons.length === 0 ? (
                  <DetailEmptyRow colSpan={5} />
                ) : (
                  member.coupons.map((coupon) => {
                    const status = COUPON_STATUS[coupon.status]
                    return (
                      <TableRow key={coupon.id} className="border-border/60 hover:bg-surface">
                        <TableCell className={DETAIL_CELL}>{coupon.name}</TableCell>
                        <TableCell className={cn(DETAIL_CELL, 'tnum')}>{coupon.value}</TableCell>
                        <TableCell className={DETAIL_CELL}>
                          <StatusBadge status={status.tone}>{status.label}</StatusBadge>
                        </TableCell>
                        <TableCell className={cn(DETAIL_CELL, 'tnum text-muted-foreground')}>
                          {coupon.expiresAt}
                        </TableCell>
                        <TableCell className={cn(DETAIL_CELL, 'tnum text-muted-foreground')}>
                          {coupon.obtainedAt ?? '—'}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </DetailTable>
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <EmptyState
          icon={UserRound}
          title="会员不存在"
          description="该会员可能已被删除，请刷新列表后重试"
        />
      )}
    </SheetDrawer>
  )
}
