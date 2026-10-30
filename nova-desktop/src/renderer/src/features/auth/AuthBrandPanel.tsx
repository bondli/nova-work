import { Database, ShieldCheck, Sparkles } from 'lucide-react'
import { BrandMark } from '@renderer/components/common/BrandMark'

/** 左侧品牌面板展示的三条产品卖点 */
const FEATURES = [
  { icon: Sparkles, label: '定时生成日报 / 周报 / 月报' },
  { icon: Database, label: '数据可追溯，口径统一' },
  { icon: ShieldCheck, label: '单店经营，权限清晰' }
]

interface AuthBrandPanelProps {
  version: string
}

/** 登录页左侧品牌区：logo、标语、卖点与版本号，窄窗口下自动隐藏 */
export function AuthBrandPanel({ version }: AuthBrandPanelProps) {
  return (
    <div className="relative hidden w-[52%] shrink-0 flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 h-[420px] w-[420px] rounded-full bg-white/10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-20 h-[380px] w-[380px] rounded-full bg-white/5"
      />

      <div className="relative flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white">
          <BrandMark className="h-6 w-6 text-primary" />
        </span>
        <span className="text-brand font-semibold tracking-[-0.01em]">Dave &amp; Bella</span>
      </div>

      <div className="relative max-w-[420px]">
        <p className="text-display leading-[1.25] font-semibold tracking-[-0.02em]">
          懂我 / 帮我的经营好伙伴
        </p>
        <p className="mt-4 text-body leading-relaxed text-white/70">
          AI辅助经营分析，一个工作台完成门店每天的经营闭环。
        </p>
        <div className="mt-8 space-y-3 text-ui text-white/80">
          {FEATURES.map((feature) => {
            const Icon = feature.icon
            return (
              <div key={feature.label} className="flex items-center gap-2">
                <Icon className="h-4 w-4" aria-hidden="true" />
                {feature.label}
              </div>
            )
          })}
        </div>
      </div>

      <p className="relative text-meta text-white/50">v{version} · 单店版</p>
    </div>
  )
}
