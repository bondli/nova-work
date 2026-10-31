/**
 * 服务端配置文件（~/.nova/server-config.json）的桌面端视图。
 * 桌面端只维护 POS 服务地址；数据库、上传目录与日志目录属于服务端自身配置，
 * Agent 的只读库配置则放在 agent-config.json。
 * 内部令牌由主进程自动生成与保管，不下发到渲染层。
 */

/** 渲染层可见的配置；jwtSecret / uploadToken / internalToken 等密钥不返回具体值 */
export interface ServerConfigView {
  baseUrl: string
  configPath: string
  /** 是否已生成 JWT 密钥，仅用于界面提示 */
  jwtConfigured: boolean
}

/** 数据设置页提交的 POS 服务字段 */
export interface ServerConnectionInput {
  baseUrl: string
}

/** 登录页提交的连接信息；internalToken 仅跨机部署时需要 */
export interface ServerLoginInput extends ServerConnectionInput {
  internalToken?: string
}
