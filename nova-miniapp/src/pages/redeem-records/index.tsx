import { useCallback } from 'react'
import { Text, View } from '@tarojs/components'
import { useReachBottom } from '@tarojs/taro'
import EmptyState from '@/components/EmptyState'
import MediaImage from '@/components/MediaImage'
import StatusTag from '@/components/StatusTag'
import { usePagedList } from '@/hooks/usePagedList'
import { getRedeemOrders } from '@/services/redeem'
import type { RedeemOrder } from '@/types/api'
import { formatDate, formatDateTime, formatPoints } from '@/utils/format'
import './index.scss'

const STATUS_MAP: Record<RedeemOrder['status'], { label: string; tone: 'warning' | 'success' | 'neutral' }> = {
  pending_pickup: { label: '待取货', tone: 'warning' },
  picked: { label: '已取货', tone: 'success' },
  cancelled: { label: '已取消', tone: 'neutral' },
  expired: { label: '已过期', tone: 'neutral' }
}

export default function RedeemRecordsPage() {
  const fetcher = useCallback(
    (current: number, pageSize: number) => getRedeemOrders(undefined, current, pageSize),
    []
  )
  const { list, loading, error, hasMore, loadMore, reload } = usePagedList<RedeemOrder>(fetcher, [])

  useReachBottom(() => {
    if (hasMore) loadMore()
  })

  return (
    <View className='nb-page nb-redeem-records'>
      <Text className='nb-redeem-records-sub'>兑换后 30 天内到店自提，逾期作废</Text>

      {loading && !list.length ? (
        <View className='nb-redeem-records-loading'>
          <EmptyState title='加载中' description='正在同步兑换记录' />
        </View>
      ) : error ? (
        <View>
          <EmptyState title='兑换记录加载失败' description={error} actionText='重新加载' onAction={reload} />
        </View>
      ) : list.length ? (
        <View className='nb-redeem-records-list'>
          {list.map((order) => {
            const status = STATUS_MAP[order.status]
            const pending = order.status === 'pending_pickup'
            return (
              <View className='nb-redeem-record' key={order.id}>
                <View className='nb-redeem-record-head'>
                  <Text className='nb-redeem-record-no'>{order.orderNo}</Text>
                  <StatusTag text={status.label} tone={status.tone} />
                </View>
                <View className='nb-redeem-record-body'>
                  <MediaImage src={order.itemImage} label='DAVE & BELLA' className='nb-redeem-record-img' />
                  <View className='nb-redeem-record-info'>
                    <Text className='nb-redeem-record-name'>{order.itemName}</Text>
                    <Text className='nb-redeem-record-meta'>
                      {formatDateTime(order.createdAt)} · {formatPoints(order.points)} 积分
                    </Text>
                  </View>
                  <Text className={`nb-redeem-record-code ${pending ? 'nb-redeem-record-code-on' : ''}`}>
                    {order.pickupCode}
                  </Text>
                </View>
                {pending ? (
                  <Text className='nb-redeem-record-exp'>
                    取货码有效期至 {formatDate(order.expiredAt)} · 到店出示核销
                  </Text>
                ) : null}
              </View>
            )
          })}
          {hasMore ? <Text className='nb-list-tip'>上拉加载更多</Text> : <Text className='nb-list-tip'>已加载全部记录</Text>}
        </View>
      ) : (
        <View>
          <EmptyState title='暂无兑换记录' description='积分兑换成功后会展示在这里' />
        </View>
      )}
    </View>
  )
}
