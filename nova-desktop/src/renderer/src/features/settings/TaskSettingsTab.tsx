import { AlarmClock, BellRing } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import {
  NOTIFICATION_SOUND_OPTIONS,
  type AppSettings,
  type NotificationSound,
  type TaskScheduleSettings
} from '@shared/types/settings'
import { useSettingsStore } from '@renderer/stores/settings-store'
import { useAuthStore } from '@renderer/stores/auth-store'

/** 三行执行时间：key 与设置字段一致 */
const TASK_SCHEDULE_ROWS: Array<{ key: keyof TaskScheduleSettings; label: string }> = [
  { key: 'daily', label: '店铺经营日报' },
  { key: 'weekly', label: '店铺经营周报（每周一）' },
  { key: 'monthly', label: '店铺经营月报（每月 1 号）' }
]

/**
 * 任务设置：三个定时任务的执行时间与报告通知方式。
 * 执行时间仅管理员可改（主进程同样校验）；其余设置所有登录用户可改。
 */
export function TaskSettingsTab() {
  const settings = useSettingsStore((state) => state.settings)
  const update = useSettingsStore((state) => state.update)
  const role = useAuthStore((state) => state.user?.role)
  const isAdmin = role === 'admin'

  const save = async (next: AppSettings): Promise<void> => {
    try {
      await update(() => next)
      toast.success('设置已更新')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '设置保存失败')
    }
  }

  const saveSchedule = (key: keyof TaskScheduleSettings, value: string): void => {
    if (!isAdmin || !value) return
    const task: TaskScheduleSettings = { ...settings.task, [key]: value }
    void save({ ...settings, task })
  }

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h2 className="text-body font-semibold">任务</h2>
        <p className="mt-0.5 text-meta text-muted-foreground">
          定时经营分析任务的执行时间与完成后的提醒方式
        </p>
      </div>

      <section>
        <h3 className="text-body font-semibold">定时任务执行时间</h3>
        <p className="mt-0.5 text-meta text-muted-foreground">
          日报、周报、月报按设定时间自动执行
        </p>

        <div className="mt-3 rounded-lg border border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-ui font-medium">执行时间</p>
            <span className="text-meta text-subtle">
              {isAdmin ? '保存后立即生效' : '仅管理员可修改'}
            </span>
          </div>

          <div className="space-y-2">
            {TASK_SCHEDULE_ROWS.map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-3">
                <span className="text-meta text-muted-foreground">{row.label}</span>
                <Input
                  type="time"
                  aria-label={row.label}
                  className="h-8 w-[104px] text-right tabular-nums"
                  value={settings.task[row.key]}
                  disabled={!isAdmin}
                  onChange={(event) => saveSchedule(row.key, event.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        <p className="mt-2 flex items-center gap-1.5 text-meta text-subtle">
          <AlarmClock className="h-3.5 w-3.5" aria-hidden="true" />
          应用启动时若当天已过执行时间且尚未执行，会自动补跑一次
        </p>
      </section>

      <section>
        <h3 className="text-body font-semibold">通知</h3>
        <p className="mt-0.5 text-meta text-muted-foreground">
          经营分析报告生成后的提醒方式
        </p>

        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div>
              <p className="text-ui font-medium">桌面通知</p>
              <p className="mt-0.5 text-meta text-muted-foreground">
                报告生成时在系统通知中心提醒
              </p>
            </div>
            <Switch
              checked={settings.notification.desktop}
              aria-label="桌面通知"
              onCheckedChange={(checked) =>
                void save({
                  ...settings,
                  notification: { ...settings.notification, desktop: checked }
                })
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-ui">通知提示音</span>
            </div>
            <Select
              value={settings.notification.sound}
              onValueChange={(value) =>
                void save({
                  ...settings,
                  notification: {
                    ...settings.notification,
                    sound: value as NotificationSound
                  }
                })
              }
            >
              <SelectTrigger size="sm" className="w-[160px]" aria-label="通知提示音">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTIFICATION_SOUND_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>
    </div>
  )
}
