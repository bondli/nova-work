import { contextBridge, ipcRenderer } from 'electron'
import { IPC, IPC_EVENT } from '../shared/ipc-channels'
import type { AuthUser, ChangePasswordInput, LoginInput, RegisterInput } from '../shared/types/auth'
import type {
  AgentCapabilities,
  AgentMessage,
  AgentSession,
  AgentSessionDetail,
  AnalysisEvent,
  ArchiveSessionInput,
  CreateSessionInput,
  ReadArtifactInput,
  ReadArtifactResult,
  RenameSessionInput,
  SendMessageInput,
  SetSessionModelInput
} from '../shared/types/analysis'
import type { IpcResult } from '../shared/types/ipc'
import type { ServerLoginInput } from '../shared/types/server-config'
import type { AppNotification } from '../shared/types/notification'
import type {
  PosExportInput,
  PosExportResult,
  PosRequestInput,
  PosUploadResult
} from '../shared/types/pos'
import type { PrintHtmlResult } from '../shared/types/print'
import type { AppSettings } from '../shared/types/settings'
import type { DataSettingsInput, DataSettingsView } from '../shared/types/data-config'
import type {
  ModelConfigInput,
  ModelConfigView,
  ModelTestResult
} from '../shared/types/model-config'

/**
 * Preload 桥接层。
 * 只把白名单内的 IPC 能力挂到 window.nova，渲染层无法直接访问 ipcRenderer / Node。
 */

