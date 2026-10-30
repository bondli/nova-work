/**
 * 经营分析 IPC：会话列表/创建/消息/发送/停止/产物读取，以及自由对话的重命名、归档、删除与打开文件夹。
 * 入参全部 zod 校验；事件统一经 analysis:event 推送到当前窗口。
 */
import { ipcMain, shell, type BrowserWindow } from 'electron'
import { z } from 'zod'
import { IPC, IPC_EVENT } from '@shared/ipc-channels'
import type { AgentCapabilities, AnalysisEvent } from '@shared/types/analysis'
import { getSession } from '../services/auth'
import { AgentConfigError, getAgentConfig } from '../agent/config'
import { readAttachmentDataUrl } from '../agent/attachments'
import { BUILTIN_SKILLS, MODEL_OPTIONS, formatModelLabel } from '../agent/skills'
import {
  SessionNotFoundError,
  SessionOperationError,
  createSession,
  deleteSession,
  ensureSessionWorkspace,
  getSessionDetail,
  listSessions,
  renameSession,
  setSessionArchived,
  setSessionModel
} from '../agent/session-store'
import { sendMessage, stopRun } from '../agent/runtime'
import { readWorkspaceFile } from '../agent/workspace'
import { failure, internalFailure, success } from './helpers'

const createSchema = z.object({
  group: z.literal('free'),
  title: z.string().trim().max(60).optional(),
  rangeLabel: z.string().trim().max(60).optional()
})

const sessionIdSchema = z.object({ sessionId: z.string().min(1).max(80) })

const attachmentSchema = z.object({
  name: z.string().min(1).max(120),
  mimeType: z.string().min(1).max(80),
  dataUrl: z.string().min(1).max(20_000_000)
})

const sendSchema = z.object({
  sessionId: z.string().min(1).max(80),
  content: z.string().trim().max(4000, '单条消息不能超过 4000 字'),
  attachments: z.array(attachmentSchema).max(4).optional(),
  skillId: z.string().min(1).max(80).optional()
})

const modelSchema = z.object({
  sessionId: z.string().min(1).max(80),
  model: z.string().min(1).max(80)
})

const attachmentReadSchema = z.object({
  path: z.string().min(1).max(400)
})

/** 能力列表：把全局配置的默认模型并入下拉，保证默认项与运行时一致 */
async function loadCapabilities(): Promise<AgentCapabilities> {
  let defaultModel = MODEL_OPTIONS[0]?.id ?? 'deepseek-chat'
  let models = MODEL_OPTIONS

  try {
    const config = await getAgentConfig()
    defaultModel = config.model.model
    if (!models.some((option) => option.id === defaultModel)) {
      models = [
        {
          id: defaultModel,
          label: formatModelLabel(defaultModel),
          description: '当前配置的默认模型'
        },
        ...MODEL_OPTIONS
      ]
    }
  } catch {
    // 未配置模型时仍返回静态列表，发送消息时再给出明确错误
  }

  return { models, defaultModel, skills: BUILTIN_SKILLS }
}

const artifactSchema = z.object({
  sessionId: z.string().min(1).max(80),
  artifactId: z.string().min(1).max(400)
})

const renameSchema = z.object({
  sessionId: z.string().min(1).max(80),
  title: z.string().trim().min(1, '标题不能为空').max(60, '标题不能超过 60 字')
})

const archiveSchema = z.object({
  sessionId: z.string().min(1).max(80),
  archived: z.boolean()
})

/** 将运行时异常转成统一错误码 */
function toFailure<T>(error: unknown) {
  if (error instanceof AgentConfigError) return failure<T>('NOT_CONFIGURED', error.message)
  if (error instanceof SessionNotFoundError) return failure<T>('NOT_FOUND', error.message)
  if (error instanceof SessionOperationError) return failure<T>('CONFLICT', error.message)
  if (error instanceof Error && error.message.includes('正在运行')) {
    return failure<T>('CONFLICT', error.message)
  }
  return internalFailure<T>(error)
}

