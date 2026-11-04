import { useMemo, useState } from 'react'
import { Text, View } from '@tarojs/components'
import { useLoad, useRouter } from '@tarojs/taro'
import { Skeleton } from '@nutui/nutui-react-taro'
import EmptyState from '@/components/EmptyState'
import MediaImage from '@/components/MediaImage'
import { getProduct } from '@/services/home'
import type { ProductDetail, ProductSku } from '@/types/api'
import './index.scss'

/** 商品详情：主图 / 价格 / SKU 列表 / 详描图，款号由首页本季新品配置传入 */
export default function ProductPage() {
  const router = useRouter()
  const sn = String(router.params.sn ?? '')
  const [detail, setDetail] = useState<ProductDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    if (!sn) {
      setError('缺少商品款号')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      setDetail(await getProduct(sn))
    } catch (err) {
      setError(err instanceof Error ? err.message : '商品加载失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  useLoad(() => {
    void load()
  })

  /** 按颜色分组展示 SKU，尺码内联库存 */
  const colorGroups = useMemo(() => {
    const groups = new Map<string, ProductSku[]>()
    detail?.skus.forEach((sku) => {
      const key = sku.color || '默认'
      groups.set(key, [...(groups.get(key) ?? []), sku])
    })
    return Array.from(groups.entries())
  }, [detail])

  if (loading) {
    return (
      <View className='nb-page nb-product-detail'>
        <Skeleton rows={2} animated />
        <Skeleton rows={4} animated className='nb-pd-skeleton' />
      </View>
    )
  }

  if (!detail) {
    return (
      <View className='nb-page nb-product-detail'>
        <EmptyState title='未找到该商品' description={error} actionText='重新加载' onAction={() => void load()} />
      </View>
    )
  }

  return (
    <View className='nb-page nb-product-detail'>
      <MediaImage src={detail.image || (detail.detailImages[0] ?? '')} label='DAVE & BELLA' className='nb-pd-hero' />

      <View className='nb-pd-card'>
        <Text className='nb-pd-brand'>{detail.brand || 'DAVE & BELLA'}</Text>
        <Text className='nb-pd-name'>{detail.name}</Text>
        <View className='nb-pd-price-row'>
          {detail.price ? <Text className='nb-pd-price'>{detail.price}</Text> : null}
          {detail.originPrice ? <Text className='nb-pd-origin'>{detail.originPrice}</Text> : null}
        </View>
        <Text className='nb-pd-sn'>款号 {detail.sn}</Text>
      </View>

      <View className='nb-pd-card'>
        <Text className='nb-pd-section-title'>可选规格</Text>
        {colorGroups.length ? (
          colorGroups.map(([color, skus]) => (
            <View key={color} className='nb-pd-color'>
              <Text className='nb-pd-color-name'>{color}</Text>
              <View className='nb-pd-sizes'>
                {skus.map((sku) => (
                  <View key={sku.sku} className='nb-pd-size'>
                    <Text className='nb-pd-size-name'>{sku.size || '均码'}</Text>
                    <Text className='nb-pd-size-stock'>{sku.stock > 0 ? `库存 ${sku.stock}` : '缺货'}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))
        ) : (
          <Text className='nb-pd-empty'>该款暂无库存规格，可到店咨询</Text>
        )}
      </View>

      {detail.detailImages.length ? (
        <View className='nb-pd-details'>
          <Text className='nb-pd-section-title'>商品详情</Text>
          {detail.detailImages.map((image, index) => (
            <MediaImage
              key={`${image}-${index}`}
              src={image}
              label='DAVE & BELLA'
              className='nb-pd-detail-img'
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}
