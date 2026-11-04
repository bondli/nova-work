import { Tag } from '@nutui/nutui-react-taro'
import './index.scss'

export type StatusTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral' | 'white'

const TONE_STYLE: Record<StatusTone, { background: string; color: string }> = {
  brand: { background: '#fff1f2', color: '#c7001a' },
  success: { background: '#ecfdf5', color: '#15803d' },
  warning: { background: '#fffbeb', color: '#b45309' },
  danger: { background: '#fef2f2', color: '#b91c1c' },
  neutral: { background: '#f4f4f5', color: '#71717a' },
  white: { background: 'rgba(255,255,255,.2)', color: '#ffffff' }
}

interface StatusTagProps {
  text: string
  tone?: StatusTone
}

/** 业务状态标签：统一走 NutUI Tag，颜色只用品牌语义色 */
export default function StatusTag({ text, tone = 'brand' }: StatusTagProps) {
  const style = TONE_STYLE[tone]
  return (
    <Tag round background={style.background} color={style.color} className='nb-status-tag'>
      {text}
    </Tag>
  )
}
