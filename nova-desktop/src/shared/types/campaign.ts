/**
 * 营销域共享类型。
 * 现阶段由渲染层 mock 数据填充，后续接入 nova-pos-server 时字段保持不变。
 */

/** 活动类型，取值与老系统 marketingType 一致 */
export type CampaignType = 'full_reduce' | 'full_send' | 'full_gift'

/** 活动状态 */
export type CampaignStatus = 'ongoing' | 'upcoming' | 'ended' | 'offline'

/** 营销活动 */
export interface Campaign {
  id: string
  name: string
  /** 活动描述 */
  description: string
  type: CampaignType
  status: CampaignStatus
  /** 活动时间展示文案，长期活动为「长期」 */
  periodLabel: string
  /** 起止日期 YYYY-MM-DD，长期活动为空 */
  start: string | null
  end: string | null
  /** 未开始活动用「预热」，其余用「参与」 */
  participantLabel: '参与' | '预热'
  /** 参与人数，服务端暂无该数据时为 null */
  participants: number | null
  /** 核销数，服务端暂无该数据时为 null */
  redeemed: number | null
  /** 带动销售额，服务端暂无该数据时为 null */
  drivenSales: number | null
}

/** 营销列表查询条件，文案与老系统一致：活动时间 / 活动名称 / 类型 */
export interface CampaignFilters {
  /** 活动名称，模糊匹配 */
  name: string
  type: CampaignType | 'all'
  start: string
  end: string
  page: number
  pageSize: number
}

/** 营销概览指标 */
export interface CampaignSummary {
  ongoingCount: number
  monthRedeemed: number
  drivenSales: number
  /** 券核销率，0~1 */
  redeemRate: number
}

export interface CampaignListResult {
  rows: Campaign[]
  total: number
  summary: CampaignSummary
}

/** 活动券信息，对应活动详情券列表 */
export interface CampaignCoupon {
  id: string
  /** 券名称 */
  name: string
  /** 使用条件 */
  condition: string
  /** 券值 */
  value: string
  /** 发放数量 */
  count: number | null
  /** 状态文案 */
  status: string
  /** 过期时间 */
  expiresAt: string
}

/** 营销活动详情，编辑弹窗回填使用 */
export interface CampaignDetail extends Campaign {
  /** 活动主图 */
  theme: string
  /** 内容图 */
  image: string
  /** 活动内容 JSON */
  content: unknown
}

/** 新建 / 修改活动提交参数，字段名与 nova-pos-server 接口保持一致 */
export interface CampaignInput {
  marketingName: string
  marketingDesc: string
  marketingType: CampaignType
  startTime: string
  endTime: string
  /** 活动主图 */
  marketingTheme: string
  /** 内容图 */
  marketingImage: string
  /** 活动内容 */
  marketingContent: unknown
}
