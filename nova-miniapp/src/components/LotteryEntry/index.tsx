import { Text, View } from '@tarojs/components'
import { Button } from '@nutui/nutui-react-taro'
import { ArrowRight, Gift } from '@nutui/icons-react-taro'
import type { LotteryConfig } from '@/types/api'
import { formatPoints } from '@/utils/format'
import './index.scss'

interface LotteryEntryProps {
  config: LotteryConfig | null
  /** 配置未返回前用会员积分兜底 */
  fallbackPoints: number
  onDraw: () => void
  onRecords: () => void
}

const DEFAULT_PRIZES = ['50 积分', '100 积分', '10 元券', '30 元券', '谢谢参与']

/** 发现页积分抽奖入口：不在这里抽奖，跳转独立大转盘页 */
export default function LotteryEntry({ config, fallbackPoints, onDraw, onRecords }: LotteryEntryProps) {
  const points = config?.points ?? fallbackPoints
  const cost = config?.cost ?? 10
  // 奖项列表来自奖池接口（/mini/lottery/config），只罗列真实奖品，谢谢参与不算奖品
  const prizeNames = config?.prizes?.length
    ? config.prizes.filter((item) => item.prizeType !== 'none').map((item) => item.name)
    : DEFAULT_PRIZES

  return (
    <View className='nb-lottery-card'>
      <View className='nb-lottery-inner'>
        <View className='nb-lottery-head'>
          <View className='nb-lottery-title-row'>
            <Gift size={20} color='#ffffff' />
            <Text className='nb-lottery-title'>积分抽奖</Text>
          </View>
          <View className='nb-lottery-record' onClick={onRecords}>
            <Text>抽奖记录</Text>
            <ArrowRight size={10} color='#ffffff' />
          </View>
        </View>
        <Text className='nb-lottery-sub'>{cost} 积分抽一次，100% 中奖（含谢谢参与）</Text>
        <View className='nb-lottery-prizes'>
          {prizeNames.map((name) => (
            <Text key={name} className='nb-lottery-prize'>
              {name}
            </Text>
          ))}
        </View>
        <View className='nb-lottery-foot'>
          <View>
            <Text className='nb-lottery-points-label'>当前积分</Text>
            <Text className='nb-lottery-points'>{formatPoints(points)}</Text>
          </View>
          <Button className='nb-lottery-button' onClick={onDraw}>
            <View className='nb-lottery-button-inner'>
              <Gift size={16} color='#c2410c' />
              <Text>去抽奖</Text>
            </View>
          </Button>
        </View>
      </View>
    </View>
  )
}
