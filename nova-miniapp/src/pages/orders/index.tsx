import { useCallback } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useReachBottom } from '@tarojs/taro'
import { Skeleton } from '@nutui/nutui-react-taro'
import EmptyState from '@/components/EmptyState'
import { usePagedList } from '@/hooks/usePagedList'
import { getOrders } from '@/services/order'
import { useUserStore } from '@/stores/user'
import type { OrderRecord } from '@/types/api'
import { formatDateTime, formatMoney, formatPayType } from '@/utils/format'
import './index.scss'

// 门店线下订单只有「已成交」一种状态，不做状态筛选，直接按时间倒序拉全部
export default function OrdersPage() {
  const token = useUserStore((state) => state.token)
  const fetcher = useCallback((current: number, pageSize: number) => getOrders(current, pageSize), [])
  const { list, loading, error, hasMore, loadMore, reload } = usePagedList<OrderRecord>(fetcher, [])

  useReachBottom(() => {
    if (hasMore) loadMore()
  })

  if (!token) {
    return (
      <View className='nb-page'>
        <EmptyState title='请先登录' description='登录后可查看到店消费订单' actionText='去登录' onAction={() => Taro.switchTab({ url: '/pages/mine/index' })} />
      </View>
    )
  }

  return (
    <View className='nb-page nb-order-page'>
      {loading && !list.length ? (
        <View className='nb-card nb-order-skeleton'>
          <Skeleton rows={6} animated />
        </View>
      ) : error ? (
        <View>
          <EmptyState title='订单加载失败' description={error} actionText='重新加载' onAction={reload} />
        </View>
      ) : list.length ? (
        <View className='nb-order-list'>
          {list.map((order) => (
            <View
              key={order.orderSn}
              className='nb-order-card'
              onClick={() => Taro.navigateTo({ url: `/pages/order-detail/index?orderSn=${order.orderSn}` })}
            >
              <View className='nb-order-head'>
                <Text className='nb-order-sn'>{order.orderSn}</Text>
              </View>
              <View className='nb-order-body'>
                <View className='nb-order-info'>
                  <Text className='nb-order-name'>{order.orderItems} 件商品</Text>
                  <Text className='nb-order-meta'>
                    {formatDateTime(order.createdAt)} · {formatPayType(order.payType)}
                  </Text>
                </View>
                <Text className='nb-order-amount'>{formatMoney(order.orderActualAmount)}</Text>
              </View>
              <View className='nb-order-foot'>
                <Text className='nb-order-foot-text'>共 {order.orderItems} 件商品</Text>
                <Text className='nb-order-foot-link'>查看详情</Text>
              </View>
            </View>
          ))}
          {hasMore ? <Text className='nb-list-tip'>上拉加载更多</Text> : <Text className='nb-list-tip'>已加载全部订单</Text>}
        </View>
      ) : (
        <View>
          <EmptyState title='暂无购物记录' description='近 12 个月到店消费订单会展示在这里' />
        </View>
      )}
      <Text className='nb-page-foot'>如对订单有疑问，请联系门店导购</Text>
    </View>
  )
}
