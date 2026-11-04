import { Text, View } from '@tarojs/components'
import type { BrandStory } from '@/types/api'
import MediaImage from '@/components/MediaImage'
import './index.scss'

interface BrandStoryCardProps {
  story: BrandStory
}

/** 品牌价值：单张横向图 + ABOUT + slogan + 三项数据（用户确认的第三块核心内容） */
export default function BrandStoryCard({ story }: BrandStoryCardProps) {
  return (
    <View className='nb-card nb-brand-card'>
      <MediaImage src={story.images?.[0]} label='DAVE & BELLA' className='nb-brand-image' />
      <View className='nb-brand-body'>
        <Text className='nb-brand-eyebrow'>ABOUT DAVE&amp;BELLA</Text>
        <Text className='nb-brand-title nb-brand-mark'>{story.slogan || story.title}</Text>
        <Text className='nb-brand-desc'>{story.desc}</Text>
        <View className='nb-brand-stats'>
          {story.stats.map((stat) => (
            <View key={stat.label} className='nb-brand-stat'>
              <Text className='nb-brand-stat-value'>{stat.value}</Text>
              <Text className='nb-brand-stat-label'>{stat.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}
