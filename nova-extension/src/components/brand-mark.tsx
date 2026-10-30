/** 品牌图标：主色圆角方块 + 白色购物袋，购物袋按画布中心等比缩放 */
import { BRAND_MARK_PATH, BRAND_PRIMARY, brandPathTransform } from "../shared/brand"
import { cn } from "../lib/utils"

interface BrandMarkProps {
  /** 渲染尺寸（px），默认 24 */
  size?: number
  /** 购物袋占画布比例，默认 0.66；小尺寸可适当放大 */
  ratio?: number
}

export function BrandMark({ size = 24, ratio = 0.66 }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      className={cn("shrink-0")}
      role="img"
      aria-label="DaveBella"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="1024" height="1024" rx="240" fill={BRAND_PRIMARY} />
      <path fill="#ffffff" transform={brandPathTransform(ratio)} d={BRAND_MARK_PATH} />
    </svg>
  )
}
