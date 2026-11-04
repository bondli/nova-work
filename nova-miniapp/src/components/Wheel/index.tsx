import { Text, View } from '@tarojs/components'
import { Button, Image } from '@nutui/nutui-react-taro'
import type { LotteryPrize } from '@/types/api'
import wheelFace from '@/assets/wheel.svg'
import { WHEEL_SECTOR_COUNT } from '@/utils/wheel'
import './index.scss'

interface WheelProps {
  prizes: LotteryPrize[]
  rotation: number
  spinning: boolean
  /** 积分不足 / 次数用完时禁用 */
  disabled: boolean
  cost: number
  onSpin: () => void
}

/** 奖品文案按扇区中心坐标摆放，保持水平可读；半径与 demo 的 92px 一致 */
const LABEL_RADIUS = 92

export default function Wheel({ prizes, rotation, spinning, disabled, cost, onSpin }: WheelProps) {
  const sectors = Array.from({ length: WHEEL_SECTOR_COUNT }, (_, index) => prizes[index]?.name ?? '谢谢参与')

  return (
    <View className='nb-wheel-wrap'>
      <View className='nb-wheel-pointer' />
      <View
        className='nb-wheel-disc'
        style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? 'transform 4s cubic-bezier(.16,.72,.18,1)' : 'none' }}
      >
        <Image src={wheelFace} fit='cover' width='100%' height='100%' className='nb-wheel-face' />
        {sectors.map((name, index) => {
          const angle = (index * (2 * Math.PI)) / WHEEL_SECTOR_COUNT
          const x = Math.round(Math.sin(angle) * LABEL_RADIUS)
          const y = Math.round(-Math.cos(angle) * LABEL_RADIUS)
          return (
            <Text
              key={`${index}-${name}`}
              className='nb-wheel-text'
              style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }}
            >
              {name}
            </Text>
          )
        })}
      </View>
      <Button
        // 次数用完 / 积分不足时仍保持可点击，由页面弹出具体原因提示
        className={`nb-wheel-button${disabled && !spinning ? ' nb-wheel-button-disabled' : ''}`}
        disabled={spinning}
        onClick={onSpin}
      >
        <View className='nb-wheel-button-inner'>
          <Text className='nb-wheel-button-title'>{spinning ? '抽奖中' : '抽奖'}</Text>
          <Text className='nb-wheel-button-sub'>{cost} 积分</Text>
        </View>
      </Button>
    </View>
  )
}
