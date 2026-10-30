/**
 * 模型设置（~/.nova/agent-config.json 的 model 段）。
 * 数据库段由数据设置维护，这里只读写模型字段，保存时保留其余配置。
 */

export interface ModelConfigView {
  /** 是否启用；停用后新的分析任务不会被受理 */
  enabled: boolean
  baseUrl: string
  apiKey: string
  model: string
  configPath: string
}

export interface ModelConfigInput {
  enabled: boolean
  baseUrl: string
  apiKey: string
  model: string
}

/** 模型连通性检测结果 */
export interface ModelTestResult {
  ok: boolean
  latencyMs: number
  message: string
  checkedAt: string
}
