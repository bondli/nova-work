import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Button } from '@nutui/nutui-react-taro'
import { LocationF, Phone } from '@nutui/icons-react-taro'
import type { StoreInfo } from '@/types/api'
import MediaImage from '@/components/MediaImage'
import StatusTag from '@/components/StatusTag'
import './index.scss'

interface StoreCardProps {
  store: StoreInfo
}

/** 把 "10:00" 转成当天分钟数，解析失败返回 null */
function parseClock(value: string): number | null {
  const match = value.match(/(\d{1,2})[:：](\d{1,2})/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

/**
 * 根据配置的营业时间判断当前是否营业。
 * 支持 "10:00 - 21:30 · 周一至周日" 这类格式，也兼容跨天营业（如 22:00 - 02:00）。
 * 时间格式无法解析时按营业中处理，避免误判闭店。
 */
export function isStoreOpen(hours: string, now = new Date()): boolean {
  const match = hours.match(/(\d{1,2}[:：]\d{1,2})\s*[-~～—]\s*(\d{1,2}[:：]\d{1,2})/)
  if (!match) return true
  const start = parseClock(match[1] ?? '')
  const end = parseClock(match[2] ?? '')
  if (start === null || end === null) return true

  const current = now.getHours() * 60 + now.getMinutes()
  return start <= end ? current >= start && current < end : current >= start || current < end
}

/** 到店体验卡：门店图 + 地址/营业时间 + 导航/电话 */
export default function StoreCard({ store }: StoreCardProps) {
  const open = isStoreOpen(store.hours)

  const handleNavigate = () => {
    Taro.openLocation({
      latitude: store.lat,
      longitude: store.lng,
      name: store.name,
      address: store.address,
      scale: 16
    })
  }

  const handleCall = () => {
    const phone = store.phone.replace(/\D/g, '')
    if (!phone) {
      Taro.showToast({ title: '门店暂未配置联系电话', icon: 'none' })
      return
    }
    Taro.makePhoneCall({
      phoneNumber: phone,
      fail: () => Taro.showToast({ title: `拨号失败，请手动拨打 ${phone}`, icon: 'none' })
    })
  }

  return (
    <View className='nb-card nb-store-card'>
      <MediaImage src={store.image} label='DAVE & BELLA 门店' className='nb-store-img' />
      <View className='nb-store-body'>
        <View className='nb-store-title-row'>
          <Text className='nb-store-name'>{store.name}</Text>
          <StatusTag text={open ? '营业中' : '闭店中'} tone={open ? 'success' : 'neutral'} />
        </View>
        <Text className='nb-store-address'>{store.address}</Text>
        <Text className='nb-store-hours'>{store.hours}</Text>
        <View className='nb-store-actions'>
          <Button className='nb-store-button' onClick={handleNavigate}>
            <View className='nb-store-button-inner'>
              <LocationF size={14} color='#18181b' />
              <Text>一键导航</Text>
            </View>
          </Button>
          <Button className='nb-store-button' onClick={handleCall}>
            <View className='nb-store-button-inner'>
              <Phone size={14} color='#18181b' />
              <Text>联系门店</Text>
            </View>
          </Button>
        </View>
      </View>
    </View>
  )
}
