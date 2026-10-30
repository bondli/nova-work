import type { Campaign } from '@shared/types/campaign'

/**
 * 营销活动 mock 数据。
 * 5 个活动覆盖进行中 / 未开始 / 已结束 / 已下线四种状态，与 demo 列表一致。
 * 活动类型取值与老系统一致：full_reduce 满减 / full_send 满送 / full_gift 买赠。
 */
export const MOCK_CAMPAIGNS: Campaign[] = [
  {
    id: 'c1',
    name: '秋冬焕新 · 满 800 减 100',
    description: '全场满 800 元立减 100 元',
    type: 'full_reduce',
    status: 'ongoing',
    periodLabel: '10/15 - 10/31',
    start: '2026-10-15',
    end: '2026-10-31',
    participantLabel: '参与',
    participants: 286,
    redeemed: 112,
    drivenSales: 42860
  },
  {
    id: 'c2',
    name: '会员生日礼 · 8 折券',
    description: '生日当月会员到店领取 8 折券',
    type: 'full_send',
    status: 'ongoing',
    periodLabel: '长期',
    start: null,
    end: null,
    participantLabel: '参与',
    participants: 68,
    redeemed: 31,
    drivenSales: 8920
  },
  {
    id: 'c3',
    name: '双十一预售 · 定金翻倍',
    description: '预售定金翻倍抵扣',
    type: 'full_send',
    status: 'upcoming',
    periodLabel: '10/25 - 11/11',
    start: '2026-10-25',
    end: '2026-11-11',
    participantLabel: '预热',
    participants: 1204,
    redeemed: null,
    drivenSales: null
  },
  {
    id: 'c4',
    name: '国庆亲子专场',
    description: '亲子款满 500 减 80',
    type: 'full_reduce',
    status: 'ended',
    periodLabel: '09/28 - 10/07',
    start: '2026-09-28',
    end: '2026-10-07',
    participantLabel: '参与',
    participants: 512,
    redeemed: 386,
    drivenSales: 126400
  },
  {
    id: 'c5',
    name: '老客唤醒 · 50 元无门槛',
    description: '老客到店赠送 50 元无门槛券',
    type: 'full_gift',
    status: 'offline',
    periodLabel: '09/01 - 09/20',
    start: '2026-09-01',
    end: '2026-09-20',
    participantLabel: '参与',
    participants: 1860,
    redeemed: 640,
    drivenSales: 58200
  }
]
