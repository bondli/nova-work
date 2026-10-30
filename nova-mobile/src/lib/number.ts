/** 四舍五入到两位小数，等价于桌面端的 roundMoney */
export function roundYuan(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** 数值转成有限数字，接口字段可能为 null / 字符串 */
export function toNumber(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? Number(value) : (value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 单据件数 */
export function countItems(items: { counts?: number | null }[]): number {
  return items.reduce((sum, item) => sum + (item.counts ?? 0), 0);
}
