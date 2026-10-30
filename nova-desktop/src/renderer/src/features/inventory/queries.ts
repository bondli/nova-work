import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  BatchStockRow,
  InventoryCreateInput,
  InventoryFilters,
  InventoryUpdateInput,
  StockAction
} from '@shared/types/inventory'
import {
  commitBatchStock,
  createInventory,
  fetchInventory,
  fetchInventoryDetail,
  fetchStockFlows,
  fetchStyleSkus,
  updateInventory
} from './api'

/**
 * 库存域 Query Key。
 * 统一从 inventoryKeys 派生，出入库成功后整域失效即可同步列表与流水。
 */
export const inventoryKeys = {
  all: ['inventory'] as const,
  list: (filters: InventoryFilters) => [...inventoryKeys.all, 'list', filters] as const,
  flows: (sku: string | null) => [...inventoryKeys.all, 'flows', sku ?? 'all'] as const,
  detail: (sku: string) => [...inventoryKeys.all, 'detail', sku] as const,
  styleSkus: (sn: string) => [...inventoryKeys.all, 'style-skus', sn] as const
}

/** 翻页与切换分类时保留上一页数据，避免表格闪回骨架 */
export function useInventoryQuery(filters: InventoryFilters) {
  return useQuery({
    queryKey: inventoryKeys.list(filters),
    queryFn: () => fetchInventory(filters),
    placeholderData: keepPreviousData
  })
}

/** 流水抽屉打开时才请求 */
export function useStockFlowsQuery(sku: string | null, enabled: boolean) {
  return useQuery({
    queryKey: inventoryKeys.flows(sku),
    queryFn: () => fetchStockFlows(sku),
    enabled
  })
}

/** 单条 SKU 明细，供详情 / 编辑抽屉回填 */
export function useInventoryDetailQuery(sku: string | null) {
  return useQuery({
    queryKey: inventoryKeys.detail(sku ?? ''),
    queryFn: () => fetchInventoryDetail(sku as string),
    enabled: Boolean(sku)
  })
}

/** 该款号下的 SKU 列表，库存详情抽屉展示 */
export function useStyleSkusQuery(sn: string | null, enabled: boolean) {
  return useQuery({
    queryKey: inventoryKeys.styleSkus(sn ?? ''),
    queryFn: () => fetchStyleSkus(sn as string),
    enabled: Boolean(sn) && enabled
  })
}

/** 批量入库 / 退库成功后刷新库存列表与流水 */
export function useCommitBatchStock() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { action: StockAction; rows: BatchStockRow[]; billNo: string }) =>
      commitBatchStock(input.action, input.rows, input.billNo),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inventoryKeys.all })
  })
}

/** 单件新增入库成功后刷新库存列表、概览与流水 */
export function useCreateInventory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: InventoryCreateInput) => createInventory(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inventoryKeys.all })
  })
}

/** 编辑库存成功后刷新列表与详情 */
export function useUpdateInventory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: InventoryUpdateInput) => updateInventory(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inventoryKeys.all })
  })
}
