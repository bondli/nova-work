import { Text, View } from '@tarojs/components'
import { Button, Progress } from '@nutui/nutui-react-taro'
import type { RedeemItem } from '@/types/api'
import { formatPoints } from '@/utils/format'
import MediaImage from '@/components/MediaImage'
import './index.scss'

interface RedeemCardProps {
  item: RedeemItem
  /** 当前积分：决定按钮是否可兑换 */
  points: number
  onRedeem: (item: RedeemItem) => void
}

/** 积分兑换礼品卡：库存进度 + 兑换按钮状态，对齐 demo 的 .redeem-card */
export default function RedeemCard({ item, points, onRedeem }: RedeemCardProps) {
  const soldOut = item.remainStock <= 0 || item.stock <= 0
  const limitReached = item.perMemberLeft <= 0
  const enough = points >= item.points
  const disabled = soldOut || limitReached || !enough
  const percent = item.totalStock > 0 ? Math.round((item.remainStock / item.totalStock) * 100) : 0

  const buttonText = soldOut ? '已兑完' : limitReached ? '已达上限' : enough ? '兑换' : '积分不足'

  return (
    <View className='nb-redeem-card'>
      <MediaImage src={item.image} label='DAVE & BELLA' className='nb-redeem-img' />
      <View className='nb-redeem-body'>
        <View className='nb-redeem-top'>
          <View className='nb-redeem-info'>
            <Text className='nb-redeem-name'>{item.name}</Text>
            <Text className='nb-redeem-desc'>{item.description}</Text>
            <Text className='nb-redeem-points'>
              <Text className='nb-redeem-points-unit'>需 </Text>
              {formatPoints(item.points)}
              <Text className='nb-redeem-points-unit'> 积分</Text>
            </Text>
          </View>
          <Button
            type='primary'
            size='small'
            disabled={disabled}
            className={`nb-redeem-button ${disabled ? '' : 'nb-redeem-button-on'}`}
            onClick={() => onRedeem(item)}
          >
            {buttonText}
          </Button>
        </View>
        <View className='nb-redeem-stock'>
          <Progress percent={percent} color='#ff0f23' background='#f4f4f5' strokeWidth='4px' showText={false} />
          <Text className='nb-redeem-stock-text'>剩 {item.remainStock} 件</Text>
        </View>
      </View>
    </View>
  )
}
