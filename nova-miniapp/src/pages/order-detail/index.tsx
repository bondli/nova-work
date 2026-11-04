import { useEffect, useState } from 'react'
import { Text, View } from '@tarojs/components'
import { useRouter } from '@tarojs/taro'
import { Image, Skeleton } from '@nutui/nutui-react-taro'
import clothesIcon from '@/assets/clothes.svg'
import EmptyState from '@/components/EmptyState'
import { getOrderDetail } from '@/services/order'
import type { OrderDetail } from '@/types/api'
import { formatAmount, formatDateTime, formatMoney, formatPayType } from '@/utils/format'
import './index.scss'

export default function OrderDetailPage() {
  const router = useRouter()
  const orderSn = router.params.orderSn ?? ''
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadDetail = async () => {
    if (!orderSn) {
      setLoading(false)
      setError('缺少订单号')
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await getOrderDetail(orderSn)
      setDetail(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '订单加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadDetail()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderSn])

  if (loading) {
    return (
      <View className='nb-page'>
        <View className='nb-card nb-order-detail-skeleton'>
          <Skeleton rows={8} animated />
        </View>
      </View>
    )
  }

  if (error || !detail) {
    return (
      <View className='nb-page'>
        <EmptyState title='订单详情加载失败' description={error} actionText='重新加载' onAction={loadDetail} />
      </View>
    )
  }

  const { order, items } = detail
  const discount = Math.max(0, Number(order.orderAmount) - Number(order.orderActualAmount))

  return (
    <View className='nb-page nb-order-detail'>
      <View className='nb-order-detail-info'>
        <View className='nb-order-detail-row'>
          <Text>订单号</Text>
          <Text className='nb-order-detail-value'>{order.orderSn}</Text>
        </View>
        <View className='nb-order-detail-row'>
          <Text>下单时间</Text>
          <Text className='nb-order-detail-value'>{formatDateTime(order.createdAt)}</Text>
        </View>
        <View className='nb-order-detail-row'>
          <Text>支付方式</Text>
          <Text className='nb-order-detail-value'>{formatPayType(order.payType)}</Text>
        </View>
      </View>

      <View className={items.length ? 'nb-order-goods' : ''}>
        {items.length ? (
          items.map((item) => (
            <View className='nb-order-good' key={item.id}>
              <View className='nb-order-good-thumb'>
                <Image src={clothesIcon} width={22} height={22} fit='contain' />
              </View>
              <View className='nb-order-good-info'>
                <Text className='nb-order-good-name'>{item.name}</Text>
                <Text className='nb-order-good-spec'>
                  {[item.color, item.size].filter(Boolean).join(' · ') || item.sku}
                </Text>
              </View>
              <View className='nb-order-good-price'>
                {Number(item.originalPrice) > 0 && (
                  <Text className='nb-order-good-original'>¥{formatAmount(item.originalPrice)}</Text>
                )}
                <Text className='nb-order-good-amount'>¥{formatAmount(item.actualPrice)}</Text>
                <Text className='nb-order-good-count'>x{item.counts}</Text>
              </View>
            </View>
          ))
        ) : (
          <EmptyState title='暂无商品明细' description='该订单商品明细缺失，请联系门店核对' />
        )}
      </View>

      <View className='nb-order-total'>
        <View className='nb-order-total-row'>
          <Text className='nb-order-total-label'>商品合计</Text>
          <Text className='nb-order-total-value'>{formatMoney(order.orderAmount)}</Text>
        </View>
        <View className='nb-order-total-row'>
          <Text className='nb-order-total-label'>优惠</Text>
          <Text className='nb-order-total-discount'>-{formatMoney(discount)}</Text>
        </View>
        <View className='nb-order-total-row nb-order-total-final'>
          <Text className='nb-order-total-final-label'>实付</Text>
          <Text className='nb-order-total-final-value'>{formatMoney(order.orderActualAmount)}</Text>
        </View>
      </View>

      <Text className='nb-order-detail-foot'>如对订单有疑问，请联系门店导购</Text>
    </View>
  )
}
