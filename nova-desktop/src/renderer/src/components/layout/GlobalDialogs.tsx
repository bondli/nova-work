import { LogoutAlert } from '@renderer/features/auth/LogoutAlert'
import { OpLogDialog } from '@renderer/features/oplog/OpLogDialog'
import { ChangePasswordDialog } from '@renderer/features/settings/ChangePasswordDialog'
import { SettingsDialog } from '@renderer/features/settings/SettingsDialog'

/** 全局弹窗集合：由 ui-store 控制开关，挂在应用壳层任意页面可用 */
export function GlobalDialogs() {
  return (
    <>
      <SettingsDialog />
      <OpLogDialog />
      <ChangePasswordDialog />
      <LogoutAlert />
    </>
  )
}
