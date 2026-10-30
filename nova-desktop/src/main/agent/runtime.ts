/**
 * Agent 运行时。
 * 负责单个会话的串行执行：组装上下文 → pi-agent-core 流式循环 → 工具执行 → 持久化与事件推送。
 */
import { randomUUID } from 'node:crypto'
import type {
  AnalysisEvent,
  AgentMessage,
  AgentToolCall,
  ArtifactMeta,
  AttachmentInput
} from '@shared/types/analysis'
import type { Role } from '@shared/types/auth'
import type {
  AssistantMessage as PiAssistantMessage,
  Usage
} from '@earendil-works/pi-ai'
import {
  Agent,
  type AgentMessage as PiAgentMessage,
  type AgentTool
} from '@earendil-works/pi-agent-core'
import { saveAttachments } from './attachments'
import { findSkill } from './skills'
import { getAgentConfig } from './config'
import { buildSystemPrompt } from './prompt'
import { buildMemoryBlock, maybeExtractMemories } from './memory'
import { AGENT_TOOLS, type ToolContext } from './tools'
import { models, resolveModel } from './provider'
import {
  appendMessage,
  assertSessionExists,
  getMessages,
  getSessionDetail,
  markRunFinished,
  updateSession,
  upsertArtifact
} from './session-store'
import { scanArtifacts } from './workspace'

const MAX_TOOL_ROUNDS = 6

export type EventSink = (event: AnalysisEvent) => void

/** 分布式去掉 seq，保留联合类型每个分支的字段 */
type AnalysisEventPayload = AnalysisEvent extends infer T
  ? T extends AnalysisEvent
    ? Omit<T, 'seq'>
    : never
  : never

/** 运行中的会话 → 中止句柄；同一会话同一时刻只允许一个 run */
const activeRuns = new Map<string, { abort: () => void }>()

let seqCounter = 0

function emit(sink: EventSink, event: AnalysisEventPayload): void {
  sink({ ...event, seq: ++seqCounter } as AnalysisEvent)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误'
}

/**
 * 用户消息进入上下文前补上技能指令与附件说明。
 * 这些说明只影响模型上下文，不写回消息内容，避免气泡里出现内部提示。
 */
function annotateUserMessage(message: AgentMessage): string {
  const parts: string[] = []
  if (message.content.trim()) parts.push(message.content)

  const skill = findSkill(message.skillId)
  if (skill) parts.push(`【本轮使用技能：${skill.name}】\n${skill.promptHint}`)

  if (message.attachments?.length) {
    const paths = message.attachments.map((attachment) => `- ${attachment.path}`).join('\n')
    parts.push(
      `【用户上传了 ${message.attachments.length} 张图片】\n${paths}\n当前模型无法直接读取图片像素，请确认已收到附件；如需依据图片内容分析，请让用户补充图片中的关键信息。`
    )
  }

  return parts.join('\n\n')
}

function emptyUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
  }
}

/** 从历史消息重建 pi 上下文：只保留文本与附件说明，工具细节不进入新上下文 */
function buildHistory(
  messages: AgentMessage[],
  modelId: string
): PiAgentMessage[] {
  return messages
    .map((message): PiAgentMessage | null => {
      const timestamp = Date.parse(message.createdAt) || Date.now()
      if (message.role === 'user') {
        const content = annotateUserMessage(message)
        return content.trim() ? { role: 'user', content, timestamp } : null
      }

      const content = message.content.trim()
      if (!content) return null
      const assistant: PiAssistantMessage = {
        role: 'assistant',
        content: [{ type: 'text', text: content }],
        api: 'openai-completions',
        provider: 'deepseek',
        model: modelId,
        usage: emptyUsage(),
        stopReason: 'stop',
        timestamp
      }
      return assistant
    })
    .filter((message): message is PiAgentMessage => message !== null)
    .slice(-20)
}

/** 把经营工具包装成 pi-agent-core 的 AgentTool */
function buildAgentTools(context: ToolContext): AgentTool[] {
  return AGENT_TOOLS.map((definition) => ({
    name: definition.name,
    label: definition.name,
    description: definition.description,
    parameters: definition.parameters as unknown as AgentTool['parameters'],
    execute: async (_toolCallId, params) => {
      const output = await definition.execute(params as unknown, context)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output.data) }],
        details: { summary: output.summary }
      }
    }
  }))
}

/** 从工具结果里取出可展示的一句话摘要 */
function toolSummary(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined
  const details = (result as { details?: unknown }).details
  if (details && typeof details === 'object') {
    const summary = (details as { summary?: unknown }).summary
    if (typeof summary === 'string' && summary) return summary
  }
  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content
  const firstText = content?.find((item) => item.type === 'text' && item.text)
  return firstText?.text
}

function isRunning(sessionId: string): boolean {
  return activeRuns.has(sessionId)
}

/**
 * 发送一条用户消息并立即启动运行。
 * 返回值是已持久化的用户消息；后续助手内容通过 analysis:event 流式推送。
 */
