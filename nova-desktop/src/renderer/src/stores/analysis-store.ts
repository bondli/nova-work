/**
 * 经营分析状态机。
 * 主进程通过 analysis:event 推送；store 负责会话列表、消息增量、工具卡与产物索引。
 */
import { create } from 'zustand'
import { toast } from 'sonner'
import type {
  AgentMessage,
  AgentSession,
  AgentToolCall,
  AnalysisEvent,
  ArtifactMeta,
  AttachmentInput
} from '@shared/types/analysis'
import { GROUP_ORDER } from '@shared/types/analysis'
import { unwrap } from '@renderer/lib/ipc'

interface AnalysisState {
  sessions: AgentSession[]
  selectedId: string | null
  /** 每个会话已加载的消息（不含正在流式生成的那条） */
  details: Record<string, AgentMessage[]>
  /** 每个会话的产物索引 */
  artifacts: Record<string, ArtifactMeta[]>
  /** 正在流式生成的助手消息 */
  liveMessages: Record<string, AgentMessage>
  /** 事件序号，用于丢弃乱序事件 */
  lastSeq: Record<string, number>
  loadingList: boolean
  loadingDetail: boolean
  initialize: () => Promise<void>
  selectSession: (sessionId: string) => Promise<void>
  refreshSessions: () => Promise<void>
  createFree: () => Promise<void>
  send: (
    content: string,
    options?: { attachments?: AttachmentInput[]; skillId?: string }
  ) => Promise<boolean>
  stop: () => Promise<void>
  setModel: (model: string) => Promise<void>
  renameSession: (sessionId: string, title: string) => Promise<void>
  setArchived: (sessionId: string, archived: boolean) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  handleEvent: (event: AnalysisEvent) => void
}

const EMPTY_MESSAGES: AgentMessage[] = []
const EMPTY_ARTIFACTS: ArtifactMeta[] = []

