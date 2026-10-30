import { useRef, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  CalendarCheck,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  Clock,
  FolderOpen,
  Inbox,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Sun,
  Trash2
} from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'
import type { AgentGroupKey, AgentSession } from '@shared/types/analysis'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { cn } from '@renderer/lib/utils'

interface SessionListProps {
  sessions: AgentSession[]
  selectedId: string | null
  loading: boolean
  onSelect: (sessionId: string) => void
  onCreateFree: () => void
  onRename: (sessionId: string, title: string) => void
  onArchive: (sessionId: string, archived: boolean) => void
  onReveal: (sessionId: string) => void
  onDelete: (sessionId: string) => void
}

const GROUP_META: Record<AgentGroupKey, { label: string }> = {
  analysis: { label: '经营分析' },
  free: { label: '自由对话' },
  archive: { label: '归档任务' }
}

const GROUP_KEYS: AgentGroupKey[] = ['analysis', 'free', 'archive']

function sessionIcon(session: AgentSession) {
  if (session.type === 'daily') return Sun
  if (session.type === 'weekly') return CalendarCheck
  if (session.type === 'monthly') return CalendarRange
  return MessageSquare
}

function timeLabel(value: string): string {
  const date = new Date(value)
  if (isToday(date)) return `今天 ${format(date, 'HH:mm')}`
  if (isYesterday(date)) return `昨天 ${format(date, 'HH:mm')}`
  return format(date, 'MM/dd')
}

function statusDot(session: AgentSession): string {
  if (session.status === 'running') return 'bg-primary animate-pulse'
  if (session.status === 'failed') return 'bg-destructive'
  if (session.status === 'completed') return 'bg-success'
  return 'bg-muted-foreground/40'
}

/** 自由对话行：hover 出现「…」菜单，支持行内重命名 */
function TaskItem({
  session,
  selected,
  onSelect,
  onRename,
  onArchive,
  onReveal,
  onDelete
}: {
  session: AgentSession
  selected: boolean
  onSelect: () => void
  onRename: (title: string) => void
  onArchive: (archived: boolean) => void
  onReveal: () => void
  onDelete: () => void
}) {
  const Icon = sessionIcon(session)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(session.title)
  const cancelling = useRef(false)
  const manageable = session.type === 'free'
  const running = session.status === 'running'

  function startRename(): void {
    cancelling.current = false
    setDraft(session.title)
    setEditing(true)
  }

  function commitRename(): void {
    if (cancelling.current) {
      cancelling.current = false
      return
    }
    const next = draft.trim()
    setEditing(false)
    if (next && next !== session.title) onRename(next)
  }

  return (
    <div
      className={cn(
        'group/item relative rounded-lg transition-colors',
        selected ? 'bg-secondary' : 'hover:bg-secondary/60'
      )}
    >
      {editing ? (
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusDot(session))} />
            <input
              autoFocus
              value={draft}
              maxLength={60}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  event.currentTarget.blur()
                }
                if (event.key === 'Escape') {
                  cancelling.current = true
                  setDraft(session.title)
                  setEditing(false)
                }
              }}
              className="min-w-0 flex-1 rounded border border-input bg-background px-1.5 py-0.5 text-body outline-none focus:ring-2 focus:ring-ring"
              aria-label="重命名任务"
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onSelect}
          className="w-full px-3 py-2.5 pr-8 text-left"
        >
          <div className="flex items-center gap-2">
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusDot(session))} />
            <span className="flex-1 truncate text-body font-medium">{session.title}</span>
            <span className="shrink-0 text-caption text-muted-foreground group-hover/item:hidden">
              {timeLabel(session.updatedAt)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 pl-3.5 text-meta text-muted-foreground">
            <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{session.rangeLabel}</span>
            {running ? (
              <span className="ml-auto shrink-0 text-primary">运行中</span>
            ) : session.status === 'failed' ? (
              <span className="ml-auto shrink-0 text-destructive">失败</span>
            ) : null}
          </div>
          {session.schedule ? (
            <div className="mt-1 flex items-center gap-1 pl-3.5 text-caption text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden="true" />
              <span>{session.schedule} 自动执行</span>
            </div>
          ) : null}
        </button>
      )}

      {manageable && !editing ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="任务操作"
              aria-label="任务操作"
              className="absolute right-1.5 top-2 hidden h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground group-hover/item:flex data-[state=open]:flex"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onSelect={startRename}>
              <Pencil />
              重命名
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onReveal}>
              <FolderOpen />
              打开文件夹
            </DropdownMenuItem>
            <DropdownMenuItem disabled={running} onSelect={() => onArchive(session.group !== 'archive')}>
              {session.group === 'archive' ? <ArchiveRestore /> : <Archive />}
              {session.group === 'archive' ? '取消归档' : '归档'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" disabled={running} onSelect={onDelete}>
              <Trash2 />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}

/** 分组空态：图标 + 文案，上下居中 */
function GroupEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <Inbox className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
      <span className="text-meta text-muted-foreground">暂无任务</span>
    </div>
  )
}

/** 左栏任务列表：三个固定分组，仅自由对话可新建 */
export function SessionList({
  sessions,
  selectedId,
  loading,
  onSelect,
  onCreateFree,
  onRename,
  onArchive,
  onReveal,
  onDelete
}: SessionListProps) {
  const [collapsed, setCollapsed] = useState<Partial<Record<AgentGroupKey, boolean>>>({})

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-border bg-card">
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <div className="flex items-center gap-2 text-body font-semibold">
          任务
          <Badge variant="secondary">{sessions.length}</Badge>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <p className="px-3 py-6 text-center text-meta text-muted-foreground">正在加载任务…</p>
        ) : null}

        {GROUP_KEYS.map((groupKey, index) => {
          const items = sessions.filter((session) => session.group === groupKey)
          const open = !collapsed[groupKey]
          return (
            <Collapsible
              key={groupKey}
              open={open}
              className={index > 0 ? 'mt-2' : ''}
              onOpenChange={(next) => setCollapsed((prev) => ({ ...prev, [groupKey]: !next }))}
            >
              <div className="flex items-center gap-1 rounded-md px-3 pb-1 pt-2 hover:bg-secondary/40">
                <CollapsibleTrigger asChild>
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    {open ? (
                      <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                    ) : (
                      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                    <span className="text-caption font-medium uppercase tracking-wider text-muted-foreground">
                      {GROUP_META[groupKey].label}
                    </span>
                    <Badge variant="secondary">{items.length}</Badge>
                  </button>
                </CollapsibleTrigger>
                {groupKey === 'free' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto h-5 w-5"
                    title="新建自由对话"
                    aria-label="新建自由对话"
                    onClick={onCreateFree}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
              <CollapsibleContent>
                {items.length === 0 ? (
                  <GroupEmpty />
                ) : (
                  items.map((session) => (
                    <TaskItem
                      key={session.id}
                      session={session}
                      selected={session.id === selectedId}
                      onSelect={() => onSelect(session.id)}
                      onRename={(title) => onRename(session.id, title)}
                      onArchive={(archived) => onArchive(session.id, archived)}
                      onReveal={() => onReveal(session.id)}
                      onDelete={() => onDelete(session.id)}
                    />
                  ))
                )}
              </CollapsibleContent>
            </Collapsible>
          )
        })}
      </div>
    </aside>
  )
}
