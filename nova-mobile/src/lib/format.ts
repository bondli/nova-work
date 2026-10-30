/** 展示格式化：日期、时间、手机号、状态文案 */

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  return `${formatDate(value)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(11, 16);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 千分位分组，用于商品/会员等计数 */
export function groupNumber(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatMonthDay(value: string | null | undefined): string {
  const date = new Date(value ?? '');
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function today(): string {
  return formatDate(new Date().toISOString());
}

export function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return formatDate(date.toISOString());
}

/** 手机号中段脱敏，仅用于列表展示 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  return phone.length === 11 ? `${phone.slice(0, 3)}****${phone.slice(7)}` : phone;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** 服务端支付方式 → 中文 */
export const PAY_LABEL: Record<string, string> = {
  weixin: '微信',
  wechat: '微信',
  alipay: '支付宝',
  cash: '现金',
  card: '银行卡',
  other: '其他',
  balance: '余额',
  point: '积分',
};

export function payLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return PAY_LABEL[value] ?? value;
}

/** 订单状态由商品行推导，与桌面端口径一致 */
export function orderStatusLabel(order: {
  orderStatus?: string | null;
  orderItems?: number | null;
  orderActualAmount?: number | string | null;
}): { text: string; tone: 'success' | 'warning' | 'danger' } {
  if (order.orderStatus === 'refund') return { text: '已退款', tone: 'danger' };
  if (order.orderStatus === 'uncheck') return { text: '待对账', tone: 'warning' };
  return { text: '已完成', tone: 'success' };
}

export function memberLevelLabel(level: string | null | undefined): string {
  switch (level) {
    case 'super':
      return '超级会员';
    case 'gold':
      return '金卡';
    case 'silver':
      return '银卡';
    default:
      return '普通会员';
  }
}
