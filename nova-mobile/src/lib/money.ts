/** 金额工具：统一以「分」为整数存储，避免浮点误差累积，展示时再转元。 */
import { roundYuan } from './number';

/** 元 → 分，兼容服务端返回的字符串金额 */
export function toCents(value: number | string | null | undefined): number {
  const amount = typeof value === 'string' ? Number(value) : (value ?? 0);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

/** 分 → 元，用于提交给服务端 */
export function toYuan(cents: number): number {
  return roundYuan(cents / 100);
}

/** 分 → 「¥1,234.50」；负数显示为「-¥12.00」 */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const value = (abs / 100).toFixed(2);
  const [integer = '0', decimal = '00'] = value.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}¥${grouped}.${decimal}`;
}

/** 元 → 「¥1,234.50」，用于服务端原始金额展示 */
export function formatYuan(value: number | string | null | undefined): string {
  return formatCents(toCents(value));
}
