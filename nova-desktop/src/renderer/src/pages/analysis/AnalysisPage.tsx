import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Archive, FolderOpen, Loader2, Pause, RotateCcw, Sparkles } from 'lucide-react'
import type { AgentMessage, AgentSessionStatus, AttachmentInput } from '@shared/types/analysis'
import { Button } from '@renderer/components/ui/button'
import { EmptyState } from '@renderer/components/common/EmptyState'
import { PromptInput } from '@renderer/components/ai-elements/prompt-input'
import { SessionList } from '@renderer/features/analysis/SessionList'
import { TaskChat } from '@renderer/features/analysis/TaskChat'
import { ArtifactDrawer } from '@renderer/features/analysis/ArtifactDrawer'
import { cn } from '@renderer/lib/utils'
import {
  EMPTY_ARTIFACTS,
  EMPTY_MESSAGES,
  useAnalysisStore
} from '@renderer/stores/analysis-store'

/** 顶栏状态点与文案，与 nexa 的会话状态映射一致 */
const STATUS_META: Record<AgentSessionStatus, { dot: string; label: string }> = {
  running: { dot: 'bg-primary', label: '运行中' },
  paused: { dot: 'bg-muted-foreground', label: '已暂停' },
  completed: { dot: 'bg-success', label: '已完成' },
  failed: { dot: 'bg-destructive', label: '失败' },
  idle: { dot: 'bg-muted-foreground/40', label: '未开始' }
}

/** 合并已落盘消息与流式消息；均为稳定引用，避免 useSyncExternalStore 重复渲染 */
function useMessages(sessionId: string | null) {
  const details = useAnalysisStore((state) =>
    sessionId ? state.details[sessionId] : undefined
  )
  const live = useAnalysisStore((state) => (sessionId ? state.liveMessages[sessionId] : undefined))

  return useMemo(() => {
    const base = details ?? EMPTY_MESSAGES
    if (!live) return base
    return base.some((message) => message.id === live.id) ? base : [...base, live]
  }, [details, live])
}

/** 取最后一条用户提问，用于失败重试 */
function lastUserContent(messages: AgentMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'user') return message.content
  }
  return null
}

/**
 * 经营分析页：左任务列表 + 右会话详情。
 * 顶栏、消息与产物面板均对齐 nexa 的 chat-shell 实现。
 */
