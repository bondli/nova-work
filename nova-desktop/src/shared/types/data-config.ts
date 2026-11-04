/**
 * 数据设置视图。
 * 组合两个配置文件：
 * - ~/.nova/api-config.json：桌面端的 POS 服务地址（桌面端专用）
 * - ~/.nova/agent-config.json：Agent 只读数据库（供经营分析查询，不进 POS 服务）
 */

export interface AgentDatabaseConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

export interface DataSettingsView {
  baseUrl: string
  database: AgentDatabaseConfig
  apiConfigPath: string
  agentConfigPath: string
}

export interface DataSettingsInput {
  baseUrl: string
  database: AgentDatabaseConfig
}
