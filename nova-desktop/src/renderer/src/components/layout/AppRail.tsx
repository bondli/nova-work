import { NavLink } from 'react-router-dom'
import { Settings } from 'lucide-react'
import { BrandMark } from '@renderer/components/common/BrandMark'
import { NAV_ITEMS, type NavItem } from '@renderer/lib/navigation'
import { cn } from '@renderer/lib/utils'
import { useUiStore } from '@renderer/stores/ui-store'
import { useOrderShowStatusStore } from '@renderer/stores/order-show-status-store'

interface RailItemProps {
  item: NavItem
}

/** 单个导航项：图标 + 文字，选中时显示左侧指示条与浅色底 */
function RailItem({ item }: RailItemProps) {
  const Icon = item.icon

  return (
    <NavLink
      to={item.path}
      title={item.label}
      aria-label={item.label}
      className={({ isActive }) =>
        cn(
          'relative flex h-[54px] w-14 flex-col items-center justify-center gap-1 rounded-[10px] transition-colors',
          isActive
            ? 'bg-accent text-primary'
            : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden="true"
            className={cn(
              'absolute top-[14px] left-[-11px] h-[26px] w-[3px] rounded-r-[3px] bg-primary',
              !isActive && 'hidden'
            )}
          />
          <Icon className="h-[19px] w-[19px]" aria-hidden="true" />
          <span className="text-caption leading-[14px] whitespace-nowrap">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

/** 应用最左侧导航栏：品牌入口、7 个业务入口、底部设置入口 */
export function AppRail() {
  const setDialogOpen = useUiStore((state) => state.setDialogOpen)
  // macOS 顶部是交通灯，Logo 需要下移让位；Windows 无交通灯，Logo 与顶栏文字垂直居中
  const isMac = window.nova.platform === 'darwin'

  return (
    <aside
      className={cn(
        'app-drag flex w-[78px] shrink-0 flex-col items-center border-r border-border bg-muted dark:bg-background',
        isMac ? 'pt-9' : 'pt-2.5'
      )}
    >
      {/* 品牌标识仅做展示，不可点击、无 hover 反馈 */}
      <div className="app-no-drag mb-5 flex h-9 w-9 items-center justify-center">
        <BrandMark className="h-8 w-8 text-primary" />
      </div>

      <nav className="app-no-drag flex flex-col items-center gap-1">
        {NAV_ITEMS.map((item) => (
          <RailItem key={item.path} item={item} />
        ))}
        {/* 透明按钮：切换订单对外可见范围，供商场检查时隐藏部分订单 */}
        <button
          type="button"
          aria-label="切换订单可见范围"
          onClick={() => useOrderShowStatusStore.getState().toggle()}
          className="h-[34px] w-14 cursor-default bg-transparent"
        />
      </nav>

      <div className="flex-1" />

      <button
        type="button"
        title="设置"
        aria-label="设置"
        onClick={() => setDialogOpen('settings', true)}
        className="app-no-drag mb-4 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Settings className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>
    </aside>
  )
}
