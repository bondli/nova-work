import { useState } from 'react'
import Taro from '@tarojs/taro'
import type { ButtonProps } from '@tarojs/components'
import { Button } from '@nutui/nutui-react-taro'
import { useUserStore } from '@/stores/user'
import './index.scss'

interface AuthButtonProps {
  text?: string
  block?: boolean
  size?: 'small' | 'normal' | 'large'
  className?: string
  onLoggedIn?: () => void
}

/**
 * 微信授权手机号登录按钮：
 * 手机号即门店会员号，登录成功后写入 zustand + storage。
 */
export default function AuthButton({
  text = '微信授权手机号登录',
  block = true,
  size = 'normal',
  className = '',
  onLoggedIn
}: AuthButtonProps) {
  const login = useUserStore((state) => state.login)
  const [loading, setLoading] = useState(false)

  const handleGetPhoneNumber: NonNullable<ButtonProps['onGetPhoneNumber']> = async (event) => {
    const phoneCode = event.detail.code
    if (!phoneCode) {
      // 用户点了取消，或微信未返回一次性 code
      Taro.showToast({ title: '已取消授权', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      await login(phoneCode)
      Taro.showToast({ title: '登录成功', icon: 'success' })
      onLoggedIn?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : '登录失败，请稍后重试'
      Taro.showToast({ title: message, icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      type='primary'
      size={size}
      block={block}
      loading={loading}
      openType='getPhoneNumber'
      onGetPhoneNumber={handleGetPhoneNumber}
      className={`nb-auth-button ${className}`}
    >
      {text}
    </Button>
  )
}
