import { AlarmClock, Brain, Database, FolderOpen, SlidersHorizontal, type LucideIcon } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

export type SettingsTabKey = 'general' | 'task' | 'model' | 'data' | 'share'

interface SettingsNavItem {
  key: SettingsTabKey
  label: string
  icon: LucideIcon
}

const NAV_ITEMS: SettingsNavItem[] = [
  { key: 'general', label: '通用设置', icon: SlidersHorizontal },
  { key: 'task', label: '任务设置', icon: AlarmClock },
  { key: 'model', label: '模型设置', icon: Brain },
  { key: 'data', label: '数据设置', icon: Database },
  { key: 'share', label: '文件共享', icon: FolderOpen }
]

interface SettingsNavProps {
  value: SettingsTabKey
  onChange: (value: SettingsTabKey) => void
}

/** 设置弹窗左侧导航：通用 / 任务 / 模型 / 数据 */
export function SettingsNav({ value, onChange }: SettingsNavProps) {
  return (
    <nav className="w-[200px] shrink-0 border-r border-border bg-surface p-3">
      <p className="px-3 pt-1 pb-2 text-caption font-medium tracking-wider text-subtle">设置</p>
      {NAV_ITEMS.map((item, index) => {
        const Icon = item.icon
        const active = item.key === value

        return (
          <Button
            key={item.key}
            type="button"
            variant="ghost"
            onClick={() => onChange(item.key)}
            className={cn(
              'w-full justify-start gap-2 px-3 text-ui font-normal',
              index > 0 && 'mt-1',
              active
                ? 'bg-card font-medium text-foreground shadow-sm hover:bg-card'
                : 'text-muted-foreground hover:bg-card'
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {item.label}
          </Button>
        )
      })}
    </nav>
  )
}
