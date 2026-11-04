import { Text, View } from '@tarojs/components'
import { ArrowRight, Setting, User } from '@nutui/icons-react-taro'
import type { MemberSummary } from '@/types/api'
import { formatMoney, formatPhone, formatPoints, memberLevelLabel } from '@/utils/format'
import StatusTag from '@/components/StatusTag'
import './index.scss'

interface MemberCardProps {
  member: MemberSummary
  onProfile: () => void
  onBalance: () => void
  onPoints: () => void
  onCoupons: () => void
  onRights: () => void
}

/** 会员卡：渐变底 + 资产三列，对齐 demo 的 .member-card */
export default function MemberCard({ member, onProfile, onBalance, onPoints, onCoupons, onRights }: MemberCardProps) {
  const name = member.name || '会员'

  return (
    <View className='nb-member-card'>
      <View className='nb-member-main'>
        <View className='nb-member-head'>
          <View className='nb-member-avatar'>
            {member.name ? (
              <Text className='nb-member-avatar-text'>{member.name.slice(0, 1)}</Text>
            ) : (
              // 未设置姓名时展示通用头像图标，避免出现「会」「员」这种兜底文字
              <User size={22} color='rgba(255, 255, 255, 0.9)' />
            )}
          </View>
          <View className='nb-member-info'>
            <View className='nb-member-name-row'>
              <Text className='nb-member-name'>{name}</Text>
              <StatusTag text={memberLevelLabel(member.level)} tone='white' />
            </View>
            <Text className='nb-member-phone'>会员号 {formatPhone(member.phone)}</Text>
          </View>
          <View className='nb-member-profile' onClick={onProfile}>
            <Setting size={14} color='#ffffff' />
            <Text>资料</Text>
          </View>
        </View>

        <View className='nb-member-assets'>
          <View className='nb-member-asset' onClick={onBalance}>
            <Text className='nb-member-asset-label'>店内余额</Text>
            <Text className='nb-member-asset-value'>{formatMoney(member.balance)}</Text>
          </View>
          <View className='nb-member-asset' onClick={onPoints}>
            <Text className='nb-member-asset-label'>积分</Text>
            <Text className='nb-member-asset-value'>{formatPoints(member.point)}</Text>
          </View>
          <View className='nb-member-asset' onClick={onCoupons}>
            <Text className='nb-member-asset-label'>优惠券</Text>
            <Text className='nb-member-asset-value'>
              {member.coupon}
              <Text className='nb-member-asset-unit'> 张</Text>
            </Text>
          </View>
        </View>

        <View className='nb-member-foot'>
          <Text>到店实付 {formatMoney(member.actual)}</Text>
          <View className='nb-member-rights' onClick={onRights}>
            <Text>权益</Text>
            <ArrowRight size={10} color='rgba(255,255,255,.7)' />
          </View>
        </View>
      </View>
    </View>
  )
}
