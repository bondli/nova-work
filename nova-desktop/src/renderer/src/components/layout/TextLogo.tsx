interface TextLogoProps {
  version: string
}

/** 顶栏两行文字 logo：品牌名 + 灰色版本号 */
export function TextLogo({ version }: TextLogoProps) {
  return (
    <div className="flex shrink-0 flex-col justify-center leading-none">
      <span className="text-title font-semibold tracking-[-0.01em]">Dave &amp; Bella</span>
      <span className="mt-1 text-caption text-subtle">v{version}</span>
    </div>
  )
}
