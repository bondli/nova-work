import type { CampaignStatus, CampaignType } from '@shared/types/campaign'
import type { StatusTone } from '@renderer/components/common/StatusBadge'

/** 活动类型文案，取值与老系统一致 */
export const CAMPAIGN_TYPE: Record<CampaignType, string> = {
  full_reduce: '满减活动',
  full_send: '满送活动',
  full_gift: '买赠活动'
}

/** 活动状态文案与徽标色，未开始 / 已结束 / 进行中与老系统一致 */
export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; tone: StatusTone }> = {
  ongoing: { label: '进行中', tone: 'success' },
  upcoming: { label: '未开始', tone: 'brand' },
  ended: { label: '已结束', tone: 'danger' },
  offline: { label: '已下线', tone: 'neutral' }
}
