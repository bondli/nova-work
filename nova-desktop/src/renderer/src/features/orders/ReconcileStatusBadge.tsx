import { CircleCheck } from 'lucide-react'
import { StatusBadge } from '@renderer/components/common/StatusBadge'

interface ReconcileStatusBadgeProps {
  /** 是否已完成对账 */
  done: boolean
  /** 对账抽屉中展示勾选图标，列表页保持纯文字 */
  withIcon?: boolean
}

/** 对账状态标签：订单列表与对账抽屉共用，保证文案与颜色一致 */
export function ReconcileStatusBadge({ done, withIcon = false }: ReconcileStatusBadgeProps) {
  if (!done) return <StatusBadge status="warning">未对账</StatusBadge>

  return (
    <StatusBadge status="success">
      {withIcon ? (
        <span className="inline-flex items-center gap-1">
          <CircleCheck className="h-3 w-3" aria-hidden="true" />
          已对账
        </span>
      ) : (
        '已对账'
      )}
    </StatusBadge>
  )
}
