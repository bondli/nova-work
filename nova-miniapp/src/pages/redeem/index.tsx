import { useEffect, useRef, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { Gift } from '@nutui/icons-react-taro'
import EmptyState from '@/components/EmptyState'
import RedeemPanel from '@/components/RedeemPanel'
import { getRedeemItems } from '@/services/redeem'
import { useUserStore } from '@/stores/user'
import type { RedeemItem } from '@/types/api'
import { formatPoints } from '@/utils/format'
import './index.scss'

export default function RedeemPage() {
  const token = useUserStore((state) => state.token)
  const member = useUserStore((state) => state.member)
  const [items, setItems] = useState<RedeemItem[]>([])
  const [points, setPoints] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const firstShow = useRef(true)

  const loadItems = async () => {
    setLoading(true)
    try {
      const result = await getRedeemItems()
      setItems(result.items)
      setPoints(result.points)
      setLoaded(true)
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '加载失败，请稍后重试', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) void loadItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useDidShow(() => {
    if (firstShow.current) {
      firstShow.current = false
      return
    }
    if (token) void loadItems()
  })

  if (!token) {
    return (
      <View className='nb-page'>
        <View>
          <EmptyState title='请先登录' description='登录后可参与积分兑换' actionText='去登录' onAction={() => Taro.switchTab({ url: '/pages/mine/index' })} />
        </View>
      </View>
    )
  }

  const displayPoints = points || member?.point || 0

  return (
    <View className='nb-page nb-redeem-page'>
      <View className='nb-redeem-head'>
        <View>
          <Text className='nb-redeem-title'>积分兑换</Text>
          <Text className='nb-redeem-sub'>积分换好礼，兑换后到店自提</Text>
        </View>
        <View className='nb-chip nb-chip-brand' onClick={() => Taro.navigateTo({ url: '/pages/points/index' })}>
          <Text>{formatPoints(displayPoints)} 积分</Text>
        </View>
      </View>

      {!loaded && loading ? (
        <View className='nb-redeem-loading'>
          <EmptyState title='加载中' description='正在同步可兑换礼品' />
        </View>
      ) : (
        <RedeemPanel
          items={items}
          points={displayPoints}
          onRedeemed={(nextPoints) => {
            setPoints(nextPoints)
            void loadItems()
          }}
          onRefresh={loadItems}
        />
      )}

      <View className='nb-card nb-redeem-tip'>
        <Gift size={14} color='#71717a' />
        <Text>兑换成功后生成 6 位取货码，请在 30 天内到店自提；逾期作废且积分不退。</Text>
      </View>
    </View>
  )
}
