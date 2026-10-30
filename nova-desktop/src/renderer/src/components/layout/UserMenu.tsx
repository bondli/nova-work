import { ChevronDown, CircleUserRound, KeyRound, LogOut, ScrollText, Settings } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { useAuthStore } from '@renderer/stores/auth-store'
import { useOrderShowStatus } from '@renderer/stores/order-show-status-store'
import { useUiStore } from '@renderer/stores/ui-store'
import { cn } from '@renderer/lib/utils'

const ROLE_LABEL = {
  admin: '管理员',
  clerk: '导购员'
} as const

/**
 * 右上角个人中心：展示当前用户与角色，
 * 下拉包含操作日志、系统设置、修改密码、退出登录四个入口。
 */
export function UserMenu() {
  const user = useAuthStore((state) => state.user)
  const setDialogOpen = useUiStore((state) => state.setDialogOpen)
  // 订单处于隐藏状态时，用户图标标成主题色提醒当前对商场隐藏了订单
  const isHidden = useOrderShowStatus() === 'hidden'

  if (!user) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="个人中心"
          className="flex items-center gap-2 rounded-lg py-1 pr-2 pl-1 transition-colors hover:bg-secondary"
        >
          <CircleUserRound
            className={cn(
              'h-[18px] w-[18px]',
              isHidden ? 'text-[#4f46e5]' : 'text-muted-foreground'
            )}
            aria-hidden="true"
          />
          <span className="text-ui font-medium">{user.name}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-[196px] p-1">
        <div className="px-3 py-2">
          <p className="text-ui font-semibold">{user.name}</p>
          <p className="mt-0.5 text-meta text-muted-foreground">
            {ROLE_LABEL[user.role]} · Dave &amp; Bella
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setDialogOpen('oplog', true)}>
          <ScrollText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          操作日志
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setDialogOpen('settings', true)}>
          <Settings className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          系统设置
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setDialogOpen('password', true)}>
          <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          修改密码
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => setDialogOpen('logout', true)}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
