import { useEffect, useRef, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Button, Image, Skeleton } from '@nutui/nutui-react-taro'
import { Gift } from '@nutui/icons-react-taro'
import sadFaceIcon from '@/assets/sad-face.svg'
import BottomSheet from '@/components/BottomSheet'
import EmptyState from '@/components/EmptyState'
import StatusTag from '@/components/StatusTag'
import Wheel from '@/components/Wheel'
import { getLotteryConfig, drawLottery } from '@/services/engage'
import { useUserStore } from '@/stores/user'
import type { DrawRecord, DrawResult, LotteryConfig } from '@/types/api'
import { formatPoints } from '@/utils/format'
import { createRequestId, nextWheelRotation } from '@/utils/wheel'
import './index.scss'

/** 读取抽奖记录 extra 中的 prizeId，用于把转盘停在服务端命中的扇区 */
function readPrizeId(record: DrawRecord): number | null {
  const extra = record.extra
  if (!extra) return null
  if (typeof extra === 'string') {
    try {
      const parsed = JSON.parse(extra) as { prizeId?: number | null }
      return parsed.prizeId ?? null
    } catch {
      return null
    }
  }
  return extra.prizeId ?? null
}

export default function DrawPage() {
  const member = useUserStore((state) => state.member)
  const refreshProfile = useUserStore((state) => state.refreshProfile)
  const [config, setConfig] = useState<LotteryConfig | null>(null)
  const [points, setPoints] = useState(0)
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<DrawResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const spinningRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadConfig = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getLotteryConfig()
      setConfig(data)
      setPoints(data.points)
    } catch (err) {
      setError(err instanceof Error ? err.message : '抽奖配置加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadConfig()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSpin = async () => {
    if (!config || spinningRef.current) return
    if (config.todayCount >= config.dailyLimit) {
      Taro.showToast({ title: '今日抽奖次数已用完', icon: 'none' })
      return
    }
    if (points < config.cost) {
      Taro.showToast({ title: '积分不足，去签到赚积分吧', icon: 'none' })
      return
    }

    spinningRef.current = true
    setSpinning(true)
    try {
      const data = await drawLottery(createRequestId())
      const prizeId = readPrizeId(data.record)
      // 优先按服务端 prizeId 定位扇区，缺失时退化为按奖品名称匹配
      const byId = prizeId === null ? -1 : config.prizes.findIndex((prize) => prize.id === prizeId)
      const byName = config.prizes.findIndex((prize) => prize.name === data.prize)
      const sectorIndex = byId >= 0 ? byId : byName >= 0 ? byName : 0

      setRotation((current) => nextWheelRotation(current, sectorIndex))
      setPoints(data.totalPoints)
      setConfig((current) =>
        current ? { ...current, todayCount: data.todayCount, points: data.totalPoints } : current
      )
      void refreshProfile()

      // 4s 与转盘过渡时长一致，转完再弹结果
      timerRef.current = setTimeout(() => {
        spinningRef.current = false
        setSpinning(false)
        setResult(data)
      }, 4100)
    } catch (err) {
      spinningRef.current = false
      setSpinning(false)
      Taro.showToast({ title: err instanceof Error ? err.message : '抽奖失败', icon: 'none' })
    }
  }

  const closeResult = () => setResult(null)

  const spinAgain = () => {
    setResult(null)
    void handleSpin()
  }

  if (loading && !config) {
    return (
      <View className='nb-page'>
        <View className='nb-card nb-draw-skeleton'>
          <Skeleton rows={8} animated />
        </View>
      </View>
    )
  }

  if (error || !config) {
    return (
      <View className='nb-page'>
        <View>
          <EmptyState title='抽奖加载失败' description={error} actionText='重新加载' onAction={loadConfig} />
        </View>
      </View>
    )
  }

  const remaining = Math.max(0, config.dailyLimit - config.todayCount)
  const win = result ? result.prizeType !== 'none' : false
  const resultNote = !result
    ? ''
    : result.prizeType === 'points'
      ? '积分已自动到账'
      : result.prizeType === 'coupon'
        ? '优惠券已放入「我的优惠券」'
        : '再接再厉，下次好运'

  return (
    <View className='nb-page nb-draw-page'>
      <View className='nb-card nb-draw-card'>
        <Text className='nb-draw-title'>好运转出来</Text>
        <Text className='nb-draw-sub'>{config.cost} 积分抽一次 · 每日最多 {config.dailyLimit} 次</Text>

        <View className='nb-draw-wheel'>
          <Wheel
            prizes={config.prizes}
            rotation={rotation}
            spinning={spinning}
            disabled={points < config.cost || remaining <= 0}
            cost={config.cost}
            onSpin={handleSpin}
          />
        </View>

        <View className='nb-draw-badges'>
          <StatusTag text={`今日剩余 ${remaining} 次`} tone='brand' />
          <StatusTag text='耗积分抽好礼' tone='warning' />
        </View>

        <Text className='nb-draw-points'>
          当前积分 <Text className='nb-draw-points-value'>{formatPoints(points || member?.point || 0)}</Text> · 中奖积分实时到账
        </Text>

        <View className='nb-draw-pool'>
          <Text>奖品池：积分 / 满减券 / 谢谢参与</Text>
          <View className='nb-draw-pool-link' onClick={() => Taro.navigateTo({ url: '/pages/draws/index' })}>
            <Text>抽奖记录</Text>
            <Gift size={12} color='#c7001a' />
          </View>
        </View>
      </View>

      <View className='nb-card nb-draw-rules'>
        <Text className='nb-draw-rules-title'>抽奖规则</Text>
        <Text className='nb-draw-rules-line'>1. 每次消耗 {config.cost} 积分，每日最多 {config.dailyLimit} 次；</Text>
        <Text className='nb-draw-rules-line'>2. 积分奖品实时到账，优惠券自动放入「我的优惠券」；</Text>
        <Text className='nb-draw-rules-line'>3. 抽奖结果以服务端记录为准，不支持撤销。</Text>
      </View>

      <Text className='nb-draw-foot'>Dave & Bella · 把柔软穿进童年</Text>

      <BottomSheet visible={Boolean(result)} onClose={closeResult} showClose={false}>
        {result ? (
          <View className='nb-draw-result'>
            <View className={`nb-draw-result-icon ${win ? 'nb-draw-result-icon-win' : ''}`}>
              {win ? <Gift size={36} color='#ff0f23' /> : <Image src={sadFaceIcon} width={36} height={36} fit='contain' />}
            </View>
            <Text className='nb-draw-result-title'>{win ? '恭喜中奖' : '差一点点'}</Text>
            <Text className={`nb-draw-result-prize ${win ? 'nb-draw-result-prize-win' : ''}`}>{result.prize}</Text>
            <Text className='nb-draw-result-note'>{resultNote}</Text>
            <View className='nb-draw-result-actions'>
              <Button className='nb-draw-result-cancel' onClick={closeResult}>
                {win ? '收下' : '关闭'}
              </Button>
              <Button type='primary' className='nb-draw-result-submit' onClick={spinAgain}>
                再抽一次
              </Button>
            </View>
          </View>
        ) : null}
      </BottomSheet>
    </View>
  )
}
