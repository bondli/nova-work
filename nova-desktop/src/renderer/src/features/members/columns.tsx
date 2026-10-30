import type { ColumnDef } from '@tanstack/react-table'
import type { Member } from '@shared/types/member'
import { Button } from '@renderer/components/ui/button'
import { CopyableText } from '@renderer/components/common/CopyText'
import { Money } from '@renderer/components/common/Money'
import { StatusBadge } from '@renderer/components/common/StatusBadge'
import { MEMBER_LEVEL } from './labels'

interface MemberColumnsOptions {
  onOpenDetail: (member: Member) => void
  onEdit: (member: Member) => void
  onRecharge: (member: Member) => void
}

/**
 * 会员列表列定义。
 * 列顺序按老系统：手机号 / 姓名 / 实付 / 积分 / 余额 / 优惠券 / 创建时间 / 操作，
 * 新系统独有的「等级」插在创建时间之前。
 */
export function createMemberColumns({
  onOpenDetail,
  onEdit,
  onRecharge
}: MemberColumnsOptions): ColumnDef<Member>[] {
  return [
    {
      accessorKey: 'phone',
      header: '手机号',
      cell: ({ row }) => (
        <CopyableText
          text={row.original.phone}
          label="手机号"
          textClassName="tnum font-medium"
        />
      )
    },
    {
      accessorKey: 'name',
      header: '姓名',
      cell: ({ row }) => <span className="truncate font-medium">{row.original.name}</span>
    },
    {
      accessorKey: 'totalSpent',
      header: '实付',
      cell: ({ row }) => <Money value={row.original.totalSpent} />
    },
    {
      accessorKey: 'points',
      header: '积分',
      meta: { sortKey: 'point' },
      cell: ({ row }) => (
        <span className="tnum">{row.original.points.toLocaleString('zh-CN')}</span>
      )
    },
    {
      accessorKey: 'balance',
      header: '余额',
      meta: { sortKey: 'balance' },
      cell: ({ row }) => <Money value={row.original.balance} />
    },
    {
      accessorKey: 'couponCount',
      header: '优惠券',
      cell: ({ row }) => (
        <span className="tnum">{(row.original.couponCount ?? 0).toLocaleString('zh-CN')}</span>
      )
    },
    {
      accessorKey: 'level',
      header: '等级',
      cell: ({ row }) => {
        const meta = MEMBER_LEVEL[row.original.level]
        return <StatusBadge status={meta.tone}>{meta.label}</StatusBadge>
      }
    },
    {
      accessorKey: 'createdAt',
      header: '创建时间',
      cell: ({ row }) => (
        <span className="tnum text-ui text-muted-foreground">{row.original.createdAt ?? '—'}</span>
      )
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">操作</span>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1 whitespace-nowrap">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-primary hover:text-primary"
            onClick={() => onOpenDetail(row.original)}
          >
            详情
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(row.original)}>
            编辑
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onRecharge(row.original)}>
            充值
          </Button>
        </div>
      )
    }
  ]
}
