import { useEffect, useRef, useState } from 'react'
import { CalendarCheck, CalendarRange, Check, Copy, FileText, Sun } from 'lucide-react'
import { format } from 'date-fns'
import type {
  AgentMessage,
  AgentSession,
  ArtifactMeta,
  ChatAttachment
} from '@shared/types/analysis'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { Conversation, ConversationContent } from '@renderer/components/ai-elements/conversation'
import {
  Message,
  MessageActions,
  MessageAvatar,
  MessageContent,
  MessageHeader,
  Response,
  StreamingPreview
} from '@renderer/components/ai-elements/message'
import { Task, type TaskStatus } from '@renderer/components/ai-elements/task'
import { Tool } from '@renderer/components/ai-elements/tool'
import { Loader } from '@renderer/components/ai-elements/loader'
import { Suggestion } from '@renderer/components/ai-elements/suggestion'
import { FileIconFor, formatSize } from './artifact-utils'
import { buildFixedPrompt } from './prompts'

interface TaskChatProps {
  session: AgentSession
  messages: AgentMessage[]
  artifacts: ArtifactMeta[]
  loading: boolean
  readOnly?: boolean
  onSend: (content: string) => void
  /** 消息内文件卡打开：只预览该文件，不展示文件树 */
  onOpenArtifact: (artifactId: string, options?: { showFileList?: boolean }) => void
}

const SUGGESTIONS = [
  '今天的经营情况怎么样？帮我找出异常。',
  '最近 30 天哪些库存滞销最严重？',
  '分析近 90 天会员复购与余额消费。'
]

function iconOfSession(session: AgentSession) {
  if (session.type === 'daily') return Sun
  if (session.type === 'weekly') return CalendarCheck
  if (session.type === 'monthly') return CalendarRange
  return FileText
}

function timeLabel(value: string): string {
  return format(new Date(value), 'HH:mm')
}

/** 用户消息 hover 时间：非今天的消息补上日期，避免跨天会话混淆 */
function hoverTimeLabel(value: string): string {
  const date = new Date(value)
  const today = new Date()
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  if (sameDay) return format(date, 'HH:mm')
  const pattern = date.getFullYear() === today.getFullYear() ? 'MM-dd HH:mm' : 'yyyy-MM-dd HH:mm'
  return format(date, pattern)
}

/** 复制按钮：hover 显现，点击后短暂反馈成功（对齐 nexa） */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 剪贴板不可用时静默失败，不打断阅读
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      title="复制"
      aria-label={copied ? '已复制' : '复制'}
      className={cn(
        'shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity duration-150 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100',
        copied && 'opacity-100'
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </button>
  )
}

/** 用户上传的图片缩略图：通过附件读取 IPC 取 dataURL */
function AttachmentThumb({ attachment }: { attachment: ChatAttachment }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    void window.nova.agent
      .readAttachment(attachment.path)
      .then((result) => {
        if (!active) return
        if (result.ok) setSrc(result.data.dataUrl)
        else setFailed(true)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [attachment.path])

  return (
    <div className="h-24 w-24 overflow-hidden rounded-lg border border-border bg-muted">
      {src ? (
        <img
          src={src}
          alt={attachment.name}
          title={attachment.name}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] text-muted-foreground">
          {failed ? '图片不可用' : '加载中…'}
        </span>
      )}
    </div>
  )
}

/** 消息内产物卡：点击打开右侧产物面板 */
function ArtifactCard({ artifact, onOpen }: { artifact: ArtifactMeta; onOpen: () => void }) {
  const name = artifact.path.split('/').pop() ?? artifact.title
  return (
    <button
      type="button"
      onClick={onOpen}
      title={artifact.path}
      className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-muted px-3 py-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <FileIconFor file={artifact} className="h-5 w-5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{name}</span>
        <span className="block truncate text-[10px] text-muted-foreground">
          {formatSize(artifact.size)}
        </span>
      </span>
    </button>
  )
}

function EmptyState({
  session,
  readOnly,
  onSend
}: {
  session: AgentSession
  readOnly?: boolean
  onSend: (content: string) => void
}) {
  const Icon = iconOfSession(session)

  if (readOnly) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-muted-foreground shadow-sm">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="text-body font-medium">{session.title}</p>
        <p className="text-meta text-muted-foreground">该任务已归档，取消归档后可继续对话。</p>
      </div>
    )
  }

  if (session.type === 'free') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-muted-foreground shadow-sm">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="text-body font-medium">{session.title}</p>
        <p className="text-meta text-muted-foreground">自由对话任务，数据范围 {session.rangeLabel}</p>
        <Suggestion items={SUGGESTIONS} onSelect={onSend} />
      </div>
    )
  }

  const label = session.type === 'daily' ? '日报' : session.type === 'weekly' ? '周报' : '月报'
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-muted-foreground shadow-sm">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="text-body font-medium">{session.title}</p>
      <p className="max-w-[360px] text-meta text-muted-foreground">
        数据范围 {session.rangeLabel}
        {session.schedule ? ` · ${session.schedule}自动执行` : ''}
        <br />
        点击生成，Nova 会基于真实 MySQL 数据完成分析并发布产物。
      </p>
      <Button type="button" size="sm" onClick={() => onSend(buildFixedPrompt(session))}>
        生成{label}
      </Button>
    </div>
  )
}