const api = {
  /** 当前操作系统：渲染层用于平台差异化布局（macOS 需为交通灯让出顶部空间） */
  platform: process.platform,
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet) as Promise<IpcResult<AppSettings>>,
    set: (settings: AppSettings) =>
      ipcRenderer.invoke(IPC.settingsSet, settings) as Promise<IpcResult<AppSettings>>
  },
  auth: {
    login: (input: LoginInput) =>
      ipcRenderer.invoke(IPC.authLogin, input) as Promise<IpcResult<AuthUser>>,
    register: (input: RegisterInput) =>
      ipcRenderer.invoke(IPC.authRegister, input) as Promise<IpcResult<AuthUser>>,
    logout: () => ipcRenderer.invoke(IPC.authLogout) as Promise<IpcResult<null>>,
    session: () => ipcRenderer.invoke(IPC.authSession) as Promise<IpcResult<AuthUser | null>>,
    changePassword: (input: ChangePasswordInput) =>
      ipcRenderer.invoke(IPC.authChangePassword, input) as Promise<IpcResult<null>>
  },
  system: {
    /** 由主进程重载渲染页，等价于整页刷新 */
    reload: () => ipcRenderer.invoke(IPC.systemReload) as Promise<IpcResult<null>>
  },
  pos: {
    /** 经主进程转发到 nova-pos-server，返回原始 JSON */
    request: (input: PosRequestInput) =>
      ipcRenderer.invoke(IPC.posRequest, input) as Promise<IpcResult<unknown>>,
    /** 请求服务端导出文件（xlsx），主进程弹保存对话框并落盘 */
    export: (input: PosExportInput) =>
      ipcRenderer.invoke(IPC.posExport, input) as Promise<IpcResult<PosExportResult>>,
    /** 选择本地 Excel 并上传解析；取消时返回 null */
    upload: () => ipcRenderer.invoke(IPC.posUpload) as Promise<IpcResult<PosUploadResult | null>>
  },
  print: {
    /** 打印小票 HTML，主进程调用 Electron 原生打印 */
    html: (html: string) =>
      ipcRenderer.invoke(IPC.printHtml, { html }) as Promise<IpcResult<PrintHtmlResult>>
  },
  dataConfig: {
    get: () => ipcRenderer.invoke(IPC.dataConfigGet) as Promise<IpcResult<DataSettingsView>>,
    /** 仅取 POS 服务地址，供商品图片等静态资源使用；导购员也可调用 */
    baseUrl: () => ipcRenderer.invoke(IPC.dataConfigBaseUrl) as Promise<IpcResult<string>>,
    set: (input: DataSettingsInput) =>
      ipcRenderer.invoke(IPC.dataConfigSet, input) as Promise<IpcResult<DataSettingsView>>
  },
  serverConfig: {
    /** 登录页读取 POS 服务地址（未登录也可调用） */
    baseUrl: () => ipcRenderer.invoke(IPC.serverConfigBaseUrl) as Promise<IpcResult<string>>,
    /** 登录页保存 POS 服务地址与内部令牌，写入 ~/.nova/server-config.json */
    setBaseUrl: (input: ServerLoginInput) =>
      ipcRenderer.invoke(IPC.serverConfigSetBaseUrl, input) as Promise<IpcResult<string>>
  },
  modelConfig: {
    get: () => ipcRenderer.invoke(IPC.modelConfigGet) as Promise<IpcResult<ModelConfigView>>,
    set: (input: ModelConfigInput) =>
      ipcRenderer.invoke(IPC.modelConfigSet, input) as Promise<IpcResult<ModelConfigView>>,
    test: () => ipcRenderer.invoke(IPC.modelConfigTest) as Promise<IpcResult<ModelTestResult>>
  },
  agent: {
    list: () => ipcRenderer.invoke(IPC.agentList) as Promise<IpcResult<AgentSession[]>>,
    create: (input: CreateSessionInput) =>
      ipcRenderer.invoke(IPC.agentCreate, input) as Promise<IpcResult<AgentSession>>,
    messages: (sessionId: string) =>
      ipcRenderer.invoke(IPC.agentMessages, { sessionId }) as Promise<IpcResult<AgentSessionDetail>>,
    send: (input: SendMessageInput) =>
      ipcRenderer.invoke(IPC.agentSend, input) as Promise<IpcResult<AgentMessage>>,
    stop: (sessionId: string) =>
      ipcRenderer.invoke(IPC.agentStop, { sessionId }) as Promise<IpcResult<null>>,
    readArtifact: (input: ReadArtifactInput) =>
      ipcRenderer.invoke(IPC.agentArtifactRead, input) as Promise<IpcResult<ReadArtifactResult>>,
    capabilities: () =>
      ipcRenderer.invoke(IPC.agentCapabilities) as Promise<IpcResult<AgentCapabilities>>,
    setModel: (input: SetSessionModelInput) =>
      ipcRenderer.invoke(IPC.agentSetModel, input) as Promise<IpcResult<AgentSession>>,
    readAttachment: (path: string) =>
      ipcRenderer.invoke(IPC.agentAttachmentRead, { path }) as Promise<IpcResult<{ dataUrl: string }>>,
    rename: (input: RenameSessionInput) =>
      ipcRenderer.invoke(IPC.agentRename, input) as Promise<IpcResult<AgentSession>>,
    archive: (input: ArchiveSessionInput) =>
      ipcRenderer.invoke(IPC.agentArchive, input) as Promise<IpcResult<AgentSession>>,
    remove: (sessionId: string) =>
      ipcRenderer.invoke(IPC.agentDelete, { sessionId }) as Promise<IpcResult<null>>,
    reveal: (sessionId: string) =>
      ipcRenderer.invoke(IPC.agentReveal, { sessionId }) as Promise<IpcResult<null>>,
    /** 订阅主进程分析事件；返回取消订阅函数，组件卸载时必须调用 */
    onEvent: (callback: (event: AnalysisEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, event: AnalysisEvent): void => {
        callback(event)
      }
      ipcRenderer.on(IPC_EVENT.analysisEvent, listener)
      return () => {
        ipcRenderer.removeListener(IPC_EVENT.analysisEvent, listener)
      }
    }
  },
  notifications: {
    list: () => ipcRenderer.invoke(IPC.notifyList) as Promise<IpcResult<AppNotification[]>>,
    read: (id: string) =>
      ipcRenderer.invoke(IPC.notifyRead, { id }) as Promise<IpcResult<AppNotification[]>>,
    readAll: () => ipcRenderer.invoke(IPC.notifyReadAll) as Promise<IpcResult<AppNotification[]>>,
    /** 订阅新通知；返回取消订阅函数 */
    onEvent: (callback: (notification: AppNotification) => void): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        notification: AppNotification
      ): void => {
        callback(notification)
      }
      ipcRenderer.on(IPC_EVENT.notificationEvent, listener)
      return () => {
        ipcRenderer.removeListener(IPC_EVENT.notificationEvent, listener)
      }
    }
  }
}

/** 暴露给渲染层的 API 类型，供全局声明复用 */
export type NovaApi = typeof api

contextBridge.exposeInMainWorld('nova', api)