function sortSessions(sessions: AgentSession[]): AgentSession[] {
  return [...sessions].sort((a, b) => {
    const groupDelta = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)
    if (groupDelta !== 0) return groupDelta
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

/** 当前选中会话的派生数据 */
export function selectMessages(state: AnalysisState): AgentMessage[] {
  if (!state.selectedId) return EMPTY_MESSAGES
  const base = state.details[state.selectedId] ?? EMPTY_MESSAGES
  const live = state.liveMessages[state.selectedId]
  if (!live) return base
  return base.some((message) => message.id === live.id) ? base : [...base, live]
}

/** rAF 批量合并流式增量，避免每个 token 触发一次渲染 */
const pendingDeltas = new Map<string, { messageId: string; text: string }>()
let rafId: number | null = null

function flushDeltas(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  if (pendingDeltas.size === 0) return

  const entries = [...pendingDeltas.entries()]
  pendingDeltas.clear()
  useAnalysisStore.setState((state) => {
    const live = { ...state.liveMessages }
    for (const [sessionId, { messageId, text }] of entries) {
      const current = live[sessionId]
      if (!current || current.id !== messageId) continue
      live[sessionId] = { ...current, content: current.content + text }
    }
    return { liveMessages: live }
  })
}

function queueDelta(sessionId: string, messageId: string, delta: string): void {
  const existing = pendingDeltas.get(sessionId)
  pendingDeltas.set(sessionId, {
    messageId,
    text: (existing?.messageId === messageId ? existing.text : '') + delta
  })
  if (rafId === null) rafId = requestAnimationFrame(flushDeltas)
}

/** 更新指定助手消息（同时覆盖 live 与已落盘的消息） */
function patchMessage(
  state: AnalysisState,
  sessionId: string,
  messageId: string,
  update: (message: AgentMessage) => AgentMessage
): Partial<AnalysisState> {
  const detail = state.details[sessionId]
  let nextDetail = detail
  if (detail) {
    nextDetail = detail.map((message) => (message.id === messageId ? update(message) : message))
  }

  const live = state.liveMessages[sessionId]
  const nextLive =
    live && live.id === messageId
      ? { ...state.liveMessages, [sessionId]: update(live) }
      : state.liveMessages

  return { details: nextDetail ? { ...state.details, [sessionId]: nextDetail } : state.details, liveMessages: nextLive }
}

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  sessions: [],
  selectedId: null,
  details: {},
  artifacts: {},
  liveMessages: {},
  lastSeq: {},
  loadingList: false,
  loadingDetail: false,

  initialize: async () => {
    if (get().loadingList) return
    set({ loadingList: true })
    try {
      const sessions = sortSessions(unwrap(await window.nova.agent.list()))
      set({ sessions, loadingList: false })
      const current = get().selectedId
      const target =
        (current && sessions.some((session) => session.id === current) ? current : null) ??
        sessions[0]?.id ??
        null
      if (target) await get().selectSession(target)
    } catch (error) {
      set({ loadingList: false })
      toast.error(error instanceof Error ? error.message : '会话列表加载失败')
    }
  },

  selectSession: async (sessionId) => {
    set({ selectedId: sessionId, loadingDetail: true })
    try {
      const detail = unwrap(await window.nova.agent.messages(sessionId))
      // 加载期间切换到别的任务时丢弃旧响应
      if (get().selectedId !== sessionId) return
      set((state) => ({
        details: { ...state.details, [sessionId]: detail.messages },
        artifacts: { ...state.artifacts, [sessionId]: detail.artifacts },
        sessions: state.sessions.map((session) =>
          session.id === sessionId ? detail.session : session
        ),
        loadingDetail: false
      }))
    } catch (error) {
      set({ loadingDetail: false })
      toast.error(error instanceof Error ? error.message : '会话内容加载失败')
    }
  },

  refreshSessions: async () => {
    try {
      set({ sessions: sortSessions(unwrap(await window.nova.agent.list())) })
    } catch {
      // 静默失败：列表会在下次进入页面时重试
    }
  },

  createFree: async () => {
    try {
      const session = unwrap(await window.nova.agent.create({ group: 'free' }))
      set((state) => ({ sessions: sortSessions([session, ...state.sessions]) }))
      await get().selectSession(session.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '新建对话失败')
    }
  },

  send: async (content, options) => {
    const sessionId = get().selectedId
    if (!sessionId) return false
    const trimmed = content.trim()
    const attachments = options?.attachments
    if (!trimmed && !attachments?.length) return false

    try {
      const message = unwrap(
        await window.nova.agent.send({
          sessionId,
          content: trimmed,
          attachments,
          skillId: options?.skillId
        })
      )
      set((state) => ({
        details: {
          ...state.details,
          [sessionId]: [...(state.details[sessionId] ?? EMPTY_MESSAGES), message]
        },
        sessions: state.sessions.map((session) =>
          session.id === sessionId ? { ...session, status: 'running', error: undefined } : session
        )
      }))
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '发送失败')
      return false
    }
  },

  setModel: async (model) => {
    const sessionId = get().selectedId
    if (!sessionId) return
    try {
      const updated = unwrap(await window.nova.agent.setModel({ sessionId, model }))
      set((state) => ({
        sessions: state.sessions.map((session) => (session.id === sessionId ? updated : session))
      }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '切换模型失败')
    }
  },

  stop: async () => {
    const sessionId = get().selectedId
    if (!sessionId) return
    try {
      unwrap(await window.nova.agent.stop(sessionId))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '停止失败')
    }
  },

  renameSession: async (sessionId, title) => {
    try {
      const updated = unwrap(await window.nova.agent.rename({ sessionId, title }))
      set((state) => ({
        sessions: state.sessions.map((session) => (session.id === sessionId ? updated : session))
      }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '重命名失败')
    }
  },

  setArchived: async (sessionId, archived) => {
    try {
      const updated = unwrap(await window.nova.agent.archive({ sessionId, archived }))
      set((state) => ({
        sessions: sortSessions(
          state.sessions.map((session) => (session.id === sessionId ? updated : session))
        )
      }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : archived ? '归档失败' : '取消归档失败')
    }
  },

  deleteSession: async (sessionId) => {
    try {
      unwrap(await window.nova.agent.remove(sessionId))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败')
      return
    }

    const state = get()
    const remaining = state.sessions.filter((session) => session.id !== sessionId)
    const details = { ...state.details }
    const artifacts = { ...state.artifacts }
    const liveMessages = { ...state.liveMessages }
    const lastSeq = { ...state.lastSeq }
    delete details[sessionId]
    delete artifacts[sessionId]
    delete liveMessages[sessionId]
    delete lastSeq[sessionId]

    const deletingCurrent = state.selectedId === sessionId
    const nextSelected = deletingCurrent
      ? (remaining[0]?.id ?? null)
      : state.selectedId
    set({ sessions: remaining, details, artifacts, liveMessages, lastSeq, selectedId: nextSelected })
    if (deletingCurrent && nextSelected) await get().selectSession(nextSelected)
  },

  handleEvent: (event) => {
    const sessionId =
      'sessionId' in event
        ? event.sessionId
        : event.type === 'session.created'
          ? event.session.id
          : undefined

    if (sessionId) {
      const last = get().lastSeq[sessionId] ?? 0
      if (event.seq <= last) return
      set((state) => ({ lastSeq: { ...state.lastSeq, [sessionId]: event.seq } }))
    }

    switch (event.type) {
      case 'session.created':
        set((state) =>
          state.sessions.some((session) => session.id === event.session.id)
            ? state
            : { sessions: sortSessions([event.session, ...state.sessions]) }
        )
        break

      case 'session.title':
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === event.sessionId ? { ...session, title: event.title } : session
          )
        }))
        break

      case 'session.status':
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === event.sessionId
              ? {
                  ...session,
                  status: event.status,
                  error: event.error,
                  updatedAt: new Date().toISOString()
                }
              : session
          )
        }))
        break

      case 'message.start':
        set((state) => ({
          liveMessages: {
            ...state.liveMessages,
            [event.sessionId]: {
              id: event.messageId,
              sessionId: event.sessionId,
              role: 'assistant',
              content: '',
              createdAt: event.createdAt,
              status: 'streaming',
              toolCalls: [],
              artifactIds: []
            }
          }
        }))
        break

      case 'message.delta':
        queueDelta(event.sessionId, event.messageId, event.delta)
        break

      case 'tool.start':
        set((state) =>
          patchMessage(state, event.sessionId, event.messageId, (message) => ({
            ...message,
            toolCalls: [
              ...message.toolCalls,
              { id: event.toolCallId, name: event.name, input: event.input, status: 'running' }
            ]
          }))
        )
        break

      case 'tool.end':
        set((state) =>
          patchMessage(state, event.sessionId, event.messageId, (message) => ({
            ...message,
            toolCalls: message.toolCalls.map((toolCall) =>
              toolCall.id === event.toolCallId
                ? {
                    ...toolCall,
                    status: event.status,
                    summary: event.summary,
                    durationMs: event.durationMs
                  }
                : toolCall
            )
          }))
        )
        break

      case 'message.done': {
        flushDeltas()
        set((state) => {
          const base = state.details[event.sessionId] ?? EMPTY_MESSAGES
          const exists = base.some((message) => message.id === event.message.id)
          const messages = exists
            ? base.map((message) =>
                message.id === event.message.id ? event.message : message
              )
            : [...base, event.message]
          const live = { ...state.liveMessages }
          delete live[event.sessionId]
          return {
            details: { ...state.details, [event.sessionId]: messages },
            liveMessages: live
          }
        })
        break
      }

      case 'artifact.created':
        set((state) => {
          const list = state.artifacts[event.sessionId] ?? EMPTY_ARTIFACTS
          const next = list.some((artifact) => artifact.id === event.artifact.id)
            ? list.map((artifact) =>
                artifact.id === event.artifact.id ? event.artifact : artifact
              )
            : [...list, event.artifact]
          return { artifacts: { ...state.artifacts, [event.sessionId]: next } }
        })
        break

      case 'error':
        toast.error(event.message)
        break

      case 'run.start':
      case 'run.end':
        break
    }
  }
}))

/** 供组件读取的稳定空数组 */
export { EMPTY_ARTIFACTS, EMPTY_MESSAGES }

/** 工具卡列表类型别名，方便组件复用 */
export type { AgentToolCall }
