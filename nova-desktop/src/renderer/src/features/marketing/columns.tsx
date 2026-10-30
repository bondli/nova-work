import type { ColumnDef } from '@tanstack/react-table'
import type { Campaign } from '@shared/types/campaign'
import { Button } from '@renderer/components/ui/button'
import { Money } from '@renderer/components/common/Money'
import { StatusBadge } from '@renderer/components/common/StatusBadge'
import { CAMPAIGN_STATUS, CAMPAIGN_TYPE } from './labels'

interface CampaignColumnsOptions {
  /** 编辑 / 上下线 / 删除仅管理员可用，与老系统一致 */
  isAdmin: boolean
  onDetail: (campaign: Campaign) => void
  onEdit: (campaign: Campaign) => void
  onToggle: (campaign: Campaign) => void
  onDelete: (campaign: Campaign) => void
}

/**
 * 营销活动列表列定义。
 * 列顺序按老系统：活动名称 / 活动描述 / 活动类型 / 开始时间 / 结束时间 / 状态 / 参与 / 核销 / 带动销售 / 操作。
 * 参与、核销、带动销售在新系统独有且旧库没有数据来源，缺失时渲染「—」。
 */
export function createCampaignColumns({
  isAdmin,
  onDetail,
  onEdit,
  onToggle,
  onDelete
}: CampaignColumnsOptions): ColumnDef<Campaign>[] {
  return [
    {
      accessorKey: 'name',
      header: '活动名称',
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>
    },
    {
      accessorKey: 'description',
      header: '活动描述',
      cell: ({ row }) => (
        <span className="block max-w-[220px] truncate text-ui text-muted-foreground">
          {row.original.description || '—'}
        </span>
      )
    },
    {
      accessorKey: 'type',
      header: '活动类型',
      cell: ({ row }) => (
        <StatusBadge status="brand">{CAMPAIGN_TYPE[row.original.type]}</StatusBadge>
      )
    },
    {
      accessorKey: 'start',
      header: '开始时间',
      cell: ({ row }) => (
        <span className="tnum text-ui text-muted-foreground">{row.original.start ?? '—'}</span>
      )
    },
    {
      accessorKey: 'end',
      header: '结束时间',
      cell: ({ row }) => (
        <span className="tnum text-ui text-muted-foreground">{row.original.end ?? '—'}</span>
      )
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => {
        const meta = CAMPAIGN_STATUS[row.original.status]
        return <StatusBadge status={meta.tone}>{meta.label}</StatusBadge>
      }
    },
    {
      accessorKey: 'participants',
      header: '参与',
      cell: ({ row }) => (
        <span className="tnum">
          {row.original.participants === null
            ? '—'
            : `${row.original.participantLabel} ${row.original.participants.toLocaleString('zh-CN')}`}
        </span>
      )
    },
    {
      accessorKey: 'redeemed',
      header: '核销',
      cell: ({ row }) => (
        <span className="tnum">
          {row.original.redeemed === null ? '—' : row.original.redeemed.toLocaleString('zh-CN')}
        </span>
      )
    },
    {
      accessorKey: 'drivenSales',
      header: '带动销售',
      cell: ({ row }) =>
        row.original.drivenSales === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <Money value={row.original.drivenSales} decimals={0} bold />
        )
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">操作</span>,
      cell: ({ row }) => {
        const campaign = row.original
        return (
          <div className="flex justify-end gap-0.5 whitespace-nowrap">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-primary hover:text-primary"
              onClick={() => onDetail(campaign)}
            >
              详情
            </Button>
            {isAdmin ? (
              <>
                <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(campaign)}>
                  编辑
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => onToggle(campaign)}>
                  {campaign.status === 'ended' ? '上线' : '下线'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onDelete(campaign)}
                >
                  删除
                </Button>
              </>
            ) : null}
          </div>
        )
      }
    }
  ]
}
