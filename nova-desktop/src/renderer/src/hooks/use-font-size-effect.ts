import { useEffect } from 'react'
import { FONT_SIZE_SCALE, type FontSize } from '@shared/types/settings'

/**
 * 将字号档位写入根节点的 CSS 变量 --font-scale。
 * 只有 text-* 字号 token 引用该变量，所以调整字号只改变文字大小，
 * 间距、图标与控件尺寸都保持 demo 基线不变。
 */
export function useFontSizeEffect(fontSize: FontSize): void {
  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', String(FONT_SIZE_SCALE[fontSize]))
  }, [fontSize])
}
