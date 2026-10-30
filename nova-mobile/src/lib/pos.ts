/** 业务数据访问层：全部走 nova-pos-server，不直连任何数据库 */
import { ApiError, apiGet, apiPost } from './api';
import { toCents, toYuan } from './money';
import type {
  BuyCoupon,
  BuyMember,
  CartItem,
  Clerk,
  CouponRow,
  InventoryRow,
  MemberRow,
  OrderItem,
  OrderRow,
  Paged,
  PaymentMethod,
  PaymentReceipt,
  PricingResult,
  ScoreRecord,
  StockRecord,
  BalanceRecord,
  MonthlyChart,
  OpLogRow,
} from './types';

const LEVELS = ['normal', 'silver', 'gold', 'super'];

const PAYMENT_TO_SERVER: Record<PaymentMethod, string> = {
  wechat: 'weixin',
  alipay: 'alipay',
  cash: 'cash',
  card: 'card',
  other: 'other',
};

/** 扫码 / 输入款号查商品：先精确 SKU，再按款号命中同款任一有货 SKU */
export async function lookupProduct(keyword: string): Promise<InventoryRow> {
  const value = keyword.trim();
  if (!value) throw new ApiError('请输入款号或 SKU');

  let item: InventoryRow | null = null;
  try {
    item = await apiGet<InventoryRow | null>('/inventory/queryDetailBySku', { sku: value });
  } catch {
    item = null;
  }

  if (!item?.sku) {
    const list = await apiGet<Paged<InventoryRow>>('/inventory/queryList', {
      sn: value,
      pageSize: 10,
      current: 1,
    });
    const candidates = list.data ?? [];
    item = candidates.find((row) => (row.counts ?? 0) > 0) ?? candidates[0] ?? null;
  }

  if (!item?.sku) throw new ApiError('未找到该款号或 SKU，请核对后重试');
  if ((item.counts ?? 0) <= 0) throw new ApiError(`SKU ${item.sku} 库存不足`);
  return item;
}

export function toLevel(level: string | null): string {
  return LEVELS.includes(level ?? '') ? (level as string) : 'normal';
}

function toCoupon(row: CouponRow): BuyCoupon {
  return {
    id: String(row.id),
    name: row.couponDesc || `¥${row.couponValue} 优惠券`,
    threshold: row.couponCondition ?? 0,
    amount: row.couponValue,
    expiresAt: (row.couponExpiredTime ?? '').slice(0, 10),
  };
}

/** 按关键字搜索会员，供收银台选择 */
export async function searchMembers(keyword: string): Promise<MemberRow[]> {
  const list = await apiGet<Paged<MemberRow>>('/member/list', {
    keyword: keyword.trim() || undefined,
    pageSize: 20,
    current: 1,
  });
  return list.data ?? [];
}

/** 收银台会员：积分、余额与可用券 */
export async function loadBuyMember(phone: string): Promise<BuyMember | null> {
  const [member, coupons] = await Promise.all([
    apiGet<MemberRow>('/member/detail', { phone }),
    apiGet<Paged<CouponRow>>('/member/queryCouponList', { phone }),
  ]);
  if (!member?.phone) return null;

  const available = (coupons.data ?? [])
    .filter((coupon) => coupon.couponStatus === 'active')
    .filter(
      (coupon) => !coupon.couponExpiredTime || new Date(coupon.couponExpiredTime).getTime() >= Date.now(),
    )
    .map(toCoupon);

  return {
    id: member.phone,
    name: member.name && member.name !== member.phone ? member.name : '未命名',
    phone: member.phone,
    level: toLevel(member.level),
    points: member.point ?? 0,
    balance: Number(member.balance ?? 0),
    coupons: available,
  };
}

/** 按当前应收金额查询可用店铺券（服务端已按门槛过滤） */
export async function loadStoreCoupons(amountCents: number): Promise<BuyCoupon[]> {
  if (amountCents <= 0) return [];
  const rows = await apiGet<CouponRow[]>('/buy/getStoreCoupon', { amount: toYuan(amountCents) });
  return (rows ?? []).map(toCoupon);
}

/** 导购员列表：管理员可读；导购员账号降级为本人 */
export async function loadClerks(fallback: { id: string; name: string }): Promise<Clerk[]> {
  try {
    const list = await apiGet<
      Paged<{ id: number; name: string; realName?: string | null; role?: string; status?: string }>
    >('/user/list');
    // 与桌面端一致：导购员下拉只保留在职的普通导购，剔除管理员与已停用账号
    const data = (list.data ?? []).filter(
      (row) => row.role !== 'admin' && row.status !== 'disabled',
    );
    if (data.length > 0) {
      return data.map((row) => ({ id: row.id, name: row.realName || row.name }));
    }
  } catch {
    // 导购员无 /user/list 权限，按本人兜底
  }
  return [{ id: Number(fallback.id) || 0, name: fallback.name }];
}

