import { useCallback } from 'react'
import { Text, View } from '@tarojs/components'
import { useDidShow, useReachBottom } from '@tarojs/taro'
import { ShieldCheck } from '@nutui/icons-react-taro'
import EmptyState from '@/components/EmptyState'
import RecordRow from '@/components/RecordRow'
import { usePagedList } from '@/hooks/usePagedList'
import { getBalanceLogs } from '@/services/records'
import { useUserStore } from '@/stores/user'
import type { BalanceLog } from '@/types/api'
import { formatAmount, formatDateTime } from '@/utils/format'
import './index.scss'

export default function BalancePage() {
  const member = useUserStore((state) => state.member)
  const refreshProfile = useUserStore((state) => state.refreshProfile)
  const fetcher = useCallback((current: number, pageSize: number) => getBalanceLogs(current, pageSize), [])
  const { list, loading, error, hasMore, loadMore, reload } = usePagedList<BalanceLog>(fetcher, [])

  useReachBottom(() => {
    if (hasMore) loadMore()
  })

  useDidShow(() => {
    void refreshProfile().catch(() => undefined)
  })

  return (
    <View className='nb-page nb-balance-page'>
      <View className='nb-balance-hero'>
        <Text className='nb-balance-hero-label'>当前可用余额</Text>
        <Text className='nb-balance-hero-value'>¥{formatAmount(member?.balance)}</Text>
        <Text className='nb-balance-hero-note'>余额仅可在 Dave & Bella 门店消费使用 · 不可提现</Text>
      </View>

      <View className='nb-balance-note'>
        <View className='nb-balance-note-title'>
          <ShieldCheck size={14} color='#c7001a' />
          <Text>余额使用说明</Text>
        </View>
        <Text>到店买单时可抵扣；充值请前往门店收银台；不支持提现/转账/转赠他人。</Text>
      </View>

      <Text className='nb-balance-title'>收支明细</Text>
      {loading && !list.length ? (
        <View className='nb-balance-loading'>
          <EmptyState title='加载中' description='正在同步余额流水' />
        </View>
      ) : error ? (
        <View>
          <EmptyState title='余额流水加载失败' description={error} actionText='重新加载' onAction={reload} />
        </View>
      ) : list.length ? (
        <View className='nb-balance-list'>
          {list.map((log) => {
            const positive = Number(log.value) > 0
            return (
              <RecordRow
                key={log.id}
                title={log.reason || log.type}
                time={formatDateTime(log.createdAt)}
                amount={`${positive ? '+' : '-'}¥${formatAmount(Math.abs(Number(log.value)))}`}
                positive={positive}
              />
            )
          })}
          {hasMore ? <Text className='nb-list-tip'>上拉加载更多</Text> : <Text className='nb-list-tip'>已加载全部明细</Text>}
        </View>
      ) : (
        <View>
          <EmptyState title='暂无余额明细' description='到店消费或充值后会记录在这里' />
        </View>
      )}

      <Text className='nb-balance-foot'>如余额异常，请联系门店核对</Text>
    </View>
  )
}
