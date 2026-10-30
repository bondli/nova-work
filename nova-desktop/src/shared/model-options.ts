import type { ModelOption } from './types/analysis'

/**
 * 可选模型列表。
 * 设置页的「默认模型」与 AI 分析输入区的模型切换共用这一份，
 * 避免两处各自硬编码导致选项对不上（历史问题：设置页是 flash / v4-pro，输入区是 chat / reasoner）。
 */
export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'deepseek-flash',
    label: 'DeepSeek Flash',
    description: '通用对话，响应速度快'
  },
  {
    id: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    description: '深度推理，适合复杂归因分析'
  }
]