export interface SaleInput {
  cart: CartItem[];
  member: BuyMember | null;
  pricing: PricingResult;
  payment: PaymentMethod;
  receivedCents: number;
  clerk: { id: number; name: string };
  note: string;
  memberCouponId: string | null;
  storeCoupon: BuyCoupon | null;
}

/** 提交订单：服务端写入订单、商品、库存流水与会员资产 */
export async function submitSale(input: SaleInput): Promise<PaymentReceipt> {
  const buyer = input.member
    ? {
        phone: input.member.phone,
        usePoint: input.pricing.pointsUsed,
        useBalance: toYuan(input.pricing.balanceDeductionCents),
        useCoupon: input.pricing.couponDiscountCents / 100,
        useCouponId: input.memberCouponId ? Number(input.memberCouponId) : null,
      }
    : {};

  const body = {
    buyer,
    storeSaler: input.clerk,
    waitSales: {
      brief: {
        counts: input.pricing.itemCount,
        totalAmount: toYuan(input.pricing.originalCents),
        payAmount: toYuan(input.pricing.originalCents - input.pricing.lineDiscountCents),
        actualAmount: toYuan(input.pricing.payableCents),
        payType: PAYMENT_TO_SERVER[input.payment],
        remark: input.note.trim(),
      },
      list: input.cart.map((item) => ({
        sn: item.styleNo,
        sku: item.sku,
        name: item.name,
        color: item.color,
        size: item.size,
        originalPrice: toYuan(item.priceCents),
        counts: item.qty,
        actualPrice: toYuan(Math.round((item.priceCents * item.discount) / 10)),
      })),
    },
    storeCoupons: input.storeCoupon
      ? [
          {
            id: Number(input.storeCoupon.id),
            couponValue: input.storeCoupon.amount,
            couponDesc: input.storeCoupon.name,
          },
        ]
      : [],
  };

  const order = await apiPost<{ orderSn: string; orderActualAmount: number }>('/buy/submit', body);
  if (!order?.orderSn) throw new ApiError('下单失败，请稍后重试');

  const payableCents = toCents(order.orderActualAmount);
  return {
    orderNo: order.orderSn,
    payment: input.payment,
    payableCents,
    receivedCents: input.receivedCents,
    changeCents: Math.max(0, input.receivedCents - payableCents),
    pointsEarned: Math.floor(payableCents / 100),
    balanceUsedCents: input.pricing.balanceDeductionCents,
    itemCount: input.pricing.itemCount,
  };
}

/* ---------------- 订单 ---------------- */

export interface OrderQuery {
  start?: string;
  end?: string;
  orderSn?: string;
  userPhone?: string;
  current?: number;
  pageSize?: number;
}

export async function queryOrders(query: OrderQuery): Promise<Paged<OrderRow>> {
  return apiGet<Paged<OrderRow>>('/order/queryList', { ...query, orderType: 'normal' });
}

export async function queryOrderItems(orderSn: string): Promise<OrderItem[]> {
  const result = await apiGet<Paged<OrderItem>>('/order/queryItemList', { orderSn });
  return result.data ?? [];
}

export async function queryOrderDetail(orderSn: string): Promise<OrderRow | null> {
  const row = await apiGet<OrderRow | null>('/order/queryDetail', { orderSn });
  return row?.orderSn ? row : null;
}

/** 修改订单：对齐桌面端 POST /order/modify?orderId= */
export async function modifyOrder(input: {
  orderId: number;
  orderSn: string;
  payType: string;
  orderActualAmount: number;
  salerId: number;
  userPhone: string;
  remark: string;
}): Promise<void> {
  await apiPost(
    '/order/modify',
    {
      orderSn: input.orderSn,
      payType: input.payType,
      orderActualAmount: input.orderActualAmount,
      salerId: input.salerId,
      userPhone: input.userPhone,
      remark: input.remark,
    },
    { orderId: input.orderId },
  );
}

export async function updatePrintStatus(orderSn: string, printed: boolean): Promise<void> {
  await apiPost('/order/updatePrintStatus', { orderSn, printStatus: printed ? 'printed' : 'unprint' });
}

export async function refundOrder(input: {
  orderSn: string;
  refundItems: { id: number; sku: string; counts: number }[];
  refundAmount: number;
  /** money = 原路退款；balance = 退回会员余额 */
  amountType: 'money' | 'balance';
}): Promise<void> {
  await apiPost('/order/refundItem', input);
}

export async function changeOrder(input: {
  orderSn: string;
  returnItems: { id: number; sku: string; counts: number; originalPrice?: number; actualPrice?: number }[];
  exchangeItems: {
    sku: string;
    sn: string;
    name: string;
    color: string;
    size: string;
    originalPrice: number;
    counts: number;
  }[];
  exchangeAmount: number;
  amountType: 'none' | 'add' | 'sub';
  refundBalance: boolean;
}): Promise<void> {
  await apiPost('/order/changeItem', input);
}

