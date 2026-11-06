import { useMemo, useState } from 'react'
import { Crown, Plus, UserRound, Users, Wallet } from 'lucide-react'
import type { Member, MemberFilters } from '@shared/types/member'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { DataTable, type SortState } from '@renderer/components/common/DataTable'
import { DateRangePicker, type DateRangeValue } from '@renderer/components/common/DateRangePicker'
import { FilterBar } from '@renderer/components/common/FilterBar'
import { PaginationBar } from '@renderer/components/common/PaginationBar'
import { StatCard } from '@renderer/components/common/StatCard'
import { formatDate, formatMoney } from '@renderer/lib/format'
import { createMemberColumns } from '@renderer/features/members/columns'
import { useMembersQuery } from '@renderer/features/members/queries'
import { MemberDetailSheet } from '@renderer/features/members/MemberDetailSheet'
import { IncomeBalanceDialog } from '@renderer/features/members/IncomeBalanceDialog'
import { MemberEditorDialog, NewMemberDialog } from '@renderer/features/members/MemberEditorDialog'

const PAGE_SIZE = 10

/** 默认创建时间区间：2025-05-01 至今 */
const INITIAL_RANGE: DateRangeValue = {
  start: new Date(2025, 4, 1),
  end: new Date()
}

/** 会员等级筛选，取值与老系统一致（仅全部 / 普通会员 / 超级会员） */
const LEVEL_OPTIONS: { value: MemberFilters['level']; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'normal', label: '普通会员' },
  { value: 'super', label: '超级会员' }
]

const MONTH_BIRTHDAY_OPTIONS: { value: '0' | '1'; label: string }[] = [
  { value: '0', label: '否' },
  { value: '1', label: '是' }
]

function createDefaultFilters(range: DateRangeValue): MemberFilters {
  return {
    phone: '',
    level: 'all',
    monthBirthday: '',
    orderby: '',
    start: formatDate(range.start),
    end: formatDate(range.end),
    page: 1,
    pageSize: PAGE_SIZE
  }
}

/**
 * 会员中心：指标卡 + 创建时间/手机号/等级/本月生日/排序筛选 + 会员表格。
 * 详情抽屉、编辑弹窗、新增弹窗与充值弹窗共享选中会员状态。
 */
export function MembersPage() {
  const [range, setRange] = useState<DateRangeValue>(INITIAL_RANGE)
  const [sort, setSort] = useState<SortState | null>(null)
  const [filters, setFilters] = useState<MemberFilters>(() => createDefaultFilters(INITIAL_RANGE))

  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [editing, setEditing] = useState<Member | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [rechargeMember, setRechargeMember] = useState<Member | null>(null)
  const [rechargeOpen, setRechargeOpen] = useState(false)

  const { data, isLoading, isFetching, error } = useMembersQuery(filters)
  const summary = data?.summary

  const columns = useMemo(
    () =>
      createMemberColumns({
        onOpenDetail: (member) => {
          setDetailId(member.id)
          setDetailOpen(true)
        },
        onEdit: (member) => {
          setEditing(member)
          setEditorOpen(true)
        },
        onRecharge: (member) => {
          setRechargeMember(member)
          setRechargeOpen(true)
        }
      }),
    []
  )

  function handleReset() {
    setRange(INITIAL_RANGE)
    setSort(null)
    setFilters(createDefaultFilters(INITIAL_RANGE))
  }

  /** 表头点击排序：同步服务端 orderby，并回到第一页 */
  function handleSortChange(next: SortState | null) {
    setSort(next)
    setFilters((current) => ({
      ...current,
      orderby: next ? `${next.key} ${next.order}` : '',
      page: 1
    }))
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="会员总数"
          value={(summary?.total ?? 0).toLocaleString('zh-CN')}
          icon={Users}
        />
        <StatCard
          label="超级会员"
          value={(summary?.superCount ?? 0).toLocaleString('zh-CN')}
          icon={Crown}
        />
        <StatCard
          label="会员余额"
          value={formatMoney(summary?.balanceTotal ?? 0, { decimals: 0 })}
          icon={Wallet}
        />
      </div>

      <FilterBar
        onSubmit={() => setFilters((current) => ({ ...current, page: 1 }))}
        onReset={handleReset}
        loading={isFetching}
        actions={
          <Button type="button" size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            新增会员
          </Button>
        }
      >
        <div className="flex items-center gap-2">
          <span className="text-meta text-muted-foreground">创建时间</span>
          <DateRangePicker
            value={range}
            onChange={(next) => {
              setRange(next)
              setFilters((current) => ({
                ...current,
                start: formatDate(next.start),
                end: formatDate(next.end),
                page: 1
              }))
            }}
          />
        </div>

        <Input
          className="h-8 w-[200px] text-ui"
          placeholder="输入会员手机号"
          aria-label="会员手机号"
          value={filters.phone}
          onChange={(event) =>
            setFilters((current) => ({ ...current, phone: event.target.value, page: 1 }))
          }
        />

        <Select
          value={filters.level}
          onValueChange={(value) =>
            setFilters((current) => ({ ...current, level: value as MemberFilters['level'], page: 1 }))
          }
        >
          <SelectTrigger className="h-8 w-[124px] text-ui" aria-label="会员等级">
            <SelectValue placeholder="会员等级" />
          </SelectTrigger>
          <SelectContent>
            {LEVEL_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-ui">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.monthBirthday}
          onValueChange={(value) =>
            setFilters((current) => ({
              ...current,
              monthBirthday: value as MemberFilters['monthBirthday'],
              page: 1
            }))
          }
        >
          <SelectTrigger className="h-8 w-[116px] text-ui" aria-label="本月生日">
            <SelectValue placeholder="本月生日" />
          </SelectTrigger>
          <SelectContent>
            {MONTH_BIRTHDAY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-ui">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        rowKey="id"
        isLoading={isLoading}
        error={error ? (error as Error).message : undefined}
        sort={sort}
        onSortChange={handleSortChange}
        onRowClick={(member) => {
          setDetailId(member.id)
          setDetailOpen(true)
        }}
        empty={{
          icon: UserRound,
          title: '暂无会员',
          description: '换个手机号或等级筛选后再试'
        }}
        footer={
          <div className="p-3">
            <PaginationBar
              total={data?.total ?? 0}
              page={filters.page}
              pageSize={filters.pageSize}
              onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
            />
          </div>
        }
      />

      <MemberDetailSheet open={detailOpen} onOpenChange={setDetailOpen} memberId={detailId} />
      <IncomeBalanceDialog
        open={rechargeOpen}
        onOpenChange={setRechargeOpen}
        member={rechargeMember}
      />
      <MemberEditorDialog open={editorOpen} onOpenChange={setEditorOpen} member={editing} />
      <NewMemberDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  )
}
