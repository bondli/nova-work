/**
 * 内置技能与可选模型。
 * 技能不执行外部脚本，而是在用户问题前注入一段明确的执行指令，
 * 让 Agent 按固定套路完成分析，行为与 nexa 的 prompt-based skill 一致。
 */
import type { SkillInfo } from '@shared/types/analysis'
import { MODEL_OPTIONS } from '@shared/model-options'

/** 输入区模型下拉与设置页默认模型共用一份列表，见 shared/model-options */
export { MODEL_OPTIONS } from '@shared/model-options'

/** 随应用内置的技能，开箱即可在输入区选择 */
export const BUILTIN_SKILLS: SkillInfo[] = [
  {
    id: 'skill-creator',
    name: '技能创建器',
    description: '把一个分析套路固化成可复用的技能说明文档',
    builtin: true,
    promptHint: `用户选择了「技能创建器」。请按以下步骤工作：
1. 先确认新技能的 id（小写字母、数字与连字符，例如 weekly-report）、一句话用途和需要哪些输入参数。
2. 在 artifacts/ 下创建 Markdown 文件 <技能id>-skill.md，内容包含：技能名称、适用场景、输入参数、执行步骤、产出物、失败与边界处理。
3. 执行步骤必须引用本项目真实可用的工具与数据库表，不得编造字段。
4. 完成后用 publish_artifact 发布该 Markdown 文件，并在回复中说明如何在后续对话中使用这个技能。`
  },
  {
    id: 'daily-brief',
    name: '日报解读',
    description: '拆解营业额、单量、客单价、连带率、退款率与会员占比',
    builtin: true,
    promptHint: `用户选择了「日报解读」。请先调用 get_business_overview 取当天数据，并按营业额、订单数、客单价、连带率、退款率、会员订单占比逐项拆解；同时给出与昨日、上周同日的对比。输出最多 3 条结论和 2 条今天可执行的行动建议，异常项单独标出。`
  },
  {
    id: 'inventory-health',
    name: '库存健康诊断',
    description: '定位滞销与断码，给出补货、调拨和清货建议',
    builtin: true,
    promptHint: `用户选择了「库存健康诊断」。请使用 query_inventory 与 query_slow_moving 分析库存结构：统计零动销款、滞销件数、占用金额，识别断码与结构失衡。输出优先级排序的处理建议（清货 / 补货 / 调拨），并说明每条的判断依据。`
  },
  {
    id: 'member-retention',
    name: '会员复购分析',
    description: '分析会员复购率、余额消费与沉睡会员',
    builtin: true,
    promptHint: `用户选择了「会员复购分析」。请使用 query_members 分析近 90 天会员复购率、会员订单占比、余额消费变化与沉睡会员规模。区分新客与老客，给出分层召回建议，并指出需要重点维护的高价值会员特征。`
  },
  {
    id: 'campaign-review',
    name: '营销活动复盘',
    description: '对比活动前后，评估核销、拉动与毛利影响',
    builtin: true,
    promptHint: `用户选择了「营销活动复盘」。请使用 query_marketing 与 query_sales_trend 对比活动期与活动前的单量、营业额、客单价、核销率与毛利变化。结论先行，区分真实增量与自然波动，并给出下一次活动可调整的 2 条建议。`
  }
]

/** 按 id 查找技能；未命中返回 undefined */
export function findSkill(id: string | undefined): SkillInfo | undefined {
  if (!id) return undefined
  return BUILTIN_SKILLS.find((skill) => skill.id === id)
}

/** 把 deepseek-flash 这类 id 转成可读的名称 */
export function formatModelLabel(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) =>
      part.toLowerCase() === 'deepseek' ? 'DeepSeek' : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join(' ')
}

/** 校验模型是否在可选列表中 */
export function isSupportedModel(model: string): boolean {
  return MODEL_OPTIONS.some((option) => option.id === model)
}
