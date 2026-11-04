import { Text, View } from '@tarojs/components'
import { Coupon, Gift, Star } from '@nutui/icons-react-taro'
import './index.scss'

/** 会员权益三条：首页「会员权益」与我的页权益浮层共用，文案必须保持一致 */
const MEMBER_RIGHTS = [
  // 星星 → 积分；券 → 折扣；礼物 → 生日好礼，图标与文案一一对应
  { tone: 'brand', icon: <Star size={20} color='#ff0f23' />, text: '到店购物获得积分，消费 1 元得 1 积分' },
  { tone: 'amber', icon: <Coupon size={20} color='#b45309' />, text: '会员日（每月 18 号）购物享受双倍积分' },
  { tone: 'rose', icon: <Gift size={20} color='#be123c' />, text: '生日当月到店消费领取精美好礼' }
]

/** 权益卡片列表：无右侧操作按钮，纯展示 */
export default function MemberRights() {
  return (
    <View className='nb-rights-list'>
      {MEMBER_RIGHTS.map((item) => (
        <View key={item.text} className='nb-rights-card'>
          <View className={`nb-rights-icon nb-rights-icon-${item.tone}`}>{item.icon}</View>
          <Text className='nb-rights-text'>{item.text}</Text>
        </View>
      ))}
    </View>
  )
}
