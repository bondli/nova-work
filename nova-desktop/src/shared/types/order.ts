/**
 * 订单域共享类型。
 * 字段与文案对齐老系统 apps/web/src/pages/Order：列表列、详情、修改订单、对账。
 */

/** 支付方式，与老系统 payType 一致 */
export type PaymentMethod = 'wechat' | 'alipay' | 'cash' | 'card' | 'other'

/** 订单状态：已完成 / 已退款 / 换货中 */
export type OrderStatus = 'completed' | 'refunded' | 'exchanging'

/** 订单内商品行状态，对齐老系统 OrderItems.status */
export type OrderItemStatus = 'normal' | 'refund' | 'exchangein'

/** 订单内商品行 */
export interface OrderItem {
  id: string
  name: string
  /** 款号 */
  styleNo: string
  sku: string
  color: string
  size: string
  /** 吊牌价 */
  originalPrice: number
  /** 实付金额（老系统 actualPrice） */
  price: number
  /** 折扣，100 表示无折扣 */
  discount: number
  quantity: number
  itemStatus: OrderItemStatus
}

/** 订单优惠券行 */
export interface OrderCouponRow {
  id: string
  couponId: number
  couponDesc: string
  /** store 店铺优惠券 / member 会员优惠券 */
  couponType: 'store' | 'member'
  usedValue: number
  usedTime: string
}

/** 订单主体 */
export interface Order {
  id: number
  no: string
  /** 下单时间，格式 YYYY-MM-DD HH:mm */
  paidAt: string
  items: OrderItem[]
  /** 商品数量 */
  itemCount: number
  /** 吊牌价合计 */
  goodsAmount: number
  /** 应付金额 */
  payable: number
  /** 优惠金额 */
  discount: number
  /** 优惠券抵扣 */
  coupon: number
  /** 使用积分 */
  usePoint: number
  /** 会员余额抵扣 */
  balanceUsed: number
  /** 实付金额 */
  amount: number
  payment: PaymentMethod
  /** 导购姓名 */
  clerk: string
  /** 导购账号名（用户表 name 字段），小票打印使用 */
  clerkAccount?: string
  /** 导购 ID，修改订单时需要回填 */
  clerkId: number | null
  /** 订单状态：已完成 / 已退款 / 换货中 */
  status: OrderStatus
  /** 是否已完成对账：已对账的订单只允许修改备注 */
  checked: boolean
  printed: boolean
  remark: string
  memberName?: string
  memberPhone?: string
  /** 是否为会员充值单（orderType=income） */
  isRecharge?: boolean
  /** 订单使用的优惠券，仅详情接口返回 */
  coupons?: OrderCouponRow[]
}

/** 订单列表查询条件，对齐老系统 search schema */
export interface OrderFilters {
  /** 订单号 */
  orderSn: string
  /** 会员手机号 */
  memberPhone: string
  /** 开始日期 YYYY-MM-DD */
  start: string
  /** 结束日期 YYYY-MM-DD */
  end: string
  /** 导购员 ID，空串表示全部 */
  clerk: string
  payment: PaymentMethod | 'all'
  page: number
  pageSize: number
}

/** 当前筛选区间的汇总，供顶部指标卡使用 */
export interface OrderSummary {
  orderCount: number
  itemCount: number
  amount: number
  balanceUsed: number
  recharge: number
}

export interface OrderListResult {
  rows: Order[]
  /** 满足筛选条件的总单数 */
  total: number
  summary: OrderSummary
  /** 上一个等长区间的汇总，用于计算指标卡环比 */
  previous: OrderSummary
}

/** 对账行，对齐老系统 CheckBill 列 */
export interface ReconcileRow {
  no: string
  amount: number
  payment: PaymentMethod
  memberPhone: string
  /** 对账状态：已对账 / 未对账 */
  done: boolean
  /** 打印状态 */
  printed: boolean
  /** 有效状态：hidden 无效 / normal 正常 */
  hidden: boolean
  /** 确认时间，未确认时为空 */
  confirmedAt?: string
}

/** 修改订单提交字段，对齐老系统 Order/Editor schema */
export interface OrderModifyInput {
  orderId: number
  orderSn: string
  payType: string
  orderActualAmount: number
  salerId: number
  userPhone: string
  remark: string
}

/** 订单商品明细行：按订单 + 商品展开，对齐老系统 OrderItemList */
export interface OrderGoodsRow {
  orderNo: string
  /** 订单实付金额 */
  orderAmount: number
  /** 条码 */
  sku: string
  /** 数量 */
  quantity: number
  itemStatus: OrderItemStatus
  /** 吊牌价 */
  originalPrice: number
  /** 商品实付金额 */
  actualPrice: number
  color: string
  size: string
}
