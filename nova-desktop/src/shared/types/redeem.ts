/** 积分兑换礼品：stock 为剩余库存，redeemedCount 为已兑数量（服务端由 totalStock - stock 计算） */
export type RedeemItemStatus = 'active' | 'inactive'

export interface RedeemItem {
  id: number
  name: string
  image: string
  description: string
  detail: string
  points: number
  totalStock: number
  stock: number
  perMemberLimit: number
  status: RedeemItemStatus
  sort: number
  redeemedCount: number
  createdAt: string
  updatedAt: string
}

/** 新增 / 编辑礼品入参；编辑时总库存按差值同步剩余库存 */
export interface RedeemItemInput {
  name: string
  image: string
  description: string
  detail: string
  points: number
  totalStock: number
  perMemberLimit: number
  status: RedeemItemStatus
  sort: number
}

/** 兑换单：小程序兑换后为 pending_pickup，桌面端核销后改为 picked */
export type RedeemOrderStatus = 'pending_pickup' | 'picked' | 'cancelled' | 'expired'

export interface RedeemOrder {
  id: number
  orderNo: string
  phone: string
  memberName: string
  itemId: number
  itemName: string
  itemImage: string
  points: number
  status: RedeemOrderStatus
  pickupCode: string
  expiredAt: string
  pickedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface RedeemItemFilters {
  keyword: string
  status: RedeemItemStatus | 'all'
  page: number
  pageSize: number
}

export interface RedeemOrderFilters {
  status: RedeemOrderStatus | 'all'
  page: number
  pageSize: number
}