/** 助手消息：轨迹折叠条 + 正文 + 操作栏，结构与 nexa 对齐 */
function AssistantMessage({
  message,
  artifacts,
  onOpenArtifact
}: {
  message: AgentMessage
  artifacts: ArtifactMeta[]
  onOpenArtifact: (artifactId: string, options?: { showFileList?: boolean }) => void
}) {
  const related = message.artifactIds
    .map((id) => artifacts.find((artifact) => artifact.id === id))
    .filter((artifact): artifact is ArtifactMeta => Boolean(artifact))
  const isStreaming = message.status === 'streaming'
  const taskStatus: TaskStatus = isStreaming
    ? 'running'
    : message.status === 'failed'
      ? 'failed'
      : message.status === 'stopped'
        ? 'paused'
        : 'completed'
  const durationLabel = (() => {
    const total = message.toolCalls.reduce((sum, call) => sum + (call.durationMs ?? 0), 0)
    if (total <= 0) return null
    return total < 1000 ? `${total}ms` : `${(total / 1000).toFixed(1)}s`
  })()

  return (
    <Message from="assistant">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <MessageHeader>
          <MessageAvatar className="mt-0 h-5 w-5" />
          <span className="font-medium text-foreground">Nova</span>
        </MessageHeader>

        {message.toolCalls.length > 0 ? (
          <Task status={taskStatus} durationLabel={durationLabel}>
            {message.toolCalls.map((toolCall) => (
              <Tool
                key={toolCall.id}
                toolName={toolCall.name}
                args={toolCall.input}
                result={toolCall.summary}
                success={toolCall.status === 'success'}
                running={toolCall.status === 'running'}
                durationMs={toolCall.durationMs}
              />
            ))}
          </Task>
        ) : null}

        {message.content || isStreaming ? (
          <MessageContent from="assistant">
            <div
              key={isStreaming ? 'streaming' : 'done'}
              className="transition-opacity duration-150"
            >
              {isStreaming ? (
                <StreamingPreview content={message.content} />
              ) : (
                <Response content={message.content} />
              )}
            </div>
            {!isStreaming && related.length > 0 ? (
              <div
                className={cn(
                  'mt-2 grid gap-2',
                  related.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
                )}
              >
                {related.map((artifact) => (
                  <ArtifactCard
                    key={artifact.id}
                    artifact={artifact}
                    onOpen={() => onOpenArtifact(artifact.id, { showFileList: false })}
                  />
                ))}
              </div>
            ) : null}
          </MessageContent>
        ) : null}

        {!isStreaming && message.content ? (
          <MessageActions>
            <CopyButton text={message.content} />
            <span className="tabular-nums">{timeLabel(message.createdAt)}</span>
          </MessageActions>
        ) : null}
      </div>
    </Message>
  )
}

/** 任务对话区：自动滚底，用户上滚后保持位置 */
export function TaskChat({
  session,
  messages,
  artifacts,
  loading,
  readOnly,
  onSend,
  onOpenArtifact
}: TaskChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const lastMessage = messages[messages.length - 1]
  const tail = lastMessage
    ? `${lastMessage.id}:${lastMessage.content.length}:${lastMessage.toolCalls.length}`
    : ''

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    if (stickToBottom.current) element.scrollTop = element.scrollHeight
  }, [tail, session.id])

  function handleScroll(): void {
    const element = scrollRef.current
    if (!element) return
    stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120
  }

  return (
    <Conversation scrollRef={scrollRef} onScroll={handleScroll}>
      <ConversationContent>
        {loading ? <Loader label="正在加载会话…" /> : null}
        {!loading && messages.length === 0 ? (
          <div className="min-h-[420px]">
            <EmptyState session={session} readOnly={readOnly} onSend={onSend} />
          </div>
        ) : null}
        {messages.map((message) =>
          message.role === 'user' ? (
            <Message key={message.id} from="user">
              <div className="flex max-w-[80%] flex-col items-end gap-1">
                <MessageContent from="user">
                  {message.content ? <p>{message.content}</p> : null}
                  {message.attachments?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {message.attachments.map((attachment) => (
                        <AttachmentThumb key={attachment.path} attachment={attachment} />
                      ))}
                    </div>
                  ) : null}
                </MessageContent>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                    {hoverTimeLabel(message.createdAt)}
                  </span>
                  <CopyButton text={message.content} />
                </div>
              </div>
            </Message>
          ) : (
            <AssistantMessage
              key={message.id}
              message={message}
              artifacts={artifacts}
              onOpenArtifact={onOpenArtifact}
            />
          )
        )}
        <div className="h-2" />
      </ConversationContent>
    </Conversation>
  )
}
