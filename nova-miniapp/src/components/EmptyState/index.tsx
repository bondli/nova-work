import { View } from '@tarojs/components'
import { Button, Empty, Image } from '@nutui/nutui-react-taro'
import emptyIcon from '@/assets/empty-inbox.svg'
import './index.scss'

interface EmptyStateProps {
  title?: string
  description?: string
  actionText?: string
  onAction?: () => void
}

/** 空态统一走 NutUI Empty，并用自绘空收件箱图标替换 NutUI 默认的京东插画 */
export default function EmptyState({ title = '暂无数据', description, actionText, onAction }: EmptyStateProps) {
  return (
    <View className='nb-empty'>
      <Empty
        status='empty'
        title={title}
        description={description}
        image={<Image src={emptyIcon} width={56} height={56} fit='contain' />}
        imageSize={56}
      />
      {actionText ? (
        <Button type='primary' size='small' className='nb-empty-action' onClick={onAction}>
          {actionText}
        </Button>
      ) : null}
    </View>
  )
}
