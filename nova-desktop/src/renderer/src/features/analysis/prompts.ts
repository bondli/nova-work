import type { AgentSession } from '@shared/types/analysis'

/** 固定任务的标准提示词：要求生成分析、写入 HTML/CSV 并发布为产物 */
export function buildFixedPrompt(session: AgentSession): string {
  const label = session.type === 'daily' ? '日报' : session.type === 'weekly' ? '周报' : '月报'
  return `请按 ${session.rangeLabel} 的数据范围生成店铺经营${label}：先给出营业额、订单数、客单价、连带率、会员订单占比、退款率与余额消费，再列出异常与建议。最后把完整报告写入 artifacts/${session.title}.html 并发布为产物；同时写入 artifacts/指标明细.csv 并发布。`
}
