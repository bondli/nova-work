/**
 * 模型提供方注册。
 * 统一使用 @earendil-works/pi-ai 的 OpenAI 兼容实现，
 * 通过 DeepSeek provider 连接用户配置的 baseUrl；不再手写 HTTP 客户端。
 */
import { createModels, type Model } from '@earendil-works/pi-ai'
import { deepseekProvider } from '@earendil-works/pi-ai/providers/deepseek'

export const models = createModels()
models.setProvider(deepseekProvider())

/** DeepSeek 的兼容参数，未知模型回退时使用 */
const DEEPSEEK_COMPAT = {
  supportsStore: false,
  supportsDeveloperRole: false,
  maxTokensField: 'max_tokens' as const,
  requiresReasoningContentOnAssistantMessages: true,
  thinkingFormat: 'deepseek' as const
}

/**
 * 用运行配置构造模型描述。
 * 已收录的 deepseek-flash / deepseek-v4-pro 直接复用 pi-ai 目录里的上下文窗口、
 * 推理开关与兼容参数，只把 baseUrl 换成用户配置；未知模型才手工兜底。
 */
export function resolveModel(baseUrl: string, modelId: string): Model<'openai-completions'> {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')
  const catalog = models.getModel('deepseek', modelId)
  if (catalog?.api === 'openai-completions') {
    return { ...catalog, baseUrl: normalizedBaseUrl } as Model<'openai-completions'>
  }

  return {
    id: modelId,
    name: modelId,
    api: 'openai-completions',
    provider: 'deepseek',
    baseUrl: normalizedBaseUrl,
    reasoning: /reasoner/i.test(modelId),
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8192,
    compat: DEEPSEEK_COMPAT
  }
}
