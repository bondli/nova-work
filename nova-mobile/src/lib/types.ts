/** 服务端字段的客户端视图模型（金额一律转成分） */

export type Role = 'admin' | 'clerk';

export interface SessionUser {
  id: string;
  name: string;
  realName: string | null;
  avatar: string | null;
  role: Role;
}

export interface LoginResult {
  token: string;
  expiresIn: number;
  user: SessionUser;
}

export interface Paged<T> {
  count: number;
  data: T[];
}

export interface InventoryRow {
  id: number;
  sn: string;
  sku: string;
  name: string;
  color: string | null;
  size: string | null;
  originalPrice: number | string | null;
  counts: number | null;
  saleCounts?: number | null;
  image?: string | null;
}

export interface StockRecord {
  id: number;
  sku: string;
  type: string;
  info: string | null;
  count: number;
  createdAt: string;
}

export interface MemberRow {
  phone: string;
  name: string | null;
  level: string | null;
  point: number | null;
  balance: number | null;
  actual?: number | string | null;
  createdAt?: string | null;
  birthday?: string | null;
  coupon?: number | null;
}

export interface CouponRow {
  id: number | string;
  couponDesc: string | null;
  couponCondition: number | null;
  couponValue: number;
  couponStatus: string;
  couponExpiredTime: string | null;
}

export interface ScoreRecord {
  id: number;
  point: number;
  type: string;
  reason: string | null;
  createdAt: string;
}

export interface BalanceRecord {
  id: number;
  value: number;
  type: string;
  reason: string | null;
  createdAt: string;
}

export interface OrderRow {
  id?: number;
  orderSn: string;
  createdAt: string;
  orderItems: number;
  originalAmount: number | string;
  orderAmount: number | string;
  orderActualAmount: number | string;
  payType: string;
  userPhone: string | null;
  useBalance: number | string | null;
  usePoint: number | string | null;
  useCoupon: number | string | null;
  salerId?: number | null;
  salerName: string | null;
  orderStatus: string;
  printStatus?: string | null;
  showStatus?: string | null;
  remark?: string | null;
}

export interface OrderItem {
  id: number;
  orderSn: string;
  sku: string;
  sn: string;
  name: string;
  color: string | null;
  size: string | null;
  originalPrice: number | string | null;
  discount: number | string | null;
  counts: number;
  actualPrice: number | string | null;
  status: string | null;
  brand?: string | null;
}

export interface CoreData {
  orderActualAmount: number;
  saledItemCount: number;
  orderCount: number;
  memberCount: number;
}

export interface InventorySummary {
  styleCount: number;
  stockTotal: number;
  soldTotal: number;
  brokenStyleCount: number;
}

export interface MemberSummary {
  total: number;
  superCount: number;
  balanceTotal: number;
}

export type PaymentMethod = 'wechat' | 'alipay' | 'cash' | 'card' | 'other';

/** 买单清单项：价格为分 */
export interface CartItem {
  id: string;
  sku: string;
  styleNo: string;
  name: string;
  color: string;
  size: string;
  priceCents: number;
  qty: number;
  /** 商品折扣，10 = 不打折 */
  discount: number;
}

export interface BuyMember {
  id: string;
  name: string;
  phone: string;
  level: string;
  points: number;
  balance: number;
  coupons: BuyCoupon[];
}

export interface BuyCoupon {
  id: string;
  name: string;
  threshold: number;
  amount: number;
  expiresAt: string;
}

export interface PricingResult {
  itemCount: number;
  originalCents: number;
  lineDiscountCents: number;
  couponDiscountCents: number;
  storeCouponDiscountCents: number;
  pointsDeductionCents: number;
  pointsUsed: number;
  balanceDeductionCents: number;
  totalDiscountCents: number;
  payableCents: number;
}

export interface PaymentReceipt {
  orderNo: string;
  payment: PaymentMethod;
  payableCents: number;
  receivedCents: number;
  changeCents: number;
  pointsEarned: number;
  balanceUsedCents: number;
  itemCount: number;
}

export interface Clerk {
  id: number;
  name: string;
  username?: string;
  realName?: string | null;
}

/** /data/getOrderCharts、/data/getSalerCharts 返回的月度营业额 */
export interface MonthlyChart {
  /** YYYY/MM */
  month: string;
  amounts: number;
  cost?: number;
  rate?: number;
}

/** /common/opLogs 操作日志 */
export interface OpLogRow {
  id: number;
  type: string;
  info: string | null;
  userId: string | null;
  userName?: string | null;
  userOS?: string | null;
  appVersion?: string | null;
  createdAt: string;
}