export function registerAgentIpc(getWindow: () => BrowserWindow | null): void {
  const sink = (event: AnalysisEvent): void => {
    const window = getWindow()
    if (!window || window.isDestroyed()) return
    window.webContents.send(IPC_EVENT.analysisEvent, event)
  }

  ipcMain.handle(IPC.agentList, async () => {
    if (!(await getSession())) return failure('UNAUTHENTICATED', '请先登录')
    try {
      return success(await listSessions())
    } catch (error) {
      return internalFailure(error)
    }
  })

  // 输入区能力：可选模型与内置技能，均为静态列表
  ipcMain.handle(IPC.agentCapabilities, async () => {
    if (!(await getSession())) return failure('UNAUTHENTICATED', '请先登录')
    return success(await loadCapabilities())
  })

  ipcMain.handle(IPC.agentSetModel, async (_event, input: unknown) => {
    if (!(await getSession())) return failure('UNAUTHENTICATED', '请先登录')
    const parsed = modelSchema.safeParse(input)
    if (!parsed.success) return failure('INVALID_INPUT', '模型参数不合法')
    const capabilities = await loadCapabilities()
    if (!capabilities.models.some((option) => option.id === parsed.data.model)) {
      return failure('INVALID_INPUT', `不支持的模型：${parsed.data.model}`)
    }
    try {
      return success(await setSessionModel(parsed.data.sessionId, parsed.data.model))
    } catch (error) {
      return toFailure(error)
    }
  })

  ipcMain.handle(IPC.agentAttachmentRead, async (_event, input: unknown) => {
    if (!(await getSession())) return failure('UNAUTHENTICATED', '请先登录')
    const parsed = attachmentReadSchema.safeParse(input)
    if (!parsed.success) return failure('INVALID_INPUT', '附件参数不合法')
    const dataUrl = readAttachmentDataUrl(parsed.data.path)
    if (!dataUrl) return failure('NOT_FOUND', '附件不存在或不可读取')
    return success({ dataUrl })
  })

  ipcMain.handle(IPC.agentCreate, async (_event, input: unknown) => {
    if (!(await getSession())) return failure('UNAUTHENTICATED', '请先登录')
    const parsed = createSchema.safeParse(input)
    if (!parsed.success) {
      return failure('INVALID_INPUT', parsed.error.issues[0]?.message ?? '新建会话参数不合法')
    }
    try {
      return success(await createSession(parsed.data))
    } catch (error) {
      return toFailure(error)
    }
  })

  ipcMain.handle(IPC.agentRename, async (_event, input: unknown) => {
    if (!(await getSession())) return failure('UNAUTHENTICATED', '请先登录')
    const parsed = renameSchema.safeParse(input)
    if (!parsed.success) {
      return failure('INVALID_INPUT', parsed.error.issues[0]?.message ?? '重命名参数不合法')
    }
    try {
      return success(await renameSession(parsed.data.sessionId, parsed.data.title))
    } catch (error) {
      return toFailure(error)
    }
  })

  ipcMain.handle(IPC.agentArchive, async (_event, input: unknown) => {
    if (!(await getSession())) return failure('UNAUTHENTICATED', '请先登录')
    const parsed = archiveSchema.safeParse(input)
    if (!parsed.success) return failure('INVALID_INPUT', '归档参数不合法')
    try {
      return success(await setSessionArchived(parsed.data.sessionId, parsed.data.archived))
    } catch (error) {
      return toFailure(error)
    }
  })

  ipcMain.handle(IPC.agentDelete, async (_event, input: unknown) => {
    if (!(await getSession())) return failure('UNAUTHENTICATED', '请先登录')
    const parsed = sessionIdSchema.safeParse(input)
    if (!parsed.success) return failure('INVALID_INPUT', '会话参数不合法')
    try {
      await deleteSession(parsed.data.sessionId)
      return success(null)
    } catch (error) {
      return toFailure(error)
    }
  })

  ipcMain.handle(IPC.agentReveal, async (_event, input: unknown) => {
    if (!(await getSession())) return failure('UNAUTHENTICATED', '请先登录')
    const parsed = sessionIdSchema.safeParse(input)
    if (!parsed.success) return failure('INVALID_INPUT', '会话参数不合法')
    try {
      const dir = await ensureSessionWorkspace(parsed.data.sessionId)
      const openError = await shell.openPath(dir)
      if (openError) return failure('NOT_FOUND', openError)
      return success(null)
    } catch (error) {
      return toFailure(error)
    }
  })

  ipcMain.handle(IPC.agentMessages, async (_event, input: unknown) => {
    const parsed = sessionIdSchema.safeParse(input)
    if (!parsed.success) return failure('INVALID_INPUT', '会话参数不合法')
    try {
      return success(await getSessionDetail(parsed.data.sessionId))
    } catch (error) {
      return toFailure(error)
    }
  })

  ipcMain.handle(IPC.agentSend, async (_event, input: unknown) => {
    const user = await getSession()
    if (!user) return failure('UNAUTHENTICATED', '请先登录')

    const parsed = sendSchema.safeParse(input)
    if (!parsed.success) {
      return failure('INVALID_INPUT', parsed.error.issues[0]?.message ?? '消息参数不合法')
    }
    if (!parsed.data.content && !parsed.data.attachments?.length) {
      return failure('INVALID_INPUT', '请输入问题或上传图片')
    }

    try {
      const message = await sendMessage({
        sessionId: parsed.data.sessionId,
        content: parsed.data.content,
        attachments: parsed.data.attachments,
        skillId: parsed.data.skillId,
        role: user.role,
        sink
      })
      return success(message)
    } catch (error) {
      return toFailure(error)
    }
  })

  ipcMain.handle(IPC.agentStop, async (_event, input: unknown) => {
    const parsed = sessionIdSchema.safeParse(input)
    if (!parsed.success) return failure('INVALID_INPUT', '会话参数不合法')
    stopRun(parsed.data.sessionId)
    return success(null)
  })

  ipcMain.handle(IPC.agentArtifactRead, async (_event, input: unknown) => {
    const parsed = artifactSchema.safeParse(input)
    if (!parsed.success) return failure('INVALID_INPUT', '产物参数不合法')
    try {
      const detail = await getSessionDetail(parsed.data.sessionId)
      const meta = detail.artifacts.find((artifact) => artifact.id === parsed.data.artifactId)
      if (!meta) return failure('NOT_FOUND', '产物不存在')
      const content = await readWorkspaceFile(parsed.data.sessionId, meta.path)
      return success({ meta, content })
    } catch (error) {
      return toFailure(error)
    }
  })
}
