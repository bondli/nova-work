/** 环比文案：正增长绿色，下降红色，无基数时显示占位 */
export function buildDelta(
  current: number,
  previous: number
): { text: string; tone: 'success' | 'danger' | 'muted' } {
  if (previous === 0) return { text: '— 较上期', tone: 'muted' }
  const percent = ((current - previous) / previous) * 100
  return {
    text: `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}% 较上期`,
    tone: percent >= 0 ? 'success' : 'danger'
  }
}
