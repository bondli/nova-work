/**
 * 主进程与渲染层之间的 IPC 通道名。
 * 命名统一为「模块:动作」，preload 只暴露该白名单内的通道。
 */

/** 请求 / 响应式通道：渲染层 invoke，主进程 handle */
export const IPC = {
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  dataConfigGet: 'data-config:get',
  dataConfigSet: 'data-config:set',
  // 仅返回 POS 服务地址：商品图片等静态资源需要，导购员也可用
  dataConfigBaseUrl: 'data-config:base-url',
  // 登录页专用：未登录时也要能读写 POS 服务地址，否则新电脑首次启动无法登录
  serverConfigBaseUrl: 'server-config:base-url',
  serverConfigSetBaseUrl: 'server-config:set-base-url',
  modelConfigGet: 'model-config:get',
  modelConfigSet: 'model-config:set',
  modelConfigTest: 'model-config:test',
  systemReload: 'system:reload',
  authLogin: 'auth:login',
  authRegister: 'auth:register',
  authLogout: 'auth:logout',
  authSession: 'auth:session',
  authChangePassword: 'auth:change-password',
  posRequest: 'pos:request',
  posExport: 'pos:export',
  posUpload: 'pos:upload',
  posUploadImage: 'pos:upload-image',
  printHtml: 'print:html',
  agentList: 'agent:list',
  agentCreate: 'agent:session.create',
  agentMessages: 'agent:session.messages',
  agentSend: 'agent:send',
  agentStop: 'agent:pause',
  agentArtifactRead: 'agent:artifact.read',
  agentCapabilities: 'agent:capabilities',
  agentSetModel: 'agent:session.set-model',
  agentAttachmentRead: 'agent:attachment.read',
  agentRename: 'agent:session.rename',
  agentArchive: 'agent:session.archive',
  agentDelete: 'agent:session.delete',
  agentReveal: 'agent:session.reveal',
  notifyList: 'notify:list',
  notifyRead: 'notify:read',
  notifyReadAll: 'notify:read-all'
} as const

/** 单向事件通道：主进程主动推送给渲染层 */
export const IPC_EVENT = {
  authChanged: 'auth:event',
  analysisEvent: 'analysis:event',
  /** 新的经营报告通知（含定时任务完成） */
  notificationEvent: 'notify:event'
} as const
