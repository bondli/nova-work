import type { ReactNode } from 'react'
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@renderer/components/ui/switch'
import { cn } from '@renderer/lib/utils'
import { useSettingsStore } from '@renderer/stores/settings-store'
import type { AppSettings, FontSize, ThemeMode } from '@shared/types/settings'
import { OptionCard } from './OptionCard'

interface ThemeOption {
  value: ThemeMode
  label: string
  description: string
  icon: LucideIcon
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'system', label: '跟随系统', description: '跟随系统设置自动切换', icon: Monitor },
  { value: 'light', label: '亮色', description: '明亮清爽，适合白天使用', icon: Sun },
  { value: 'dark', label: '暗黑', description: '低亮度，适合夜间使用', icon: Moon }
]

interface FontOption {
  value: FontSize
  label: string
  description: string
  previewClassName: string
}

/** 字号档位文案：小 12px / 中 14px（默认）/ 大 16px */
const FONT_OPTIONS: FontOption[] = [
  { value: 'small', label: '小', description: '12px', previewClassName: 'text-[12px]' },
  { value: 'medium', label: '中', description: '14px', previewClassName: 'text-[14px]' },
  { value: 'large', label: '大', description: '16px', previewClassName: 'text-[16px]' }
]

interface SettingsSectionProps {
  title: string
  description: string
  children: ReactNode
}

function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <section>
      <h3 className="text-body font-semibold">{title}</h3>
      <p className="mt-0.5 text-meta text-muted-foreground">{description}</p>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/**
 * 通用设置：主题、字号、开机自启。
 * 每次修改立即保存；保存失败由 settings store 回滚并 toast 提示。
 */
export function GeneralSettingsTab() {
  const settings = useSettingsStore((state) => state.settings)
  const update = useSettingsStore((state) => state.update)

  const save = async (next: AppSettings): Promise<void> => {
    try {
      await update(() => next)
      toast.success('设置已更新')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '设置保存失败')
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <SettingsSection title="外观" description="选择 DaveBella 的界面风格">
        <div className="grid grid-cols-3 gap-3">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon
            const selected = settings.appearance.theme === option.value

            return (
              <OptionCard
                key={option.value}
                selected={selected}
                onSelect={() =>
                  void save({
                    ...settings,
                    appearance: { ...settings.appearance, theme: option.value }
                  })
                }
                label={option.label}
                description={option.description}
              >
                <Icon
                  className={cn('h-4 w-4', selected ? 'text-primary' : 'text-muted-foreground')}
                  aria-hidden="true"
                />
              </OptionCard>
            )
          })}
        </div>
      </SettingsSection>

      <SettingsSection title="字体大小" description="调整界面文字大小，便于远距离查看">
        <div className="grid grid-cols-3 gap-3">
          {FONT_OPTIONS.map((option) => {
            const selected = settings.appearance.fontSize === option.value

            return (
              <OptionCard
                key={option.value}
                selected={selected}
                onSelect={() =>
                  void save({
                    ...settings,
                    appearance: { ...settings.appearance, fontSize: option.value }
                  })
                }
                label={option.label}
                description={option.description}
              >
                <span
                  className={cn(
                    'leading-none font-semibold',
                    option.previewClassName,
                    selected ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  Aa
                </span>
              </OptionCard>
            )
          })}
        </div>
      </SettingsSection>

      <SettingsSection title="启动" description="应用启动行为">
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
          <div>
            <p className="text-ui font-medium">开机自启</p>
            <p className="mt-0.5 text-meta text-muted-foreground">登录系统后自动打开 DaveBella</p>
          </div>
          <Switch
            checked={settings.launch.autoLaunch}
            aria-label="开机自启"
            onCheckedChange={(checked) =>
              void save({ ...settings, launch: { ...settings.launch, autoLaunch: checked } })
            }
          />
        </div>
      </SettingsSection>
    </div>
  )
}
