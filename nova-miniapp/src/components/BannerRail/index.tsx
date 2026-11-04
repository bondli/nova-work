import { useState } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import { ArrowRight } from '@nutui/icons-react-taro'
import type { HomeBanner } from '@/types/api'
import MediaImage from '@/components/MediaImage'
import './index.scss'

interface BannerRailProps {
  banners: HomeBanner[]
  onPress: (banner: HomeBanner) => void
}

/** 活动 Banner 横滑：272×152 卡片 + 圆点指示，严格对齐 demo */
export default function BannerRail({ banners, onPress }: BannerRailProps) {
  const [active, setActive] = useState(0)
  if (!banners.length) return null

  const handleScroll = (event: { detail: { scrollLeft: number } }) => {
    // 卡片 272 + 间距 10，按滑动距离估算当前卡片
    const index = Math.max(0, Math.min(banners.length - 1, Math.round(event.detail.scrollLeft / 282)))
    if (index !== active) setActive(index)
  }

  return (
    <View className='nb-banner-block'>
      <ScrollView scrollX className='nb-banner-rail' enhanced showScrollbar={false} onScroll={handleScroll}>
        {banners.map((banner, index) => (
          <View key={`${banner.tag}-${index}`} className='nb-banner' onClick={() => onPress(banner)}>
            <MediaImage src={banner.image} label={banner.tag || 'DAVE & BELLA'} className='nb-banner-img' />
            <View className='nb-banner-shade' />
            <View className='nb-banner-body'>
              <Text className='nb-banner-tag'>{banner.tag}</Text>
              <View>
                {banner.title.split(/<br\s*\/?>|\n/).map((line, lineIndex) => (
                  <Text key={`${line}-${lineIndex}`} className='nb-banner-title'>
                    {line}
                  </Text>
                ))}
                <Text className='nb-banner-desc'>{banner.desc}</Text>
                <View className='nb-banner-cta'>
                  <Text>{banner.cta}</Text>
                  <ArrowRight size={10} color='#c7001a' />
                </View>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
      <View className='nb-banner-dots'>
        {banners.map((banner, index) => (
          <View
            key={`dot-${banner.tag}-${index}`}
            className={`nb-banner-dot ${index === active ? 'nb-banner-dot-on' : ''}`}
          />
        ))}
      </View>
    </View>
  )
}
