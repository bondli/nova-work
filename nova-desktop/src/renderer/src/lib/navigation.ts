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
 * 左侧导航配置：路径、导航文案、顶栏标题与图标。
 * 导航顺序即产品确定的固定顺序。
 */
export interface NavItem {
  path: string
  label: string
  title: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  {
    path: '/analysis',
    label: 'AI经营',
    title: '经营分析',
    icon: Sparkles
  },
  {
    path: '/buy',
    label: '买单',
    title: '买单',
    icon: ScanLine
  },
  {
    path: '/orders',
    label: '订单',
    title: '订单中心',
    icon: ReceiptText
  },
  {
    path: '/inventory',
    label: '库存',
    title: '库存中心',
    icon: Package
  },
  {
    path: '/members',
    label: '会员',
    title: '会员中心',
    icon: Users
  },
  {
    path: '/marketing',
    label: '营销',
    title: '营销中心',
    icon: Megaphone
  },
  {
    path: '/data',
    label: '数据',
    title: '数据中心',
    icon: ChartColumn
  }
]

/** 根据当前路径匹配导航项，用于顶栏标题；未匹配到时回退到第一项 */
export function findNavItem(pathname: string): NavItem {
  const matched = NAV_ITEMS.find((item) => pathname.startsWith(item.path))
  return matched ?? NAV_ITEMS[0]!
}
