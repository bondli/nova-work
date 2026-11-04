import { useState } from 'react'
import { Gift, Plus } from 'lucide-react'
import type { RedeemItem, RedeemItemFilters } from '@shared/types/redeem'
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
import { FilterBar, FilterField } from '@renderer/components/common/FilterBar'
import { PaginationBar } from '@renderer/components/common/PaginationBar'
import { useAuthStore } from '@renderer/stores/auth-store'
import { REDEEM_ITEM_STATUS } from './api'
import { createRedeemItemColumns } from './redeem-columns'
import { RedeemItemDialog } from './RedeemItemDialog'
import { RedeemOrdersDrawer } from './RedeemOrdersDrawer'
import { useRedeemItemsQuery } from './queries'

const PAGE_SIZE = 20

const STATUS_OPTIONS: Array<{ value: RedeemItemFilters['status']; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'active', label: REDEEM_ITEM_STATUS.active },
  { value: 'inactive', label: REDEEM_ITEM_STATUS.inactive }
]

function createDefaultFilters(): RedeemItemFilters {
  return { keyword: '', status: 'all', page: 1, pageSize: PAGE_SIZE }
}

/**
 * 积分兑换管理面板：兑换礼品列表 + 新增 / 编辑 + 每个礼品的兑换记录抽屉。
 * 新增、编辑仅管理员可用；兑换记录与核销对店员开放。
 */
export function RedeemItemsPanel() {
  const role = useAuthStore((state) => state.user?.role)
  const isAdmin = role === 'admin'

  const [filters, setFilters] = useState<RedeemItemFilters>(createDefaultFilters)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<RedeemItem | null>(null)
  const [ordersOpen, setOrdersOpen] = useState(false)
  const [ordersItem, setOrdersItem] = useState<RedeemItem | null>(null)

  const { data, isLoading, isFetching, error } = useRedeemItemsQuery(filters)

  const columns = createRedeemItemColumns({
    isAdmin,
    onEdit: (item) => {
      setEditingItem(item)
      setEditorOpen(true)
    },
    onOrders: (item) => {
      setOrdersItem(item)
      setOrdersOpen(true)
    }
  })

  function handleNew() {
    setEditingItem(null)
    setEditorOpen(true)
  }

  function handleReset() {
    setFilters(createDefaultFilters())
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <FilterBar
        onSubmit={() => setFilters((current) => ({ ...current, page: 1 }))}
        onReset={handleReset}
        loading={isFetching}
        actions={
          isAdmin ? (
            <Button type="button" size="sm" onClick={handleNew}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              新增礼品
            </Button>
          ) : null
        }
      >
        <Input
          className="h-8 w-[200px] text-ui"
          placeholder="输入礼品名称"
          aria-label="礼品名称"
          value={filters.keyword}
          onChange={(event) =>
            setFilters((current) => ({ ...current, keyword: event.target.value, page: 1 }))
          }
        />

        <FilterField label="状态">
          <Select
            value={filters.status}
            onValueChange={(value) =>
              setFilters((current) => ({
                ...current,
                status: value as RedeemItemFilters['status'],
                page: 1
              }))
            }
          >
            <SelectTrigger className="h-8 w-[132px] text-ui" aria-label="礼品状态">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
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
          icon: Gift,
          title: '暂无兑换礼品',
          description: isAdmin ? '点击「新增礼品」添加第一件积分兑换实物' : '等待管理员添加兑换礼品'
        }}
        footer={
          <div className="p-3">
            <PaginationBar
              total={data?.total ?? 0}
              page={filters.page}
              pageSize={filters.pageSize}
              unit="件礼品"
              onPageChange={(page) => setFilters((current) => ({ ...current, page }))}
            />
          </div>
        }
      />

      <RedeemItemDialog open={editorOpen} onOpenChange={setEditorOpen} item={editingItem} />
      <RedeemOrdersDrawer open={ordersOpen} onOpenChange={setOrdersOpen} item={ordersItem} />
    </div>
  )
}
