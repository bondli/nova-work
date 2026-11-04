import { PropsWithChildren, useEffect } from 'react'
import { useLaunch } from '@tarojs/taro'
import { useUserStore } from '@/stores/user'

import './app.scss'
// NutUI 样式需全局引入一次；这里只引入实际用到的组件，避免全量样式撑大主包
import './styles/nutui.scss'

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    // 启动即尝试静默登录：openid 已绑定会员时无需再次授权手机号
    void useUserStore.getState().silentLogin()
  })

  // zustand 的 token 变更不会触发小程序页面刷新，这里只在卸载时清理
  useEffect(() => {
    return () => undefined
  }, [])

  return children
}

export default App