export function AnalysisPage() {
  const sessions = useAnalysisStore((state) => state.sessions)
  const selectedId = useAnalysisStore((state) => state.selectedId)
  const loadingList = useAnalysisStore((state) => state.loadingList)
  const loadingDetail = useAnalysisStore((state) => state.loadingDetail)
  const initialize = useAnalysisStore((state) => state.initialize)
  const selectSession = useAnalysisStore((state) => state.selectSession)
  const createFree = useAnalysisStore((state) => state.createFree)
  const send = useAnalysisStore((state) => state.send)
  const stop = useAnalysisStore((state) => state.stop)
  const setModel = useAnalysisStore((state) => state.setModel)
  const renameSession = useAnalysisStore((state) => state.renameSession)
  const setArchived = useAnalysisStore((state) => state.setArchived)
  const deleteSession = useAnalysisStore((state) => state.deleteSession)

  const artifacts = useAnalysisStore((state) =>
    selectedId ? (state.artifacts[selectedId] ?? EMPTY_ARTIFACTS) : EMPTY_ARTIFACTS
  )
  const messages = useMessages(selectedId)

  const [input, setInput] = useState('')
  const [artifactOpen, setArtifactOpen] = useState(false)
  const [artifactShowFiles, setArtifactShowFiles] = useState(true)
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    void initialize()
  }, [initialize])

  /** 从通知跳转：`/analysis?task=<sessionId>` 选中对应任务后清除参数 */
  useEffect(() => {
    const taskId = searchParams.get('task')
    if (!taskId) return
    if (!sessions.some((session) => session.id === taskId)) return

    if (selectedId !== taskId) {
      setArtifactOpen(false)
      setSelectedArtifactId(null)
      void selectSession(taskId)
    }
    const next = new URLSearchParams(searchParams)
    next.delete('task')
    setSearchParams(next, { replace: true })
  }, [searchParams, sessions, selectedId, selectSession, setSearchParams])

  const session = sessions.find((item) => item.id === selectedId) ?? null
  const isRunning = session?.status === 'running'
  const isArchived = session?.group === 'archive'
  const retryContent = lastUserContent(messages)
  const statusMeta = session ? STATUS_META[session.status] : null

  /** 切换任务时关闭产物抽屉，避免展示上一会话的文件 */
  function handleSelect(sessionId: string): void {
    if (sessionId === selectedId) return
    setArtifactOpen(false)
    setSelectedArtifactId(null)
    setInput('')
    void selectSession(sessionId)
  }

  function handleCreateFree(): void {
    setArtifactOpen(false)
    setSelectedArtifactId(null)
    setInput('')
    void createFree()
  }

  async function handleSend(
    content: string,
    options?: { attachments?: AttachmentInput[]; skillId?: string }
  ): Promise<boolean> {
    if (!session || isRunning || isArchived) return false
    if (!content.trim() && !options?.attachments?.length) return false
    const ok = await send(content, options)
    if (ok) setInput('')
    return ok
  }

  function handleSubmit(options: {
    attachments?: AttachmentInput[]
    skillId?: string
  }): Promise<boolean> {
    return handleSend(input, options)
  }

  /**
   * 打开产物：从顶栏进入时展示文件树；
   * 从消息里的文件卡进入时只预览该文件，不展示文件树。
   */
  function handleOpenArtifact(
    artifactId: string,
    options?: { showFileList?: boolean }
  ): void {
    setSelectedArtifactId(artifactId)
    setArtifactShowFiles(options?.showFileList ?? true)
    setArtifactOpen(true)
  }

  function toggleArtifactByHeader(): void {
    setArtifactShowFiles(true)
    setArtifactOpen((open) => !open)
  }

  if (!session || !statusMeta) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        {loadingList ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="正在加载任务" />
        ) : (
          <EmptyState icon={Sparkles} title="暂无分析任务" description="请在左侧新建自由对话" />
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full p-4">
      <div className="flex h-full min-h-0 w-full overflow-hidden rounded-xl border border-border bg-card">
        <SessionList
          sessions={sessions}
          selectedId={selectedId}
          loading={loadingList}
          onSelect={handleSelect}
          onCreateFree={handleCreateFree}
          onRename={(sessionId, title) => void renameSession(sessionId, title)}
          onArchive={(sessionId, archived) => void setArchived(sessionId, archived)}
          onReveal={(sessionId) => void window.nova.agent.reveal(sessionId)}
          onDelete={(sessionId) => void deleteSession(sessionId)}
        />

        <main className="flex h-full min-w-0 flex-1 flex-col bg-surface">
          <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border bg-card px-5">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  'h-2 w-2 shrink-0 rounded-full',
                  statusMeta.dot,
                  isRunning && 'animate-pulse'
                )}
              />
              <span className="truncate text-sm font-medium">{session.title}</span>
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {session.type === 'free' ? '自由' : '定时'}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{statusMeta.label}</span>
              <span className="max-w-[240px] truncate text-[10px] text-muted-foreground">
                数据范围 {session.rangeLabel}
                {session.schedule ? ` · ${session.schedule}` : ''}
              </span>
              {isArchived ? (
                <span className="flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  <Archive className="h-3 w-3" aria-hidden="true" />
                  已归档
                </span>
              ) : null}
            </div>
            <div className="flex-1" />

            {/* 会话控制：暂停 / 失败重试，产物入口固定在右上角 */}
            {isRunning && !isArchived ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="暂停"
                aria-label="暂停"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => void stop()}
              >
                <Pause className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : null}
            {!isRunning && !isArchived && retryContent && session.status !== 'completed' ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="重发最后一条消息"
                aria-label="重试"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => handleSend(retryContent)}
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : null}

            <button
              type="button"
              title="产物文件"
              aria-label="产物文件"
              onClick={toggleArtifactByHeader}
              className={cn(
                'relative flex h-7 w-7 items-center justify-center rounded-md outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
                artifactOpen ? 'bg-accent text-foreground' : 'text-muted-foreground'
              )}
            >
              <FolderOpen className="h-4 w-4" aria-hidden="true" />
              {artifacts.length > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                  {artifacts.length > 99 ? '99+' : artifacts.length}
                </span>
              ) : null}
            </button>
          </div>

          <TaskChat
            session={session}
            messages={messages}
            artifacts={artifacts}
            loading={loadingDetail}
            readOnly={isArchived}
            onSend={handleSend}
            onOpenArtifact={handleOpenArtifact}
          />

          {isArchived ? (
            <div className="flex h-[68px] shrink-0 items-center justify-center border-t border-border bg-card px-6">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                该任务已归档，仅可查看历史消息（任务列表中可取消归档）
              </p>
            </div>
          ) : (
            <PromptInput
              key={session.id}
              value={input}
              onValueChange={setInput}
              onSubmit={handleSubmit}
              isRunning={Boolean(isRunning)}
              model={session.model ?? null}
              onModelChange={(model) => void setModel(model)}
            />
          )}

          <ArtifactDrawer
            open={artifactOpen}
            sessionId={session.id}
            artifacts={artifacts}
            selectedId={selectedArtifactId}
            showFileList={artifactShowFiles}
            onSelect={setSelectedArtifactId}
            onClose={() => setArtifactOpen(false)}
          />
        </main>
      </div>
    </div>
  )
}
