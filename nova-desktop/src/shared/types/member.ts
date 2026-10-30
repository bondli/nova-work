/**
 * 会员域共享类型。
 * 现阶段由渲染层 mock 数据填充，后续接入 nova-pos-server 时字段保持不变。
 */

/** 会员等级 */
export type MemberLevel = 'normal' | 'silver' | 'gold' | 'super'

/** 支付方式，与充值弹窗一致 */
export type MemberPayment = 'wechat' | 'alipay' | 'cash' | 'card' | 'other'

/** 会员订单摘要，用于详情抽屉 */
export interface MemberOrder {
  no: string
  /** 下单时间，MM-DD HH:mm */
  time: string
  itemCount: number
  /** 应付金额 */
  orderAmount?: number
  /** 实付金额 */
  amount: number
  payment?: MemberPayment
}

/** 积分流水 */
export interface PointRecord {
  id: string
  time: string
  /** 变动积分，正为获得、负为抵扣 */
  change: number
  /** 服务端变动类型，如 manualAdd / income */
  type?: string
  reason: string
}

/** 余额流水 */
export interface BalanceRecord {
  id: string
  time: string
  /** 变动金额，正为充值、负为消费 */
  change: number
  type: 'recharge' | 'consume'
  /** 服务端变动类型文案，如 消费 / 充值赠送 */
  typeText?: string
  reason: string
}

/** 会员优惠券 */
export interface MemberCoupon {
  id: string
  /** 优惠券描述，如「满 300 减 50」 */
  name: string
  /** 优惠券面额 */
  value: string
  expiresAt: string
  /** 获取时间 */
  obtainedAt?: string
  status: 'available' | 'used' | 'expired'
}

/** 会员主体 */
export interface Member {
  id: string
  name: string
  phone: string
  level: MemberLevel
  points: number
  balance: number
  /** 实付（累计消费） */
  totalSpent: number
  orderCount: number
  /** 最近到店，MM/DD */
  lastVisit: string
  /** 生日 YYYY-MM-DD */
  birthday?: string
  /** 优惠券张数 */
  couponCount?: number
  /** 创建时间 YYYY-MM-DD HH:mm */
  createdAt?: string
  /** 加入日期 YYYY-MM-DD，用于创建时间筛选 */
  joinedAt: string
  /** 加入月份展示，如 2021-06 */
  joinedLabel: string
  /** 头像底色 */
  colorHex: string
  orders: MemberOrder[]
  pointRecords: PointRecord[]
  balanceRecords: BalanceRecord[]
  coupons: MemberCoupon[]
}

/** 会员列表查询条件，文案与老系统一致：创建时间 / 手机号 / 会员等级 / 本月生日 / 排序 */
export interface MemberFilters {
  /** 手机号，模糊匹配 */
  phone: string
  level: MemberLevel | 'all'
  /** 本月生日：空为不限 / 0 否 / 1 是 */
  monthBirthday: '' | '0' | '1'
  /** 排序：空串为默认创建时间倒序，如 "point desc" / "balance asc" */
  orderby: string
  /** 开始日期 YYYY-MM-DD */
  start: string
  /** 结束日期 YYYY-MM-DD */
  end: string
  page: number
  pageSize: number
}

/** 会员概览指标，按全量数据统计 */
export interface MemberSummary {
  total: number
  superCount: number
  balanceTotal: number
}

export interface MemberListResult {
  rows: Member[]
  total: number
  summary: MemberSummary
}

/** 会员充值提交参数 */
export interface RechargeInput {
  memberId: string
  /** 充值金额 */
  amount: number
  /** 赠送金额 */
  gift: number
  payment: MemberPayment
  /** 变动原因，填写后优先作为流水原因 */
  remark: string
  /** 赠送类型：现金余额 / 商品吊牌价值，默认现金余额 */
  sendValueType?: 'balance' | 'goodsValue'
  /** 成单导购员 */
  salerId?: number
  salerName?: string
}

/** 新增会员提交参数 */
export interface NewMemberInput {
  phone: string
  name: string
  birthday: string
}

/** 会员基本信息更新参数 */
export interface MemberProfileInput {
  phone: string
  name: string
  birthday: string
}

/** 会员积分手动调整参数 */
export interface MemberPointInput {
  phone: string
  /** 变动积分，恒为正数；方向由 type 决定 */
  changePoint: number
  type: 'manualAdd' | 'manualReduce'
  reason: string
}

/** 会员余额手动调整参数 */
export interface MemberBalanceInput {
  phone: string
  /** 变动金额，恒为正数；方向由 type 决定 */
  changeBalance: number
  type: 'manualAdd' | 'manualReduce'
  reason: string
}
