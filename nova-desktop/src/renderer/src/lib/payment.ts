import type { PaymentMethod } from '@shared/types/order'

/**
 * 支付方式统一文案：订单、买单、会员充值共用同一份定义，
 * 避免各页面各自硬编码导致同一支付方式出现「微信支付 / 微信」两种叫法。
 */
export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  wechat: '微信',
  alipay: '支付宝',
  cash: '现金',
  card: '银行卡',
  other: '其他'
}

/** 下拉选项，顺序与老系统一致 */
export const PAYMENT_OPTIONS = (Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((value) => ({
  value,
  label: PAYMENT_LABEL[value]
}))
