import { useState } from 'react'
import { Text, View } from '@tarojs/components'
import { Image } from '@nutui/nutui-react-taro'
import './index.scss'

interface MediaImageProps {
  src?: string
  /** 图片加载失败/无图时的兜底文案 */
  label?: string
  /** 图片裁剪模式，默认 cover */
  fit?: 'cover' | 'contain' | 'fill' | 'none'
  className?: string
}

/**
 * 图片容器：图片缺失或加载失败时展示品牌渐变兜底，
 * 避免小程序出现空白框（对齐 demo 的 .img-fb）。
 */
export default function MediaImage({ src, label = 'DAVE & BELLA', fit = 'cover', className = '' }: MediaImageProps) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <View className={`nb-media nb-media-fallback ${className}`}>
        <Text className='nb-media-fallback-text'>{label}</Text>
      </View>
    )
  }

  return (
    <View className={`nb-media ${className}`}>
      <Image src={src} fit={fit} width='100%' height='100%' onError={() => setFailed(true)} />
    </View>
  )
}