export async function sendMessage(params: {
  sessionId: string
  content: string
  attachments?: AttachmentInput[]
  skillId?: string
  role: Role
  sink: EventSink
}): Promise<AgentMessage> {
  if (isRunning(params.sessionId)) throw new Error('当前任务正在运行，请先停止或等待完成')

  const session = await assertSessionExists(params.sessionId)
  const attachments = saveAttachments(params.sessionId, params.attachments)
  const skill = findSkill(params.skillId)
  const now = new Date().toISOString()
  const userMessage: AgentMessage = {
    id: randomUUID(),
    sessionId: params.sessionId,
    role: 'user',
    content: params.content,
    createdAt: now,
    status: 'done',
    toolCalls: [],
    artifactIds: [],
    attachments: attachments.length > 0 ? attachments : undefined,
    skillId: skill?.id
  }

  await appendMessage(params.sessionId, userMessage)

  // 自由对话首次提问后，用问题前 20 字作为标题；仅发图时用「图片消息」
  if (session.group === 'free' && (session.title === '新对话' || !session.title.trim())) {
    const title =
      params.content.replace(/\s+/g, ' ').trim().slice(0, 20) ||
      (attachments.length > 0 ? '图片消息' : '新对话')
    await updateSession(params.sessionId, { title })
    emit(params.sink, { type: 'session.title', sessionId: params.sessionId, title })
  }

  void executeRun(params.sessionId, params.role, params.sink)
  return userMessage
}

/** 停止当前运行 */
export function stopRun(sessionId: string): boolean {
  const run = activeRuns.get(sessionId)
  if (!run) return false
  run.abort()
  return true
}

