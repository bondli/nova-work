import { Text, View } from '@tarojs/components'
import type { CouponRecord } from '@/types/api'
import { formatDate, formatPoints } from '@/utils/format'
import './index.scss'

interface CouponCardProps {
  coupon: CouponRecord
  onUse?: () => void
}

const STATUS_LABEL: Record<string, string> = {
  active: '去使用',
  used: '已使用',
  expired: '已过期'
}

/** 优惠券卡：左侧面额 + 右侧使用范围，对齐 demo 的 .coupon */
export default function CouponCard({ coupon, onUse }: CouponCardProps) {
  // 列表不再按状态筛选，历史数据里会有「状态还是 active 但有效期已过」的券，
  // 这里按有效期做一次兜底，避免把过期券显示成「去使用」
  const expireAt = coupon.couponExpiredTime ? new Date(coupon.couponExpiredTime.replace(/-/g, '/')).getTime() : NaN
  const expiredByTime = coupon.couponStatus === 'active' && Number.isFinite(expireAt) && expireAt < Date.now()
  const status = expiredByTime ? 'expired' : coupon.couponStatus
  const active = status === 'active'
  const condition = Number(coupon.couponCondition ?? 0)
  const value = Number(coupon.couponValue ?? 0)
  const name = condition > 0 ? `满 ${condition} 减 ${value}` : `${value} 元无门槛`
  const leftLabel = condition > 0 ? '满减券' : '无门槛'
  // 左侧大数字始终展示券面额（couponValue），不展示使用门槛（couponCondition）
  const leftValue = formatPoints(value)
  const dateText = formatDate(coupon.couponExpiredTime)
  const validity =
    status === 'used'
      ? `已使用${dateText ? ` · ${dateText}` : ''}`
      : status === 'expired'
        ? `已过期${dateText ? ` · ${dateText}` : ''}`
        : `有效期至 ${dateText || '门店活动结束'}`

  return (
    <View className={`nb-coupon ${active ? '' : 'nb-coupon-off'}`}>
      <View className={`nb-coupon-left ${active ? '' : 'nb-coupon-left-off'}`}>
        <Text className='nb-coupon-type'>{leftLabel}</Text>
        <Text className='nb-coupon-value'>{leftValue}</Text>
      </View>
      <View className='nb-coupon-body'>
        <Text className='nb-coupon-name'>{name}</Text>
        <Text className='nb-coupon-scope'>{coupon.couponDesc || '全场童装通用'}</Text>
        <Text className='nb-coupon-validity'>{validity}</Text>
      </View>
      <View className={`nb-coupon-action ${active ? 'nb-coupon-action-on' : ''}`} onClick={active ? onUse : undefined}>
        <Text>{STATUS_LABEL[status] ?? '已失效'}</Text>
      </View>
    </View>
  )
}
