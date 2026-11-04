import { Text, View } from '@tarojs/components'
import { Cell } from '@nutui/nutui-react-taro'
import './index.scss'

interface RecordRowProps {
  title: string
  time: string
  /** 金额或积分变动文案，如 +1,268 / -10 */
  amount: string
  positive?: boolean
}

/** 流水/记录行：统一走 NutUI Cell，保证列表分隔线与点击态一致 */
export default function RecordRow({ title, time, amount, positive = false }: RecordRowProps) {
  return (
    <Cell
      className='nb-record-row'
      title={
        <View className='nb-record-main'>
          <Text className='nb-record-title'>{title}</Text>
          <Text className='nb-record-time'>{time}</Text>
        </View>
      }
      extra={
        <Text className={`nb-record-amount ${positive ? 'nb-record-amount-in' : ''}`}>{amount}</Text>
      }
    />
  )
}
