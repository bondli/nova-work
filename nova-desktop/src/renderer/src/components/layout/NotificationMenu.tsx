import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, isToday } from 'date-fns'
import { Bell, BellOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@renderer/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { unwrap } from '@renderer/lib/ipc'
import { useAnalysisStore } from '@renderer/stores/analysis-store'
import { cn } from '@renderer/lib/utils'
import type { AppNotification } from '@shared/types/notification'

/** 通知时间：今天显示「今天 HH:mm」，其余显示「MM/dd HH:mm」 */
function formatNotificationTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return isToday(date) ? `今天 ${format(date, 'HH:mm')}` : format(date, 'MM/dd HH:mm')
}

/**
 * 顶栏消息入口：未读红点、全部已读、点击跳转并标记已读。
 * 数据来自主进程通知列表；定时任务完成时通过 notify:event 即时推送。
 */
export function NotificationMenu() {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const unreadCount = notifications.filter((item) => item.unread).length

  useEffect(() => {
    let active = true

    void window.nova.notifications
      .list()
      .then((result) => {
        if (active && result.ok) setNotifications(result.data)
      })
      .catch(() => undefined)

    // 新通知到达：插入列表顶部并刷新任务列表（更新时间 / 状态）
    const unsubscribe = window.nova.notifications.onEvent((notification) => {
      setNotifications((current) => [
        notification,
        ...current.filter((item) => item.id !== notification.id)
      ])
      void useAnalysisStore.getState().refreshSessions()
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  /** 点击消息：标记已读并跳到对应经营分析任务 */
  async function handleOpen(item: AppNotification): Promise<void> {
    try {
      const next = unwrap(await window.nova.notifications.read(item.id))
      setNotifications(next)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '标记已读失败')
    }
    navigate(`/analysis?task=${item.taskId}`)
  }

  async function handleMarkAllRead(): Promise<void> {
    try {
      const next = unwrap(await window.nova.notifications.readAll())
      setNotifications(next)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '全部已读失败')
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative"
          title="消息"
          aria-label={unreadCount > 0 ? `消息，${unreadCount} 条未读` : '消息'}
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          {unreadCount > 0 ? (
            <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-destructive" />
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-[336px] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <p className="text-ui font-semibold">消息</p>
            {unreadCount > 0 ? (
              <span className="text-meta text-muted-foreground">{unreadCount} 条未读</span>
            ) : null}
          </div>
          <button
            type="button"
            className="text-meta text-primary disabled:cursor-default disabled:text-muted-foreground"
            disabled={unreadCount === 0}
            onClick={() => void handleMarkAllRead()}
          >
            全部已读
          </button>
        </div>

        <ScrollArea className="max-h-[360px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <BellOff className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
              <p className="text-ui font-medium">暂无消息</p>
              <p className="text-meta text-muted-foreground">经营报告生成后会在这里提醒</p>
            </div>
          ) : (
            <div className="p-1">
              {notifications.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface',
                    !item.unread && 'text-muted-foreground'
                  )}
                  onClick={() => void handleOpen(item)}
                >
                  <span
                    className={cn(
                      'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                      item.unread ? 'bg-primary' : 'bg-transparent'
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ui font-medium">{item.title}</span>
                    <span className="mt-0.5 block truncate text-meta text-muted-foreground">
                      {item.description}
                    </span>
                    <span className="mt-0.5 block text-meta text-subtle">
                      {formatNotificationTime(item.createdAt)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
