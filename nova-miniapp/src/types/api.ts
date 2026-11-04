// `/mini/*` 接口契约类型：与服务端返回字段一一对应，页面不做就地类型转换
export interface MemberSummary {
  phone: string
  name: string
  birthday: string | null
  level: string
  /** 积分 */
  point: number
  /** 店内余额 */
  balance: number
  /** 可用优惠券张数 */
  coupon: number
  /** 累计到店实付 */
  actual: number
}

export interface HomeBanner {
  tag: string
  title: string
  desc: string
  cta: string
  image: string
  link?: string
}

export interface HomeCategory {
  name: string
  size: string
  image: string
}

export interface BrandStory {
  title: string
  slogan: string
  desc: string
  images: string[]
  stats: Array<{ value: string; label: string }>
}

export interface HomeProduct {
  tag: string
  name: string
  desc: string
  price: string
  originPrice: string
  image: string
  /** 关联库存款号，商详页据此获取 SKU 列表 */
  sn?: string
  /** 商详页详描图 */
  detailImages?: string[]
}

/** 首页「本季新品」点击配置 */
export interface HomeProductDetail {
  enabled: boolean
  path: string
}

/** 商详页 SKU */
export interface ProductSku {
  sku: string
  color: string
  size: string
  stock: number
  originalPrice: number
}

/** 商详页数据：按款号获取 */
export interface ProductDetail {
  sn: string
  name: string
  brand: string
  price: string
  originPrice: string
  image: string
  detailImages: string[]
  skus: ProductSku[]
}

export interface StoreInfo {
  name: string
  address: string
  phone: string
  hours: string
  lat: number
  lng: number
  image: string
}

export interface HomeData {
  brand: { name: string; sublabel: string }
  banners: HomeBanner[]
  categories: HomeCategory[]
  brandStory: BrandStory
  products: HomeProduct[]
  productDetail?: HomeProductDetail
  store: StoreInfo
}

export interface MarketingRecord {
  id: number
  marketingName: string
  marketingDesc: string | null
  marketingType: string
  marketingCondition: number
  marketingValue: number
  startTime: string
  endTime: string
}

/** 活动详情页的优惠券（来自店铺券 StoreCoupon） */
export interface ActivityCoupon {
  id: number
  desc: string
  condition: number | null
  value: number
  /** 有效期截止日，无固定有效期时为 null */
  expiredTime: string | null
  expired: boolean
  /** 当前登录会员是否已领取 */
  claimed: boolean
}

export interface ActivityDetail {
  id: number
  name: string
  description: string
  theme: string | null
  image: string
  type: string
  condition: number
  value: number
  startTime: string | null
  endTime: string | null
  coupons: ActivityCoupon[]
}

export interface OrderRecord {
  id: number
  orderSn: string
  orderStatus: string
  orderItems: number
  originalAmount: number
  orderAmount: number
  orderActualAmount: number
  payType: string
  useCoupon: number
  useBalance: number
  createdAt: string
}

export interface OrderItemRecord {
  id: number
  sn: string
  sku: string
  name: string
  color: string
  size: string
  originalPrice: number
  actualPrice: number
  counts: number
  orderSn: string
  status: string
}

export interface OrderDetail {
  order: OrderRecord
  items: OrderItemRecord[]
}

export interface PointLog {
  id: number
  point: number
  type: string
  reason: string
  createdAt: string
}

export interface BalanceLog {
  id: number
  value: number
  type: string
  reason: string
  createdAt: string
}

export interface CouponRecord {
  id: number
  couponId: string
  couponCondition: number | null
  couponDesc: string | null
  couponValue: number
  couponStatus: string
  couponExpiredTime: string | null
}

export interface DrawCouponSnapshot {
  couponId: string
  condition: number
  value: number
  desc: string
  validDays: number
}

/** 抽奖记录 extra：列表接口已解析为对象，创建记录时可能仍是 JSON 字符串 */
export interface DrawRecordExtra {
  requestId?: string
  cost?: number
  prizeId?: number | null
  prizeType?: PrizeType
  pointsAdded?: number
  coupon?: DrawCouponSnapshot | null
}

export interface DrawRecord {
  id: number
  info: string
  award: string
  extra: DrawRecordExtra | string | null
  createdAt: string
}

export type PrizeType = 'none' | 'points' | 'coupon'

export interface LotteryPrize {
  id: number
  name: string
  prizeType: PrizeType
  points: number
  couponCondition: number | null
  couponValue: number | null
}

export interface LotteryConfig {
  cost: number
  dailyLimit: number
  todayCount: number
  points: number
  prizes: LotteryPrize[]
}

export interface DrawResult {
  prize: string
  prizeType: PrizeType
  pointsAdded: number
  coupon: DrawCouponSnapshot | null
  cost: number
  totalPoints: number
  todayCount: number
  record: DrawRecord
}

export interface ReceiveReward {
  day: number
  points: number
  signed: boolean
  today: boolean
}

export interface SignInStatus {
  todaySigned: boolean
  streakDays: number
  totalPoints: number
  rewards: ReceiveReward[]
  signedDates: string[]
}

export interface SignInResult {
  todaySigned: boolean
  streakDays: number
  addedPoints: number
  totalPoints: number
  rewards: ReceiveReward[]
  already?: boolean
}

export interface RedeemItem {
  id: number
  name: string
  image: string
  description: string
  detail: string | null
  points: number
  totalStock: number
  stock: number
  perMemberLimit: number
  remainStock: number
  canRedeem: boolean
  perMemberLeft: number
  redeemedCount: number
}

export interface RedeemOrder {
  id: number
  orderNo: string
  itemName: string
  itemImage: string
  points: number
  status: 'pending_pickup' | 'picked' | 'cancelled' | 'expired'
  pickupCode: string
  expiredAt: string
  createdAt: string
}

export interface PageResult<T> {
  list: T[]
  count: number
}
