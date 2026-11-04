import { useCallback, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { Button } from '@nutui/nutui-react-taro'
import { Gift } from '@nutui/icons-react-taro'
import EmptyState from '@/components/EmptyState'
import MediaImage from '@/components/MediaImage'
import { claimActivityCoupon, getActivityDetail } from '@/services/activity'
import type { ActivityCoupon, ActivityDetail } from '@/types/api'
import { formatDate } from '@/utils/format'
import './index.scss'

/** 活动类型文案：与营销活动列表保持一致 */
const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  full_send: '满送活动',
  full_reduce: '满减活动',
  full_gift: '满赠活动'
}

const conditionText = (coupon: ActivityCoupon): string =>
  coupon.condition === null ? '无门槛使用' : `满 ${coupon.condition} 元可用`

/**
 * 活动详情页：入口为首页 banner 配置的 `/pages/activity-detail/index?id=活动ID`。
 * 顶部展示活动大图与营销信息，下方展示活动关联优惠券并支持领取。
 */
export default function ActivityDetailPage() {
  const [activityId, setActivityId] = useState('')
  const [detail, setDetail] = useState<ActivityDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [claimingId, setClaimingId] = useState<number | null>(null)

  const load = useCallback(async (id: string) => {
    if (!id) {
      setLoading(false)
      setError('活动参数缺失，请从首页活动入口进入')
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await getActivityDetail(id)
      setDetail(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '活动加载失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [])

  useLoad((params) => {
    const id = String(params?.id ?? '')
    setActivityId(id)
    void load(id)
  })

  const handleClaim = async (coupon: ActivityCoupon) => {
    if (!detail || claimingId !== null || coupon.claimed || coupon.expired) return
    setClaimingId(coupon.id)
    try {
      await claimActivityCoupon(detail.id, coupon.id)
      setDetail((current) =>
        current
          ? {
              ...current,
              coupons: current.coupons.map((item) =>
                item.id === coupon.id ? { ...item, claimed: true } : item
              )
            }
          : current
      )
      Taro.showToast({ title: '领取成功，已放入我的优惠券', icon: 'none' })
    } catch (err) {
      Taro.showToast({ title: err instanceof Error ? err.message : '领取失败，请稍后重试', icon: 'none' })
    } finally {
      setClaimingId(null)
    }
  }

  if (loading) {
    return (
      <View className='nb-page'>
        <EmptyState title='加载中' description='正在获取活动信息' />
      </View>
    )
  }

  if (error || !detail) {
    return (
      <View className='nb-page'>
        <EmptyState
          title='活动加载失败'
          description={error || '活动不存在或已下线'}
          actionText='重新加载'
          onAction={() => void load(activityId)}
        />
      </View>
    )
  }

  return (
    <View className='nb-page nb-activity-detail'>
      <View className='nb-act-hero'>
        <MediaImage src={detail.image} label={detail.theme || 'DAVE & BELLA'} className='nb-act-hero-img' />
        <View className='nb-act-hero-shade' />
        <View className='nb-act-hero-body'>
          {detail.theme ? <Text className='nb-act-hero-tag'>{detail.theme}</Text> : null}
          <Text className='nb-act-hero-title'>{detail.name}</Text>
          {detail.description ? <Text className='nb-act-hero-desc'>{detail.description}</Text> : null}
        </View>
      </View>

      <View className='nb-act-info'>
        <View className='nb-act-info-row'>
          <Text className='nb-act-info-label'>活动类型</Text>
          <Text className='nb-act-info-value'>{ACTIVITY_TYPE_LABEL[detail.type] ?? '门店活动'}</Text>
        </View>
        <View className='nb-act-info-row'>
          <Text className='nb-act-info-label'>活动时间</Text>
          <Text className='nb-act-info-value'>
            {formatDate(detail.startTime) || '—'} ~ {formatDate(detail.endTime) || '—'}
          </Text>
        </View>
        <View className='nb-act-info-row'>
          <Text className='nb-act-info-label'>活动内容</Text>
          <Text className='nb-act-info-value'>
            {detail.condition > 0
              ? detail.type === 'full_gift'
                ? `满 ${detail.condition} 件赠 ${detail.value} 件`
                : `满 ${detail.condition} 元减 ${detail.value} 元`
              : detail.description || '详见活动规则'}
          </Text>
        </View>
        {detail.description ? <Text className='nb-act-info-desc'>{detail.description}</Text> : null}
      </View>
      {detail.coupons.length ? (
        <>
          <View className='nb-act-section-head'>
            <Text className='nb-act-section-title'>活动优惠券</Text>
            <Text className='nb-act-section-tip'>领取后自动存入「我的优惠券」</Text>
          </View>
          <View className='nb-act-coupons'>
            {detail.coupons.map((coupon) => {
              const disabled = coupon.claimed || coupon.expired
              return (
                <View key={coupon.id} className={`nb-act-coupon ${disabled ? 'nb-act-coupon-off' : ''}`}>
                  <View className='nb-act-coupon-left'>
                    <Text className='nb-act-coupon-value'>
                      {Number.isInteger(coupon.value) ? coupon.value : coupon.value.toFixed(2)}
                    </Text>
                    <Text className='nb-act-coupon-unit'>元</Text>
                    <Text className='nb-act-coupon-cond'>{conditionText(coupon)}</Text>
                  </View>
                  <View className='nb-act-coupon-body'>
                    <Text className='nb-act-coupon-desc'>{coupon.desc || '活动优惠券'}</Text>
                    <Text className='nb-act-coupon-exp'>
                      {coupon.expired ? '已过期' : coupon.expiredTime ? `有效期至 ${coupon.expiredTime}` : '长期有效'}
                    </Text>
                  </View>
                  <View className='nb-act-coupon-action'>
                    <Button
                      size='small'
                      color='#ff0f23'
                      fill='solid'
                      className='nb-act-claim-btn'
                      disabled={disabled || claimingId === coupon.id}
                      onClick={() => void handleClaim(coupon)}
                    >
                      {coupon.claimed ? '已领取' : coupon.expired ? '已过期' : claimingId === coupon.id ? '领取中' : '立即领取'}
                    </Button>
                  </View>
                </View>
              )
            })}
          </View>
        </>
      ) : null}

      <View className='nb-act-foot'>
        <Gift size={14} color='#c7001a' />
        <Text className='nb-act-foot-text'>优惠券仅限 Dave & Bella 门店收银台使用，不与其他活动同享</Text>
      </View>
    </View>
  )
}
