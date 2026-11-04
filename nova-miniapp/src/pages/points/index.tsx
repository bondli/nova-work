import { useCallback } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow, useReachBottom } from '@tarojs/taro'
import { Button } from '@nutui/nutui-react-taro'
import EmptyState from '@/components/EmptyState'
import RecordRow from '@/components/RecordRow'
import { usePagedList } from '@/hooks/usePagedList'
import { getPointLogs } from '@/services/records'
import { useUserStore } from '@/stores/user'
import type { PointLog } from '@/types/api'
import { formatDateTime, formatPoints } from '@/utils/format'
import './index.scss'

export default function PointsPage() {
  const member = useUserStore((state) => state.member)
  const refreshProfile = useUserStore((state) => state.refreshProfile)
  const fetcher = useCallback((current: number, pageSize: number) => getPointLogs(current, pageSize), [])
  const { list, loading, error, hasMore, loadMore, reload } = usePagedList<PointLog>(fetcher, [])

  useReachBottom(() => {
    if (hasMore) loadMore()
  })

  useDidShow(() => {
    void refreshProfile().catch(() => undefined)
  })

  return (
    <View className='nb-page nb-points-page'>
      <View className='nb-points-hero'>
        <Text className='nb-points-hero-label'>当前可用积分</Text>
        <Text className='nb-points-hero-value'>{formatPoints(member?.point)}</Text>
        <Text className='nb-points-hero-note'>签到、消费、抽奖均可获得积分</Text>
      </View>

      <Text className='nb-points-title'>积分明细</Text>
      {loading && !list.length ? (
        <View className='nb-points-loading'>
          <EmptyState title='加载中' description='正在同步积分流水' />
        </View>
      ) : error ? (
        <View>
          <EmptyState title='积分流水加载失败' description={error} actionText='重新加载' onAction={reload} />
        </View>
      ) : list.length ? (
        <View className='nb-points-list'>
          {list.map((log) => (
            <RecordRow
              key={log.id}
              title={log.reason || log.type}
              time={formatDateTime(log.createdAt)}
              amount={`${log.point > 0 ? '+' : ''}${formatPoints(log.point)}`}
              positive={log.point > 0}
            />
          ))}
          {hasMore ? <Text className='nb-list-tip'>上拉加载更多</Text> : <Text className='nb-list-tip'>已加载全部流水</Text>}
        </View>
      ) : (
        <View>
          <EmptyState title='暂无积分流水' description='签到、消费后积分变动会记录在这里' />
        </View>
      )}

      <Button
        className='nb-points-sign-button'
        type='primary'
        block
        onClick={() => Taro.switchTab({ url: '/pages/discover/index' })}
      >
        去签到赚积分
      </Button>
      <Text className='nb-points-foot'>积分变动以服务端记录为准</Text>
    </View>
  )
}