/** 实际执行一次 run；所有异常都在内部收口，不让 Promise 泄漏 */
async function executeRun(sessionId: string, role: Role, sink: EventSink): Promise<void> {
  if (activeRuns.has(sessionId)) return

  const runId = randomUUID()
  const assistant: AgentMessage = {
    id: randomUUID(),
    sessionId,
    role: 'assistant',
    content: '',
    createdAt: new Date().toISOString(),
    status: 'streaming',
    toolCalls: [],
    artifactIds: []
  }

  let pendingDelta = ''
  let flushTimer: NodeJS.Timeout | null = null
  /** 助手消息是否已落盘，避免失败分支重复追加 */
  let assistantPersisted = false
  /** 用户是否点了停止，作为退出时的分支依据 */
  let stopped = false
  /** 模型或传输层错误，pi 会以 message.stopReason === 'error' 结束 */
  let providerError: string | undefined

  const flush = (): void => {
    if (!pendingDelta) return
    emit(sink, {
      type: 'message.delta',
      sessionId,
      messageId: assistant.id,
      delta: pendingDelta
    })
    pendingDelta = ''
  }
  /** 30–50ms 批量推送增量，避免每个 token 一次 IPC */
  const pushDelta = (delta: string): void => {
    assistant.content += delta
    pendingDelta += delta
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null
        flush()
      }, 40)
    }
  }
  const finishFlush = (): void => {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    flush()
  }

  try {
    const detail = await getSessionDetail(sessionId)
    const config = await getAgentConfig()
    const existingArtifactIds = new Set(detail.artifacts.map((artifact) => artifact.id))
    const newArtifacts = new Map<string, ArtifactMeta>()

    await updateSession(sessionId, { status: 'running', error: undefined })
    emit(sink, { type: 'session.status', sessionId, status: 'running' })
    emit(sink, { type: 'run.start', sessionId, runId })
    emit(sink, {
      type: 'message.start',
      sessionId,
      messageId: assistant.id,
      createdAt: assistant.createdAt
    })
    assistant.scheduled = detail.session.type !== 'free'

    const toolContext: ToolContext = {
      sessionId,
      role,
      messageId: assistant.id,
      onArtifact: (artifact) => {
        if (newArtifacts.has(artifact.id)) return
        newArtifacts.set(artifact.id, artifact)
        assistant.artifactIds.push(artifact.id)
        emit(sink, { type: 'artifact.created', sessionId, artifact })
        void upsertArtifact(sessionId, artifact)
      }
    }

    // 会话级模型优先，未选择时回退到全局配置
    const modelId = detail.session.model ?? config.model.model
    const model = resolveModel(config.model.baseUrl, modelId)
    const history = buildHistory(detail.messages, modelId)
    const tools = buildAgentTools(toolContext)
    // 长期记忆按层注入 system prompt；读取失败时为空串
    const memoryBlock = await buildMemoryBlock()

    let turns = 0
    const agent = new Agent({
      initialState: {
        systemPrompt: buildSystemPrompt(role, config.database, memoryBlock),
        model,
        tools,
        messages: history
      },
      streamFn: models.streamSimple.bind(models),
      getApiKey: () => config.model.apiKey,
      toolExecution: 'sequential',
      finishTurn: async () => {
        turns += 1
        return turns >= MAX_TOOL_ROUNDS ? { action: 'end' } : undefined
      }
    })
    activeRuns.set(sessionId, {
      abort: () => {
        stopped = true
        agent.abort()
      }
    })

    agent.subscribe((event) => {
      if (event.type === 'message_update' && event.message.role === 'assistant') {
        const update = event.assistantMessageEvent
        if (update.type === 'text_delta') pushDelta(update.delta)
        return
      }

      if (event.type === 'message_end' && event.message.role === 'assistant') {
        const message = event.message as PiAssistantMessage
        if (message.stopReason === 'error') {
          providerError = message.errorMessage ?? '模型调用失败'
        } else if (message.stopReason === 'aborted') {
          stopped = true
        }
        return
      }

      if (event.type === 'tool_execution_start') {
        const toolCall: AgentToolCall = {
          id: event.toolCallId,
          name: event.toolName,
          input: event.args,
          status: 'running'
        }
        assistant.toolCalls.push(toolCall)
        emit(sink, {
          type: 'tool.start',
          sessionId,
          messageId: assistant.id,
          toolCallId: event.toolCallId,
          name: event.toolName,
          input: event.args
        })
        return
      }

      if (event.type === 'tool_execution_end') {
        const toolCall = assistant.toolCalls.find((call) => call.id === event.toolCallId)
        if (!toolCall) return
        const summary = toolSummary(event.result) ?? (event.isError ? '执行失败' : '完成')
        toolCall.status = event.isError ? 'error' : 'success'
        toolCall.summary = summary
        toolCall.durationMs = event.durationMs ?? 0
        emit(sink, {
          type: 'tool.end',
          sessionId,
          messageId: assistant.id,
          toolCallId: event.toolCallId,
          status: toolCall.status,
          summary,
          durationMs: toolCall.durationMs
        })
      }
    })

    // 历史里已经包含本轮用户消息，直接续跑比 prompt 更贴合 pi 的 transcript
    await agent.continue()

    if (stopped) {
      assistant.status = 'stopped'
      finishFlush()
      await appendMessage(sessionId, assistant)
      assistantPersisted = true
      emit(sink, { type: 'message.done', sessionId, messageId: assistant.id, message: assistant })
      await markRunFinished(sessionId, 'paused')
      emit(sink, { type: 'session.status', sessionId, status: 'paused' })
      emit(sink, { type: 'run.end', sessionId, status: 'stopped' })
      return
    }

    if (providerError) throw new Error(providerError)

    // 兜底扫描 agents/ 目录，覆盖模型忘记调用 publish_artifact 的情况
    for (const artifact of await scanArtifacts(sessionId, assistant.id)) {
      if (existingArtifactIds.has(artifact.id) || newArtifacts.has(artifact.id)) continue
      newArtifacts.set(artifact.id, artifact)
      assistant.artifactIds.push(artifact.id)
      emit(sink, { type: 'artifact.created', sessionId, artifact })
      await upsertArtifact(sessionId, artifact)
    }

    assistant.status = 'done'
    if (!assistant.content.trim()) assistant.content = '已完成分析。'
    finishFlush()
    await appendMessage(sessionId, assistant)
    assistantPersisted = true
    emit(sink, { type: 'message.done', sessionId, messageId: assistant.id, message: assistant })
    await markRunFinished(sessionId, 'completed')
    emit(sink, { type: 'session.status', sessionId, status: 'completed' })
    emit(sink, { type: 'run.end', sessionId, status: 'done' })

    // 每 3 轮在后台抽取一次长期记忆，不阻塞本轮结束
    void getMessages(sessionId)
      .then((messages) => maybeExtractMemories(sessionId, messages))
      .catch(() => undefined)
  } catch (error) {
    const aborted = stopped
    const message = aborted ? '' : errorMessage(error)
    assistant.status = aborted ? 'stopped' : 'failed'
    if (!aborted && !assistant.content.trim()) assistant.content = `分析失败：${message}`
    finishFlush()

    try {
      if (!assistantPersisted) {
        await appendMessage(sessionId, assistant)
        assistantPersisted = true
      }
      emit(sink, { type: 'message.done', sessionId, messageId: assistant.id, message: assistant })
      await markRunFinished(sessionId, aborted ? 'paused' : 'failed', aborted ? undefined : message)
      emit(sink, {
        type: 'session.status',
        sessionId,
        status: aborted ? 'paused' : 'failed',
        error: aborted ? undefined : message
      })
      if (!aborted) emit(sink, { type: 'error', sessionId, message })
      emit(sink, {
        type: 'run.end',
        sessionId,
        status: aborted ? 'stopped' : 'failed',
        error: aborted ? undefined : message
      })
    } catch (persistError) {
      emit(sink, { type: 'error', sessionId, message: `${message}（且消息持久化失败）` })
      emit(sink, { type: 'run.end', sessionId, status: 'failed', error: message })
      console.error('[agent] persist failed', persistError)
    }
  } finally {
    if (flushTimer) clearTimeout(flushTimer)
    activeRuns.delete(sessionId)
  }
}
