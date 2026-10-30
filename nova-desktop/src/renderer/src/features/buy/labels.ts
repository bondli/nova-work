import type { MemberLevel } from '@shared/types/member'

/** 会员等级短文案，买单页会员卡使用 */
export const MEMBER_LEVEL_SHORT: Record<MemberLevel, string> = {
  normal: '普通',
  silver: '银卡',
  gold: '金卡',
  super: '超级'
}

/** 支付方式文案与订单页共用同一份定义，避免同一支付方式两套叫法 */
export { PAYMENT_LABEL as PAY_METHOD_LABEL, PAYMENT_OPTIONS as PAY_METHOD_OPTIONS } from '@renderer/lib/payment'
