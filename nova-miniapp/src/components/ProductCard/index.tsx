import { Text, View } from '@tarojs/components'
import type { HomeProduct } from '@/types/api'
import MediaImage from '@/components/MediaImage'
import './index.scss'

interface ProductCardProps {
  product: HomeProduct
  /** 未配置可点击时不传 onClick，卡片保持纯展示 */
  onClick?: () => void
}

/** 本季新品卡：红色销售价 + 划线吊牌价（双价格）；是否可点击由首页配置决定 */
export default function ProductCard({ product, onClick }: ProductCardProps) {
  return (
    <View className={`nb-product${onClick ? ' nb-product-clickable' : ''}`} onClick={onClick}>
      <MediaImage src={product.image} label='DAVE & BELLA' className='nb-product-img' />
      <View className='nb-product-body'>
        <Text className='nb-product-tag'>{product.tag}</Text>
        <Text className='nb-product-name'>{product.name}</Text>
        <Text className='nb-product-desc'>{product.desc}</Text>
        <View className='nb-product-price-row'>
          <Text className='nb-product-price'>{product.price}</Text>
          {product.originPrice ? <Text className='nb-product-origin'>{product.originPrice}</Text> : null}
        </View>
      </View>
    </View>
  )
}