/* ---------------- 库存 ---------------- */

export async function queryInventory(keyword: string, current = 1, pageSize = 20): Promise<Paged<InventoryRow>> {
  return apiGet<Paged<InventoryRow>>('/inventory/queryList', {
    keyword: keyword.trim() || undefined,
    current,
    pageSize,
  });
}

export async function queryInventoryDetail(sku: string): Promise<InventoryRow> {
  return apiGet<InventoryRow>('/inventory/queryDetailBySku', { sku });
}

export async function queryInventoryByStyle(sn: string): Promise<InventoryRow[]> {
  const result = await apiGet<Paged<InventoryRow> | InventoryRow[]>('/inventory/queryByStyle', { sn });
  return Array.isArray(result) ? result : (result.data ?? []);
}

export async function queryStockRecords(sku: string): Promise<StockRecord[]> {
  const result = await apiGet<Paged<StockRecord>>('/inventory/skuRecord', { sku, current: 1, pageSize: 20 });
  return result.data ?? [];
}

export async function queryHotSales(limit = 5): Promise<InventoryRow[]> {
  const result = await apiGet<Paged<InventoryRow>>('/inventory/getHotSalesList', {
    current: 1,
    pageSize: limit,
    minSaleCounts: 1,
  });
  return result.data ?? [];
}

/* ---------------- 会员 ---------------- */

export async function queryMembers(keyword: string, current = 1, pageSize = 20): Promise<Paged<MemberRow>> {
  return apiGet<Paged<MemberRow>>('/member/list', {
    keyword: keyword.trim() || undefined,
    current,
    pageSize,
  });
}

export async function queryMemberDetail(phone: string): Promise<MemberRow> {
  return apiGet<MemberRow>('/member/detail', { phone });
}

export async function queryMemberScores(phone: string): Promise<ScoreRecord[]> {
  const result = await apiGet<Paged<ScoreRecord>>('/member/queryScoreList', { phone });
  return result.data ?? [];
}

export async function queryMemberBalances(phone: string): Promise<BalanceRecord[]> {
  const result = await apiGet<Paged<BalanceRecord>>('/member/queryBalanceList', { phone });
  return result.data ?? [];
}

export async function queryMemberCoupons(phone: string): Promise<CouponRow[]> {
  const result = await apiGet<Paged<CouponRow>>('/member/queryCouponList', { phone });
  return result.data ?? [];
}

export async function rechargeBalance(input: {
  phone: string;
  amountCents: number;
  giftCents: number;
  payType: PaymentMethod;
  reason?: string;
}): Promise<void> {
  await apiPost('/member/incomeBalance', {
    phone: input.phone,
    inComeBalance: toYuan(input.amountCents),
    sendValue: toYuan(input.giftCents),
    sendValueType: input.giftCents > 0 ? 'balance' : 'money',
    reason: input.reason ?? '手机端充值',
    payType: PAYMENT_TO_SERVER[input.payType],
  });
}

/* ---------------- 数据 ---------------- */

export interface CoreStats {
  orderCount: number;
  orderAmount: number;
  totalBalance: number;
  inventoryCount: number;
  memberCount: number;
  saledItemCount: number;
  memberBalance: number;
}

export async function fetchCoreStats(start: string, end: string): Promise<CoreStats> {
  return apiPost<CoreStats>('/data/getCoreData', { dateRange: [start, end] });
}

export interface DailyPoint {
  day: string;
  amounts: number;
}

/** 按月拉取按天营业额，用于近 7/30 天趋势 */
export async function fetchDailyCharts(month: string): Promise<DailyPoint[]> {
  const rows = await apiGet<{ day: string; amounts: number }[]>('/data/getStoreDailyCharts', { month });
  return rows ?? [];
}

/** 店铺近 12 个月营业额（含成本与利润率） */
export async function fetchMonthCharts(): Promise<MonthlyChart[]> {
  const rows = await apiGet<MonthlyChart[]>('/data/getOrderCharts');
  return rows ?? [];
}

/** 当前登录导购近 12 个月营业额 */
export async function fetchSalerMonthCharts(): Promise<{ month: string; amounts: number }[]> {
  const rows = await apiGet<{ month: string; amounts: number }[]>('/data/getSalerCharts');
  return rows ?? [];
}

/* ---------------- 操作日志 ---------------- */

export async function queryOpLogs(input: {
  start: string;
  end: string;
  current?: number;
  pageSize?: number;
  type?: string;
}): Promise<Paged<OpLogRow>> {
  return apiGet<Paged<OpLogRow>>('/common/opLogs', {
    start: input.start,
    end: input.end,
    current: input.current ?? 1,
    pageSize: input.pageSize ?? 30,
    type: input.type,
  });
}
