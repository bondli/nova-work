/** 商品颜色名到色块的稳定映射，未知颜色用色相散列兜底 */
const COLOR_HEX: Record<string, string> = {
  红色: '#dc2626',
  粉色: '#ec4899',
  蓝色: '#2563eb',
  牛仔蓝: '#1d4ed8',
  黄色: '#eab308',
  绿色: '#16a34a',
  白色: '#d4d4d8',
  黑色: '#3f3f46',
  灰色: '#a1a1aa',
  紫色: '#7c3aed',
  橙色: '#ea580c',
  咖色: '#92400e',
  米色: '#d6c7a1'
}

export function colorHex(color: string): string {
  if (COLOR_HEX[color]) return COLOR_HEX[color]
  let hash = 0
  for (const char of color) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return `hsl(${hash} 58% 52%)`
}
