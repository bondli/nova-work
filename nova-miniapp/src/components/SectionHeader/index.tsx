import { Text, View } from '@tarojs/components'
import { ArrowRight } from '@nutui/icons-react-taro'
import './index.scss'

interface SectionHeaderProps {
  title: string
  /** 右侧「查看全部」文案；不传则不渲染 */
  more?: string
  onMore?: () => void
}

/** 区块标题：对齐 demo 的 .section-head，首页各区块统一使用 */
export default function SectionHeader({ title, more, onMore }: SectionHeaderProps) {
  return (
    <View className='nb-section-head'>
      <Text className='nb-section-title'>{title}</Text>
      {more ? (
        <View className='nb-section-more' onClick={onMore}>
          <Text>{more}</Text>
          <ArrowRight size={10} color='#71717a' />
        </View>
      ) : null}
    </View>
  )
}
