import type { MemberLevel, MemberPayment } from '@shared/types/member'
import type { StatusTone } from '@renderer/components/common/StatusBadge'

/** 会员等级文案与徽标色，集中维护便于详情与列表复用 */
export const MEMBER_LEVEL: Record<MemberLevel, { label: string; tone: StatusTone }> = {
  normal: { label: '普通会员', tone: 'neutral' },
  silver: { label: '银卡会员', tone: 'brand' },
  gold: { label: '金卡会员', tone: 'warning' },
  super: { label: '超级会员', tone: 'success' }
}

/** 会员支付方式文案，会员订单与充值流水共用 */
export const MEMBER_PAYMENT: Record<MemberPayment, string> = {
  wechat: '微信',
  alipay: '支付宝',
  cash: '现金',
  card: '银行卡',
  other: '其他'
}
