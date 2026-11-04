import { Text, View } from '@tarojs/components'
import type { HomeCategory } from '@/types/api'
import MediaImage from '@/components/MediaImage'
import './index.scss'

interface CategoryGridProps {
  categories: HomeCategory[]
}

/** 主营类目 3×2 图卡：图片 + 类目名 + 尺码区间；纯展示模块，不承载点击行为 */
export default function CategoryGrid({ categories }: CategoryGridProps) {
  return (
    <View className='nb-category-grid'>
      {categories.map((category) => (
        <View key={category.name} className='nb-category-tile'>
          <MediaImage src={category.image} label={category.name} className='nb-category-img' />
          <Text className='nb-category-name'>{category.name}</Text>
          <Text className='nb-category-size'>{category.size}</Text>
        </View>
      ))}
    </View>
  )
}
