import { useState } from 'react'
import { Megaphone, Plus, Ticket } from 'lucide-react'
import { toast } from 'sonner'
import type { Campaign, CampaignFilters, CampaignType } from '@shared/types/campaign'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { DataTable } from '@renderer/components/common/DataTable'
import { DateRangePicker, type DateRangeValue } from '@renderer/components/common/DateRangePicker'
import { FilterBar, FilterField } from '@renderer/components/common/FilterBar'
import { PaginationBar } from '@renderer/components/common/PaginationBar'
import { StatCard } from '@renderer/components/common/StatCard'
import { formatDate, formatMoney } from '@renderer/lib/format'
import { useAuthStore } from '@renderer/stores/auth-store'
import { createCampaignColumns } from '@renderer/features/marketing/columns'
import { CAMPAIGN_TYPE } from '@renderer/features/marketing/labels'
import { useCampaignsQuery, useDeleteCampaign, useToggleCampaign } from '@renderer/features/marketing/queries'
import { DrawQueryDialog } from '@renderer/features/marketing/DrawQueryDialog'
import { MarketingDetailSheet } from '@renderer/features/marketing/MarketingDetailSheet'
import {
  MarketingEditorDialog,
  NewMarketingDialog
} from '@renderer/features/marketing/MarketingEditorDialog'

const PAGE_SIZE = 10

/** 默认活动时间区间：当年 1 月 1 日至今 */
const INITIAL_RANGE: DateRangeValue = {
  start: new Date(new Date().getFullYear(), 0, 1),
  end: new Date()
}

/** 活动类型筛选，取值与老系统一致：全部 / 满减 / 满送 / 买赠 */
const TYPE_OPTIONS: { value: CampaignType | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'full_reduce', label: CAMPAIGN_TYPE.full_reduce },
  { value: 'full_send', label: CAMPAIGN_TYPE.full_send },
  { value: 'full_gift', label: CAMPAIGN_TYPE.full_gift }
]

function createDefaultFilters(range: DateRangeValue): CampaignFilters {
  return {
    name: '',
    type: 'all',
    start: formatDate(range.start),
    end: formatDate(range.end),
    page: 1,
    pageSize: PAGE_SIZE
  }
}

/**
 * 营销活动：指标卡 + 活动时间/活动名称/类型筛选 + 活动表格。
 * 详情全员可见；新建、编辑、上下线、删除仅管理员可用，与老系统权限一致。
 */
export function MarketingPage() {
  const role = useAuthStore((state) => state.user?.role)
  const isAdmin = role === 'admin'

  const [range, setRange] = useState<DateRangeValue>(INITIAL_RANGE)
  const [filters, setFilters] = useState<CampaignFilters>(() => createDefaultFilters(INITIAL_RANGE))

  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [drawOpen, setDrawOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Campaign | null>(null)

  const { data, isLoading, isFetching, error } = useCampaignsQuery(filters)
  const toggleMutation = useToggleCampaign()
  const deleteMutation = useDeleteCampaign()

  function handleToggle(campaign: Campaign) {
    const label = campaign.status === 'ended' ? '上线' : '下线'
    toggleMutation.mutate(campaign.id, {
      onSuccess: () => toast.success(`${label}成功`),
      onError: (mutationError) =>
        toast.error(mutationError instanceof Error ? mutationError.message : `${label}失败`)
    })
  }

  function confirmDelete() {
    const campaign = pendingDelete
    if (!campaign) return
    deleteMutation.mutate(campaign.id, {
      onSuccess: () => {
        toast.success('删除成功')
        setPendingDelete(null)
      },
      onError: (mutationError) => {
        toast.error(mutationError instanceof Error ? mutationError.message : '删除失败')
      }
    })
  }

  const columns = createCampaignColumns({
    isAdmin,
    onDetail: (campaign) => {
      setDetailId(campaign.id)
      setDetailOpen(true)
    },
    onEdit: (campaign) => {
      setEditingId(campaign.id)
      setEditorOpen(true)
    },
    onToggle: handleToggle,
    onDelete: (campaign) => setPendingDelete(campaign)
  })

  function handleReset() {
    setRange(INITIAL_RANGE)
    setFilters(createDefaultFilters(INITIAL_RANGE))
  }

  const summary = data?.summary

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="进行中活动"
          value={(summary?.ongoingCount ?? 0).toLocaleString('zh-CN')}
          icon={Megaphone}
        />
        <StatCard
          label="带动销售额"
          value={formatMoney(summary?.drivenSales ?? 0, { decimals: 0 })}
          icon={Ticket}
          hint="旧库暂无核销数据"
        />
        <StatCard
          label="本月核销"
          value={(summary?.monthRedeemed ?? 0).toLocaleString('zh-CN')}
          icon={Ticket}
          hint="旧库暂无核销数据"
        />
      </div>

      <FilterBar
        onSubmit={() => setFilters((current) => ({ ...current, page: 1 }))}
        onReset={handleReset}
        loading={isFetching}
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setDrawOpen(true)}>
              抽奖查询
            </Button>
            {isAdmin ? (
              <Button type="button" size="sm" onClick={() => setNewOpen(true)}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                新建活动
              </Button>
            ) : null}
          </>
        }
      >
        <FilterField label="活动时间">
          <DateRangePicker
            value={range}
            allowFuture
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
        </FilterField>

        <Input
          className="h-8 w-[200px] text-ui"
          placeholder="输入活动名称"
          aria-label="活动名称"
          value={filters.name}
          onChange={(event) =>
            setFilters((current) => ({ ...current, name: event.target.value, page: 1 }))
          }
        />

        <FilterField label="类型">
          <Select
            value={filters.type}
            onValueChange={(value) =>
              setFilters((current) => ({
                ...current,
                type: value as CampaignFilters['type'],
                page: 1
              }))
            }
          >
            <SelectTrigger className="h-8 w-[132px] text-ui" aria-label="活动类型">
              <SelectValue placeholder="活动类型" />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-ui">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
      </FilterBar>

      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        rowKey="id"
        isLoading={isLoading}
        error={error ? (error as Error).message : undefined}
        empty={{
          icon: Megaphone,
          title: '暂无活动',
          description: '换个活动名称或类型筛选后再试'
        }}
        footer={
          <div className="p-3">
            <PaginationBar
              total={data?.total ?? 0}
              page={filters.page}
              pageSize={filters.pageSize}
              unit="个活动"
              onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
            />
          </div>
        }
      />

      <MarketingDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        campaignId={detailId}
      />
      <MarketingEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        campaignId={editingId}
      />
      <NewMarketingDialog open={newOpen} onOpenChange={setNewOpen} />
      <DrawQueryDialog open={drawOpen} onOpenChange={setDrawOpen} />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null)
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>删除活动</AlertDialogTitle>
            <AlertDialogDescription>
              确认删除「{pendingDelete?.name}」？活动下属优惠券会一并删除，该操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? '删除中' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
