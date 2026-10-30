/**
 * 经营分析（Agent）共享类型。
 * 主进程 runtime、preload 与渲染层 store 共用同一份事件与会话契约。
 */

/** 左栏分组顺序固定：经营分析 / 自由对话 / 归档任务 */
export type AgentGroupKey = 'analysis' | 'free' | 'archive'

/** 任务类型：三个固定定时任务 + 自由对话 */
export type AgentSessionType = 'daily' | 'weekly' | 'monthly' | 'free'

/** 会话状态；idle 表示尚未生成 */
export type AgentSessionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed'

export interface AgentSession {
  id: string
  title: string
  group: AgentGroupKey
  type: AgentSessionType
  status: AgentSessionStatus
  /** 展示用数据范围，例如「今天」「10/12 - 10/18」「近 30 天」 */
  rangeLabel: string
  /** 固定任务自动执行时间文案，例如「每晚 21:20」 */
  schedule?: string
  /** 会话级模型；未设置时使用全局配置的默认模型 */
  model?: string
  createdAt: string
  updatedAt: string
  lastRunAt?: string
  error?: string
}

/** 一次工具调用的展示数据 */
export interface AgentToolCall {
  id: string
  name: string
  input: unknown
  status: 'running' | 'success' | 'error'
  /** 成功时的一句话摘要；失败时为错误原因 */
  summary?: string
  durationMs?: number
}

export interface AgentMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  status: 'streaming' | 'done' | 'stopped' | 'failed'
  toolCalls: AgentToolCall[]
  /** 该条回复关联的产物 id */
  artifactIds: string[]
  /** 用户消息携带的图片附件 */
  attachments?: ChatAttachment[]
  /** 本条用户消息使用的技能 id */
  skillId?: string
  /** 定时任务标记 */
  scheduled?: boolean
}

/** 已落盘的聊天附件（图片） */
export interface ChatAttachment {
  path: string
  name: string
  mimeType: string
  size: number
}

/** 渲染层提交的附件（dataURL，由主进程落盘） */
export interface AttachmentInput {
  name: string
  mimeType: string
  dataUrl: string
}

/** 内置技能：命中后在用户问题前注入 promptHint */
export interface SkillInfo {
  id: string
  name: string
  description: string
  promptHint: string
  builtin: boolean
}

/** 可选模型 */
export interface ModelOption {
  id: string
  label: string
  description?: string
}

/** 输入区需要的能力列表 */
export interface AgentCapabilities {
  models: ModelOption[]
  /** 全局配置的默认模型；会话未指定模型时生效 */
  defaultModel: string
  skills: SkillInfo[]
}

/** 产物类型决定预览方式 */
export type ArtifactKind = 'html' | 'csv' | 'md' | 'text'

export interface ArtifactMeta {
  id: string
  sessionId: string
  title: string
  /** 相对 workspace 的路径 */
  path: string
  kind: ArtifactKind
  size: number
  createdAt: string
  messageId?: string
}

export interface AgentSessionDetail {
  session: AgentSession
  messages: AgentMessage[]
  artifacts: ArtifactMeta[]
}

export interface CreateSessionInput {
  group: 'free' | 'analysis'
  title?: string
  type?: AgentSessionType
  rangeLabel?: string
}

export interface SendMessageInput {
  sessionId: string
  content: string
  /** 本次消息携带的图片附件 */
  attachments?: AttachmentInput[]
  /** 选中的技能 id */
  skillId?: string
}

export interface SetSessionModelInput {
  sessionId: string
  model: string
}

export interface RenameSessionInput {
  sessionId: string
  title: string
}

export interface ArchiveSessionInput {
  sessionId: string
  archived: boolean
}

export interface ReadArtifactInput {
  sessionId: string
  artifactId: string
}

export interface ReadArtifactResult {
  meta: ArtifactMeta
  /** 文本类产物直接返回内容；HTML 由渲染层放进 sandbox iframe */
  content: string
}

/** 主进程 → 渲染层的分析事件；seq 用于丢弃乱序或过期事件 */
export type AnalysisEvent =
  | { seq: number; type: 'session.created'; session: AgentSession }
  | { seq: number; type: 'session.title'; sessionId: string; title: string }
  | { seq: number; type: 'session.status'; sessionId: string; status: AgentSessionStatus; error?: string }
  | { seq: number; type: 'run.start'; sessionId: string; runId: string }
  | { seq: number; type: 'run.end'; sessionId: string; status: 'done' | 'failed' | 'stopped'; error?: string }
  | { seq: number; type: 'message.start'; sessionId: string; messageId: string; createdAt: string }
  | { seq: number; type: 'message.delta'; sessionId: string; messageId: string; delta: string }
  | { seq: number; type: 'message.done'; sessionId: string; messageId: string; message: AgentMessage }
  | { seq: number; type: 'tool.start'; sessionId: string; messageId: string; toolCallId: string; name: string; input: unknown }
  | {
      seq: number
      type: 'tool.end'
      sessionId: string
      messageId: string
      toolCallId: string
      status: 'success' | 'error'
      summary: string
      durationMs: number
    }
  | { seq: number; type: 'artifact.created'; sessionId: string; artifact: ArtifactMeta }
  | { seq: number; type: 'error'; sessionId?: string; message: string }

/** 会话列表排序：经营分析 → 自由对话 → 归档，组内按更新时间倒序 */
export const GROUP_ORDER: AgentGroupKey[] = ['analysis', 'free', 'archive']
