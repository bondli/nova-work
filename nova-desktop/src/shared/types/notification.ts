/**
 * 应用内通知（经营报告生成提醒）。
 * 持久化在 `~/.nova/notifications.json`，顶栏铃铛读取该列表。
 */

export interface AppNotification {
  id: string
  /** 例如「店铺经营日报已生成」 */
  title: string
  /** 例如「2026-10-26 · 含异常提醒与明日建议」 */
  description: string
  /** 关联的固定任务会话 id，点击后跳转 */
  taskId: string
  createdAt: string
  unread: boolean
}
