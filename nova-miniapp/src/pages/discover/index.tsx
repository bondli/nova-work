import { useEffect, useRef, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow, useShareAppMessage } from '@tarojs/taro'
import { Gift, Store } from '@nutui/icons-react-taro'
import EmptyState from '@/components/EmptyState'
import LoginGuide from '@/components/LoginGuide'
import LotteryEntry from '@/components/LotteryEntry'
import RedeemPanel from '@/components/RedeemPanel'
import SectionHeader from '@/components/SectionHeader'
import SignInCard from '@/components/SignInCard'
import { getLotteryConfig, getSignInStatus, signIn } from '@/services/engage'
import { getRedeemItems } from '@/services/redeem'
import { useUserStore } from '@/stores/user'
import type { LotteryConfig, RedeemItem, SignInStatus } from '@/types/api'
import { formatPoints } from '@/utils/format'
import './index.scss'

export default function DiscoverPage() {
  const token = useUserStore((state) => state.token)
  const member = useUserStore((state) => state.member)
  const refreshProfile = useUserStore((state) => state.refreshProfile)
  const [signStatus, setSignStatus] = useState<SignInStatus | null>(null)
  const [lottery, setLottery] = useState<LotteryConfig | null>(null)
  const [redeemItems, setRedeemItems] = useState<RedeemItem[]>([])
  const [points, setPoints] = useState(0)
  const [loading, setLoading] = useState(false)
  const [signing, setSigning] = useState(false)
  const firstShow = useRef(true)

  // 开启右上角「···」面板的「转发给朋友」
  useShareAppMessage(() => ({
    title: 'Dave & Bella · 会员签到与积分礼遇',
    path: '/pages/discover/index',
    imageUrl: 'https://davebella.top/pos2/mini-image/mini-20261104203517-b051157d.jpg',
  }))

  const loadAll = async () => {
    setLoading(true)
    try {
      const [status, config, redeem] = await Promise.all([getSignInStatus(), getLotteryConfig(), getRedeemItems()])
      setSignStatus(status)
      setLottery(config)
      setRedeemItems(redeem.items)
      setPoints(redeem.points)
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '加载失败，请稍后重试', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  // 登录态到达后加载会员数据
  useEffect(() => {
    if (token) void loadAll()
    // 依赖 token，登录成功后自动刷新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // 从抽奖/兑换记录页返回时刷新积分与库存
  useDidShow(() => {
    if (firstShow.current) {
      firstShow.current = false
      return
    }
    if (token) void loadAll()
  })

  const handleSignIn = async () => {
    if (!signStatus || signStatus.todaySigned || signing) return
    setSigning(true)
    try {
      const result = await signIn()
      setSignStatus({
        todaySigned: result.todaySigned,
        streakDays: result.streakDays,
        totalPoints: result.totalPoints,
        rewards: result.rewards,
        signedDates: signStatus.signedDates
      })
      setPoints(result.totalPoints)
      void refreshProfile()
      Taro.showToast({
        title: result.already ? '今日已签到' : `签到成功，+${result.addedPoints} 积分已到账`,
        icon: result.already ? 'none' : 'success'
      })
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '签到失败', icon: 'none' })
    } finally {
      setSigning(false)
    }
  }

  if (!token) {
    return <LoginGuide scene='discover' onLoggedIn={() => void loadAll()} />
  }

  const displayPoints = points || member?.point || 0

  return (
    <View className='nb-page nb-discover'>
      <View className='nb-discover-head'>
        <View>
          <Text className='nb-discover-title'>会员福利</Text>
          <Text className='nb-discover-sub'>签到攒积分，积分换好礼，兑换后到店自提</Text>
        </View>
        <View className='nb-chip nb-chip-brand' onClick={() => Taro.navigateTo({ url: '/pages/points/index' })}>
          <Text>{formatPoints(displayPoints)} 积分</Text>
        </View>
      </View>

      {signStatus ? (
        <View className='nb-discover-block'>
          <SignInCard status={signStatus} loading={signing} onSignIn={handleSignIn} />
        </View>
      ) : (
        <View className='nb-discover-loading'>
          <EmptyState title='数据加载中' description={loading ? '正在同步会员数据' : '下拉刷新重试'} />
        </View>
      )}

      <View className='nb-discover-block'>
        <LotteryEntry
          config={lottery}
          fallbackPoints={displayPoints}
          onDraw={() => Taro.navigateTo({ url: '/pages/draw/index' })}
          onRecords={() => Taro.navigateTo({ url: '/pages/draws/index' })}
        />
      </View>

      <SectionHeader
        title='积分兑换'
        more='兑换记录'
        onMore={() => Taro.navigateTo({ url: '/pages/redeem-records/index' })}
      />
      <RedeemPanel
        items={redeemItems}
        points={displayPoints}
        onRedeemed={(nextPoints) => {
          setPoints(nextPoints)
          void loadAll()
        }}
        onRefresh={loadAll}
      />

      <View className='nb-card nb-redeem-note'>
        <Store size={14} color='#71717a' />
        <Text>
          兑换成功后生成取货码，请在 30 天内到店自提；满减 / 满送券由门店活动自动发放，可在「我的 - 优惠券」查看。
        </Text>
      </View>

      <View className='nb-card nb-discover-note'>
        <Gift size={14} color='#71717a' />
        <Text>签到、抽奖获得的积分实时到账；兑换成功后请留意取货码有效期。</Text>
      </View>
    </View>
  )
}
