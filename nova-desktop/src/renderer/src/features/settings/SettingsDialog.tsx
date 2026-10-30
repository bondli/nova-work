import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { useUiStore } from '@renderer/stores/ui-store'
import { GeneralSettingsTab } from './GeneralSettingsTab'
import { TaskSettingsTab } from './TaskSettingsTab'
import { ModelSettingsTab } from './ModelSettingsTab'
import { DataSettingsTab } from './DataSettingsTab'
import { SettingsNav, type SettingsTabKey } from './SettingsNav'

/**
 * 系统设置弹窗：左侧四个 tab，右侧内容区。
 * 外壳完全复用 DialogContent 的默认样式（圆角、描边、阴影、进入/退出动画），
 * 与修改密码弹窗保持同一套实现，只额外指定宽度。
 */
export function SettingsDialog() {
  const open = useUiStore((state) => state.dialogs.settings)
  const setDialogOpen = useUiStore((state) => state.setDialogOpen)
  const [tab, setTab] = useState<SettingsTabKey>('general')

  return (
    <Dialog open={open} onOpenChange={(next) => setDialogOpen('settings', next)}>
      <DialogContent className="w-[880px] max-w-[calc(100vw-64px)] sm:max-w-[880px]">
        <DialogHeader>
          <DialogTitle className="text-title font-semibold">设置</DialogTitle>
          <DialogDescription className="text-meta text-muted-foreground">
            配置应用外观、任务、模型与数据连接
          </DialogDescription>
        </DialogHeader>

        <div className="flex h-[560px] min-h-0 overflow-hidden rounded-lg border border-border">
          <SettingsNav value={tab} onChange={setTab} />
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
            {tab === 'general' ? (
              <GeneralSettingsTab />
            ) : tab === 'task' ? (
              <TaskSettingsTab />
            ) : tab === 'model' ? (
              <ModelSettingsTab />
            ) : (
              <DataSettingsTab />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
