import { useCallback } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useReachBottom } from '@tarojs/taro'
import CouponCard from '@/components/CouponCard'
import EmptyState from '@/components/EmptyState'
import { usePagedList } from '@/hooks/usePagedList'
import { getCoupons } from '@/services/records'
import type { CouponRecord } from '@/types/api'
import './index.scss'

// 不做状态 Tab，全部券按时间倒序展示，状态（去使用 / 已使用 / 已过期）由卡片自身透出
export default function CouponsPage() {
  const fetcher = useCallback((current: number, pageSize: number) => getCoupons(current, pageSize), [])
  const { list, loading, error, hasMore, loadMore, reload } = usePagedList<CouponRecord>(fetcher, [])

  useReachBottom(() => {
    if (hasMore) loadMore()
  })

  return (
    <View className='nb-page nb-coupons-page'>
      {loading && !list.length ? (
        <View className='nb-coupons-loading'>
          <EmptyState title='加载中' description='正在同步优惠券' />
        </View>
      ) : error ? (
        <View>
          <EmptyState title='优惠券加载失败' description={error} actionText='重新加载' onAction={reload} />
        </View>
      ) : list.length ? (
        <View className='nb-coupons-list'>
          {list.map((coupon) => (
            <CouponCard
              key={coupon.id}
              coupon={coupon}
              onUse={() => Taro.switchTab({ url: '/pages/discover/index' })}
            />
          ))}
          {hasMore ? <Text className='nb-list-tip'>上拉加载更多</Text> : <Text className='nb-list-tip'>已加载全部优惠券</Text>}
        </View>
      ) : (
        <View>
          <EmptyState title='暂无优惠券' description='门店满减 / 满送活动发放的券会展示在这里' />
        </View>
      )}

      <Text className='nb-coupons-foot'>优惠券仅限 Dave & Bella 门店收银台使用</Text>
    </View>
  )
}
