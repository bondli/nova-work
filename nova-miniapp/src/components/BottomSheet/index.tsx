import { ReactNode } from 'react'
import { Text, View } from '@tarojs/components'
import { Popup } from '@nutui/nutui-react-taro'
import { Close } from '@nutui/icons-react-taro'
import './index.scss'

interface BottomSheetProps {
  visible: boolean
  title?: string
  desc?: string
  /** 是否显示右上角关闭按钮 */
  showClose?: boolean
  onClose: () => void
  children: ReactNode
}

/** 底部弹层统一封装 NutUI Popup，交互与 demo 的 sheet 保持一致 */
export default function BottomSheet({
  visible,
  title,
  desc,
  showClose = true,
  onClose,
  children
}: BottomSheetProps) {
  return (
    <Popup
      visible={visible}
      position='bottom'
      round
      closeOnOverlayClick
      onClose={onClose}
      className='nb-sheet-popup'
    >
      <View className='nb-sheet'>
        <View className='nb-sheet-handle' />
        {title ? (
          <View className='nb-sheet-head'>
            <View className='nb-sheet-head-text'>
              <Text className='nb-sheet-title'>{title}</Text>
              {desc ? <Text className='nb-sheet-desc'>{desc}</Text> : null}
            </View>
            {showClose ? (
              <View className='nb-sheet-close' onClick={onClose}>
                <Close size={16} color='#71717a' />
              </View>
            ) : null}
          </View>
        ) : null}
        <View className='nb-sheet-body'>{children}</View>
      </View>
    </Popup>
  )
}
