import type { BuyCoupon, BuyMember, PaymentMethod, PricingResult } from '@shared/types/buy'
import { ChevronRight, CircleCheck, Loader2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import { StatusBadge } from '@renderer/components/common/StatusBadge'
import { formatMoney } from '@renderer/lib/format'
import { roundMoney } from '@renderer/lib/pricing'
import { cn } from '@renderer/lib/utils'
import { MEMBER_LEVEL } from '@renderer/features/members/labels'
import { MEMBER_LEVEL_SHORT, PAY_METHOD_OPTIONS } from './labels'

interface BuySidebarProps {
  member: BuyMember | null
  pricing: PricingResult
  /** 待售款数，账单明细按它判断是否需要展示 */
  cartCount: number
  selectedCoupon: BuyCoupon | null
  onSelectCoupon: (couponId: string | null) => void
  storeCoupons: BuyCoupon[]
  selectedStoreCoupon: BuyCoupon | null
  onSelectStoreCoupon: (couponId: string | null) => void
  usePoints: boolean
  onUsePointsChange: (value: boolean) => void
  useBalance: boolean
  onUseBalanceChange: (value: boolean) => void
  clerk: string
  clerks: Array<{ id: number; name: string }>
  onClerkChange: (value: string) => void
  note: string
  onNoteChange: (value: string) => void
  payment: PaymentMethod
  onPaymentChange: (value: PaymentMethod) => void
  received: string
  onReceivedChange: (value: string) => void
  submitting: boolean
  onConfirm: () => void
  onChangeMember: () => void
}

/** 生日是否落在当前月份，用于会员卡的「本月生日」红字提示 */
function isBirthdayMonth(birthday?: string | null): boolean {
  if (!birthday) return false
  const date = new Date(birthday)
  if (Number.isNaN(date.getTime())) return false
  return date.getMonth() === new Date().getMonth()
}

/** 会员卡：头像、等级、权益三宫格 */
function MemberCard({ member, onChangeMember }: { member: BuyMember | null; onChangeMember: () => void }) {
  return (
    <div className="shrink-0 rounded-xl border border-border bg-card p-4">
      {member ? (
        <>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-ui font-semibold text-primary">
              {member.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-body font-medium">{member.name}</p>
                <StatusBadge status={MEMBER_LEVEL[member.level].tone}>
                  {MEMBER_LEVEL_SHORT[member.level]}
                </StatusBadge>
                {isBirthdayMonth(member.birthday) ? (
                  <span className="shrink-0 text-caption font-medium text-destructive">
                    本月生日
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-meta text-muted-foreground">
                {member.phone} · 最近到店 {member.lastVisit}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onChangeMember}>
              更换
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-surface py-2">
              <p className="text-body font-semibold tnum">
                {member.points.toLocaleString('zh-CN')}
              </p>
              <p className="text-caption text-muted-foreground">积分</p>
            </div>
            <div className="rounded-lg bg-surface py-2">
              <p className="text-body font-semibold tnum">
                {formatMoney(member.balance, { decimals: 0 })}
              </p>
              <p className="text-caption text-muted-foreground">余额</p>
            </div>
            <div className="rounded-lg bg-surface py-2">
              <p className="text-body font-semibold tnum">{member.coupons.length}</p>
              <p className="text-caption text-muted-foreground">可用券</p>
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-ui text-muted-foreground">未选择会员，本单不享会员权益</p>
          <Button type="button" variant="outline" size="sm" onClick={onChangeMember}>
            选择会员
          </Button>
        </div>
      )}
    </div>
  )
}

interface CouponRowProps {
  /** 行标题：会员优惠券 / 店铺优惠券 */
  label: string
  coupons: BuyCoupon[]
  selected: BuyCoupon | null
  /** 比门槛用的折后金额 */
  baseAmount: number
  /** 无可用券时的提示文案 */
  emptyText: string
  onSelect: (couponId: string | null) => void
}

/** 优惠券选择行：会员券与店铺券共用，未选中显示「不使用」 */
function CouponRow({ label, coupons, selected, baseAmount, emptyText, onSelect }: CouponRowProps) {
  const eligible = selected !== null && baseAmount >= selected.threshold
  const valueLabel = selected
    ? eligible
      ? selected.name
      : `${selected.name}（未达门槛）`
    : '不使用'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center px-4 py-3 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span>{label}</span>
          <span
            className={cn('ml-auto text-ui', eligible ? 'text-primary' : 'text-muted-foreground')}
          >
            {valueLabel}
          </span>
          <ChevronRight className="ml-1 h-4 w-4 text-subtle" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[280px]">
        <DropdownMenuItem onSelect={() => onSelect(null)}>不使用</DropdownMenuItem>
        {coupons.length === 0 ? (
          <DropdownMenuItem disabled>{emptyText}</DropdownMenuItem>
        ) : (
          coupons.map((coupon) => (
            <DropdownMenuItem
              key={coupon.id}
              disabled={baseAmount < coupon.threshold}
              onSelect={() => onSelect(coupon.id)}
            >
              <div className="flex w-full items-center justify-between gap-3">
                <span>{coupon.name}</span>
                <span className="text-meta text-muted-foreground">
                  门槛 {formatMoney(coupon.threshold, { decimals: 0 })}
                </span>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** 权益与优惠：积分 / 余额开关、会员券 / 店铺券 */
function DiscountCard({
  member,
  pricing,
  selectedCoupon,
  onSelectCoupon,
  storeCoupons,
  selectedStoreCoupon,
  onSelectStoreCoupon,
  usePoints,
  onUsePointsChange,
  useBalance,
  onUseBalanceChange
}: Pick<
  BuySidebarProps,
  | 'member'
  | 'pricing'
  | 'selectedCoupon'
  | 'onSelectCoupon'
  | 'storeCoupons'
  | 'selectedStoreCoupon'
  | 'onSelectStoreCoupon'
  | 'usePoints'
  | 'onUsePointsChange'
  | 'useBalance'
  | 'onUseBalanceChange'
>) {
  const discountedTotal = pricing.originalTotal - pricing.lineDiscount

  return (
    <div className="shrink-0 divide-y divide-border/60 rounded-xl border border-border bg-card text-body">
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="shrink-0">积分抵扣</span>
        <span className="ml-auto text-meta text-muted-foreground">
          {member
            ? `可用 ${member.points.toLocaleString('zh-CN')} 分抵 ${formatMoney(member.points / 100)}`
            : '未选择会员'}
        </span>
        <Switch
          size="sm"
          checked={usePoints}
          disabled={!member}
          aria-label="积分抵扣"
          onCheckedChange={onUsePointsChange}
        />
      </div>

      <div className="flex items-center gap-2 px-4 py-3">
        <span className="shrink-0">余额抵扣</span>
        <span className="ml-auto text-meta text-muted-foreground">
          {member ? `可用 ${formatMoney(member.balance)}` : '未选择会员'}
        </span>
        <Switch
          size="sm"
          checked={useBalance}
          disabled={!member}
          aria-label="余额抵扣"
          onCheckedChange={onUseBalanceChange}
        />
      </div>

      {/* 券文案对齐老系统 MemberCoupon / StoreCoupon */}
      <CouponRow
        label="会员优惠券"
        coupons={member?.coupons ?? []}
        selected={selectedCoupon}
        baseAmount={discountedTotal}
        emptyText="暂无可用优惠券"
        onSelect={onSelectCoupon}
      />

      <CouponRow
        label="店铺优惠券"
        coupons={storeCoupons}
        selected={selectedStoreCoupon}
        baseAmount={discountedTotal}
        emptyText="暂无可用店铺优惠券"
        onSelect={onSelectStoreCoupon}
      />
    </div>
  )
}

interface BillRow {
  key: string
  label: string
  /** 已格式化的金额 / 数值文案 */
  value: string
  /** 抵扣行用红色负数样式 */
  deduct: boolean
}

/**
 * 账单明细：订单应收 / 订单应付 + 逐层抵扣链路。
 * 应收、应付放在明细里，收银员能一眼看到从应收扣到应付的过程。
 */
function BillInfoCard({
  member,
  cartCount,
  pricing
}: Pick<BuySidebarProps, 'member' | 'cartCount' | 'pricing'>) {
  if (!cartCount) return null

  const receivable = roundMoney(pricing.originalTotal - pricing.lineDiscount)
  const rows: BillRow[] = []

  if (pricing.storeCouponDiscount > 0) {
    rows.push({
      key: 'storeCoupon',
      label: '使用店铺优惠券抵扣:',
      value: `-${formatMoney(pricing.storeCouponDiscount)}`,
      deduct: true
    })
  }
  if (pricing.pointsDeduction > 0) {
    rows.push({
      key: 'points',
      label: `使用(${pricing.pointsUsed})积分抵扣:`,
      value: `-${formatMoney(pricing.pointsDeduction)}`,
      deduct: true
    })
  }
  if (pricing.balanceDeduction > 0) {
    rows.push({
      key: 'balance',
      label: `使用(${formatMoney(pricing.balanceDeduction)})余额抵扣:`,
      value: `-${formatMoney(pricing.balanceDeduction)}`,
      deduct: true
    })
  }
  if (pricing.couponDiscount > 0) {
    rows.push({
      key: 'memberCoupon',
      label: '使用会员优惠券抵扣:',
      value: `-${formatMoney(pricing.couponDiscount)}`,
      deduct: true
    })
  }

  if (member && pricing.payable > 1) {
    rows.push({
      key: 'earned',
      label: '本次获得积分:',
      value: String(Math.floor(pricing.payable)),
      deduct: false
    })
  }

  return (
    <div className="shrink-0 rounded-xl border border-border bg-card text-body">
      <p className="border-b border-border/60 px-4 py-2.5 text-ui font-medium">账单明细</p>
      <ul className="divide-y divide-border/60">
        <li className="flex items-center px-4 py-3">
          <span className="text-muted-foreground">订单应收</span>
          <span className="ml-auto tnum">{formatMoney(receivable)}</span>
        </li>
        {rows.map((row) => (
          <li key={row.key} className="flex items-center px-4 py-3">
            <span className="text-muted-foreground">{row.label}</span>
            <span className={cn('ml-auto tnum', row.deduct && 'text-destructive')}>
              {row.value}
            </span>
          </li>
        ))}
        <li className="flex items-center px-4 py-3">
          <span className="font-medium">订单应付</span>
          <span className="ml-auto text-title font-semibold tnum">
            {formatMoney(pricing.payable)}
          </span>
        </li>
      </ul>
    </div>
  )
}

/** 收款信息：支付方式、实收、导购员、备注同组展示，行内左右结构 */
function PaymentInfoCard({
  payment,
  onPaymentChange,
  received,
  onReceivedChange,
  clerk,
  clerks,
  onClerkChange,
  note,
  onNoteChange
}: Pick<
  BuySidebarProps,
  | 'payment'
  | 'onPaymentChange'
  | 'received'
  | 'onReceivedChange'
  | 'clerk'
  | 'clerks'
  | 'onClerkChange'
  | 'note'
  | 'onNoteChange'
>) {
  return (
    <div className="shrink-0 space-y-2.5 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="w-14 shrink-0 text-ui text-muted-foreground">支付方式</span>
        <Select
          value={payment}
          onValueChange={(value) => onPaymentChange(value as PaymentMethod)}
        >
          <SelectTrigger className="h-9 min-w-0 flex-1 text-ui" aria-label="支付方式">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAY_METHOD_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-ui">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <span className="w-14 shrink-0 text-ui text-muted-foreground">实收</span>
        <Input
          className="h-9 min-w-0 flex-1 text-right text-ui tnum"
          inputMode="decimal"
          aria-label="实收金额"
          value={received}
          onChange={(event) => onReceivedChange(event.target.value)}
        />
      </div>

      <div className="flex items-center gap-3">
        <span className="w-14 shrink-0 text-ui text-muted-foreground">导购员</span>
        <Select value={clerk} onValueChange={onClerkChange}>
          <SelectTrigger className="h-9 min-w-0 flex-1 text-ui" aria-label="导购员">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {clerks.map((item) => (
              <SelectItem key={item.id} value={item.name} className="text-ui">
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <span className="w-14 shrink-0 text-ui text-muted-foreground">备注</span>
        <Input
          className="h-9 min-w-0 flex-1 text-ui"
          placeholder="选填，将随订单保存"
          aria-label="订单备注"
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
        />
      </div>
    </div>
  )
}

/** 确认收款：独立底部按钮 */
function ConfirmButton({
  submitting,
  onConfirm
}: Pick<BuySidebarProps, 'submitting' | 'onConfirm'>) {
  return (
    <Button
      type="button"
      className="h-11 w-full shrink-0 text-body"
      disabled={submitting}
      onClick={onConfirm}
    >
      {submitting ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <CircleCheck className="h-4 w-4" aria-hidden="true" />
      )}
      {submitting ? '正在提交…' : '确认收款'}
    </Button>
  )
}

/** 收银台右侧栏：会员、权益、账单明细、收款信息、确认收款 */
export function BuySidebar(props: BuySidebarProps) {
  return (
    <aside className="flex w-[360px] shrink-0 flex-col gap-3 overflow-y-auto">
      <MemberCard member={props.member} onChangeMember={props.onChangeMember} />
      <DiscountCard
        member={props.member}
        pricing={props.pricing}
        selectedCoupon={props.selectedCoupon}
        onSelectCoupon={props.onSelectCoupon}
        storeCoupons={props.storeCoupons}
        selectedStoreCoupon={props.selectedStoreCoupon}
        onSelectStoreCoupon={props.onSelectStoreCoupon}
        usePoints={props.usePoints}
        onUsePointsChange={props.onUsePointsChange}
        useBalance={props.useBalance}
        onUseBalanceChange={props.onUseBalanceChange}
      />
      <BillInfoCard member={props.member} cartCount={props.cartCount} pricing={props.pricing} />
      <PaymentInfoCard
        payment={props.payment}
        onPaymentChange={props.onPaymentChange}
        received={props.received}
        onReceivedChange={props.onReceivedChange}
        clerk={props.clerk}
        clerks={props.clerks}
        onClerkChange={props.onClerkChange}
        note={props.note}
        onNoteChange={props.onNoteChange}
      />
      <ConfirmButton submitting={props.submitting} onConfirm={props.onConfirm} />
    </aside>
  )
}
