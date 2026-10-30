import {
  ChartColumn,
  Megaphone,
  Package,
  ReceiptText,
  ScanLine,
  Sparkles,
  Users,
  type LucideIcon
} from 'lucide-react'

/**
 * 左侧导航配置：路径、导航文案、顶栏标题与描述、图标。
 * 导航顺序即产品确定的固定顺序。
 */
export interface NavItem {
  path: string
  label: string
  title: string
  description: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  {
    path: '/analysis',
    label: 'AI经营',
    title: '经营分析',
    description: '左任务、右对话，产物可预览',
    icon: Sparkles
  },
  {
    path: '/buy',
    label: '买单',
    title: '买单',
    description: '扫码开单 · 会员权益 · 多支付方式',
    icon: ScanLine
  },
  {
    path: '/orders',
    label: '订单',
    title: '订单中心',
    description: '查询、退换货、对账；导出在商品明细抽屉',
    icon: ReceiptText
  },
  {
    path: '/inventory',
    label: '库存',
    title: '库存中心',
    description: '库存、流水、断码与热销',
    icon: Package
  },
  {
    path: '/members',
    label: '会员',
    title: '会员中心',
    description: '会员画像、积分、余额与优惠券',
    icon: Users
  },
  {
    path: '/marketing',
    label: '营销',
    title: '营销中心',
    description: '活动名称、时间与类型筛选，活动效果与核销',
    icon: Megaphone
  },
  {
    path: '/data',
    label: '数据',
    title: '数据中心',
    description: '事实数据看板，不含 AI 与导购业绩',
    icon: ChartColumn
  }
]

/** 根据当前路径匹配导航项，用于顶栏标题；未匹配到时回退到第一项 */
export function findNavItem(pathname: string): NavItem {
  const matched = NAV_ITEMS.find((item) => pathname.startsWith(item.path))
  return matched ?? NAV_ITEMS[0]!
}
