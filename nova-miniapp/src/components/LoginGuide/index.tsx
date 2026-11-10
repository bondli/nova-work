import { Text, View } from '@tarojs/components'
import { Clock, Gift, Joy, Order, User, Wallet } from '@nutui/icons-react-taro'
import AuthButton from '@/components/AuthButton'
import './index.scss'

interface LoginGuideProps {
  scene: 'discover' | 'mine'
  onLoggedIn?: () => void
}

const SCENE_CONTENT = {
  discover: {
    icon: <Gift size={28} color='#ff0f23' />,
    title: '登录后查看会员福利',
    desc: '签到送积分、积分抽奖、积分兑换好礼，全部为门店会员专属。',
    benefits: [
      { icon: <Clock size={16} color='#ff0f23' />, title: '每日签到', desc: '连续签到最高 +30 积分' },
      { icon: <Joy size={16} color='#ff0f23' />, title: '积分抽奖', desc: '10 积分抽一次，好礼天天有' },
      { icon: <Gift size={16} color='#ff0f23' />, title: '积分兑换', desc: '积分换实物，到店自提好礼' }
    ]
  },
  mine: {
    icon: <User size={28} color='#ff0f23' />,
    title: '登录后查看会员资产',
    desc: '购物记录、积分流水、抽奖记录、优惠券、兑换记录与店内余额，一次看全。',
    benefits: [
      { icon: <Wallet size={16} color='#ff0f23' />, title: '会员资产', desc: '积分、余额、优惠券一目了然' },
      { icon: <Order size={16} color='#ff0f23' />, title: '购物记录', desc: '到店消费订单随时可查' },
      { icon: <Joy size={16} color='#ff0f23' />, title: '积分与抽奖', desc: '每一笔变动都有记录' }
    ]
  }
}

/** 发现 / 我的 未登录引导，文案与 demo lockedPage 一致 */
export default function LoginGuide({ scene, onLoggedIn }: LoginGuideProps) {
  const content = SCENE_CONTENT[scene]

  return (
    <View className='nb-page nb-login-guide'>
      <View className='nb-card nb-lock-card'>
        <View className='nb-lock-icon'>{content.icon}</View>
        <Text className='nb-lock-title'>{content.title}</Text>
        <Text className='nb-lock-desc'>{content.desc}</Text>

        <View className='nb-benefits'>
          {content.benefits.map((benefit) => (
            <View key={benefit.title} className='nb-benefit'>
              <View className='nb-benefit-icon'>{benefit.icon}</View>
              <View className='nb-benefit-body'>
                <Text className='nb-benefit-title'>{benefit.title}</Text>
                <Text className='nb-benefit-desc'>{benefit.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View className='nb-login-action'>
          <AuthButton text='手机号快捷登录' onLoggedIn={onLoggedIn} />
        </View>
        <Text className='nb-login-note'>手机号即门店会员号；首次登录将自动注册成为会员</Text>
      </View>
      <Text className='nb-login-foot'>仅首页无需登录，会员功能均需手机号登录</Text>
    </View>
  )
}
