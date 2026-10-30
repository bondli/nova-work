import { LogOut } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import { useAuthStore } from '@renderer/stores/auth-store'
import { useUiStore } from '@renderer/stores/ui-store'

/** 退出登录确认弹窗，退出成功后回到登录页 */
export function LogoutAlert() {
  const open = useUiStore((state) => state.dialogs.logout)
  const setDialogOpen = useUiStore((state) => state.setDialogOpen)
  const logout = useAuthStore((state) => state.logout)

  const handleLogout = async (): Promise<void> => {
    try {
      await logout()
      toast.success('已退出登录')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '退出登录失败')
    } finally {
      setDialogOpen('logout', false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => setDialogOpen('logout', next)}>
      <AlertDialogContent className="w-[420px] max-w-[calc(100vw-48px)]">
        <AlertDialogHeader>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-danger-soft text-destructive">
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </span>
          <AlertDialogTitle className="text-title font-semibold">退出登录</AlertDialogTitle>
          <AlertDialogDescription className="text-meta text-muted-foreground">
            退出后需要重新输入账号密码才能进入 DaveBella。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={() => void handleLogout()}>退出登录</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
