import { Loader2 } from 'lucide-react'
import { BrandMark } from '@renderer/components/common/BrandMark'

/** 启动 / 会话恢复期间的整屏占位 */
export function AppSplash() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-surface">
      <BrandMark className="h-10 w-10 text-primary" />
      <p className="text-ui text-muted-foreground">正在启动 DaveBella</p>
      <Loader2 className="h-4 w-4 animate-spin text-subtle" aria-hidden="true" />
    </div>
  )
}
