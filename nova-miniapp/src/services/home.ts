import type { HomeData, MarketingRecord, ProductDetail, StoreInfo } from '@/types/api'
import { request, requestPage } from './request'

/** 首页公开接口：未登录也能完整浏览 */
export const getHome = (): Promise<HomeData> => request<HomeData>('/mini/home')

/** 商品详情：按款号获取 SKU 列表与展示素材 */
export const getProduct = (sn: string): Promise<ProductDetail> =>
  request<ProductDetail>(`/mini/products/${encodeURIComponent(sn)}`)

export const getMarketings = (current = 1, pageSize = 20): Promise<{ list: MarketingRecord[]; count: number }> =>
  requestPage<MarketingRecord>('/mini/marketings', { data: { current, pageSize } })

export const getStore = (): Promise<StoreInfo> => request<StoreInfo>('/mini/store')
