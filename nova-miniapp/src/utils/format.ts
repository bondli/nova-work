// 金额 / 积分 / 时间 / 订单状态的展示格式化，页面只调用这里
export const formatMoney = (value: number | null | undefined): string =>
  `¥${Number(value ?? 0).toFixed(2)}`

export const formatAmount = (value: number | null | undefined): string =>
  Number(value ?? 0).toFixed(2)

export const formatPoints = (value: number | null | undefined): string =>
  `${Number(value ?? 0).toLocaleString('zh-CN')}`

export const formatPhone = (phone: string | null | undefined): string => {
  if (!phone) return ''
  const clean = phone.replace(/\s+/g, '')
  // 11 位手机号按 3-4-4 分组，会员卡与资料浮层保持一致
  return clean.length === 11 ? `${clean.slice(0, 3)} ${clean.slice(3, 7)} ${clean.slice(7)}` : phone
}

export const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return ''
  return value.replace('T', ' ').slice(0, 16)
}

export const formatDate = (value: string | null | undefined): string => {
  if (!value) return ''
  return value.slice(0, 10)
}

// 支付方式文案与桌面端 lib/payment.ts 保持一致（weixin 是服务端落库值，wechat 为兼容旧数据）
const PAY_TYPE_LABEL: Record<string, string> = {
  weixin: '微信',
  wechat: '微信',
  wx: '微信',
  alipay: '支付宝',
  cash: '现金',
  card: '银行卡',
  other: '其他'
}

export const formatPayType = (payType: string | null | undefined): string =>
  PAY_TYPE_LABEL[payType ?? ''] ?? '其他'

// 会员等级展示：normal → 店铺VIP，super → 超级会员
const MEMBER_LEVEL_LABEL: Record<string, string> = {
  normal: '店铺VIP',
  super: '超级会员'
}

export const memberLevelLabel = (level: string | null | undefined): string =>
  MEMBER_LEVEL_LABEL[level ?? ''] ?? '会员'

// 订单只区分是否已对账，展示上按「已完成 / 进行中」处理
export const orderStatusLabel = (orderStatus: string | null | undefined): string =>
  orderStatus === 'checked' ? '已完成' : '进行中'

export const alreadySignedText = (todaySigned: boolean): string =>
  todaySigned ? '今日已签到' : '立即签到'
