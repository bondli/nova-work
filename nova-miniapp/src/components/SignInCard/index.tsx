import { Text, View } from '@tarojs/components'
import { Button } from '@nutui/nutui-react-taro'
import { Check, Clock } from '@nutui/icons-react-taro'
import type { SignInStatus } from '@/types/api'
import './index.scss'

interface SignInCardProps {
  status: SignInStatus
  loading?: boolean
  onSignIn: () => void
}

/** 每日签到卡：7 天奖励条 + 签到按钮，服务端 rewards 为唯一状态来源 */
export default function SignInCard({ status, loading = false, onSignIn }: SignInCardProps) {
  const todayReward = status.rewards.find((item) => item.today)
  const todayPoints = todayReward?.points ?? 0

  return (
    <View className='nb-card nb-sign-card'>
      <View className='nb-sign-head'>
        <View>
          <Text className='nb-sign-title'>每日签到</Text>
          <Text className='nb-sign-sub'>连续签到 7 天，最高 +30 积分</Text>
        </View>
        <View className='nb-sign-streak'>
          <Text className='nb-sign-streak-label'>已连续</Text>
          <Text className='nb-sign-streak-value'>
            {status.streakDays}
            <Text className='nb-sign-streak-unit'> 天</Text>
          </Text>
        </View>
      </View>

      <View className='nb-sign-days'>
        {status.rewards.map((item) => {
          const done = item.signed
          const isToday = item.today && !item.signed
          const dotClass = done ? 'nb-sign-dot nb-sign-dot-done' : isToday ? 'nb-sign-dot nb-sign-dot-today' : 'nb-sign-dot'
          return (
            <View key={item.day} className='nb-sign-day'>
              <View className={dotClass}>
                {done ? (
                  <Check size={14} color='#ff0f23' />
                ) : isToday ? (
                  <Text className='nb-sign-dot-plus'>+</Text>
                ) : (
                  <Text>{item.day}</Text>
                )}
              </View>
              <Text className='nb-sign-day-label'>{item.today ? '今天' : `第${item.day}天`}</Text>
              <Text className={`nb-sign-day-points ${done ? 'nb-sign-day-points-done' : ''}`}>{item.points}分</Text>
            </View>
          )
        })}
      </View>

      <Button
        type='primary'
        block
        loading={loading}
        disabled={status.todaySigned}
        className='nb-sign-button'
        onClick={onSignIn}
      >
        {status.todaySigned ? (
          <View className='nb-sign-button-inner'>
            <Clock size={16} color='#ffffff' />
            <Text>今日已签到</Text>
          </View>
        ) : (
          `立即签到 +${todayPoints} 积分`
        )}
      </Button>
      <Text className='nb-sign-note'>签到积分实时到账，可在积分流水中查看</Text>
    </View>
  )
}
