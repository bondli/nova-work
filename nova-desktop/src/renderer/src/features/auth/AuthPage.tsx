import { useState } from 'react'
import { AuthBrandPanel } from './AuthBrandPanel'
import { LoginForm } from './LoginForm'
import { RegisterForm } from './RegisterForm'

type AuthMode = 'login' | 'register'

/**
 * 登录 / 注册页：左侧品牌面板 + 右侧表单，两种模式共用同一页面容器。
 */
export function AuthPage() {
  // 版本号由构建时注入，不需要再向主进程请求
  const version = __APP_VERSION__
  const [mode, setMode] = useState<AuthMode>('login')

  return (
    <div className="flex h-screen w-screen bg-card">
      <AuthBrandPanel version={version} />

      <div className="flex flex-1 flex-col bg-surface">
        <div className="flex justify-end px-6 pt-5">
          <span className="text-meta text-subtle">DaveBella v{version}</span>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 pb-10">
          <div className="w-full max-w-[360px]">
            <h2 className="text-metric font-semibold tracking-[-0.02em]">
              {mode === 'login' ? '登录 DaveBella' : '注册账号'}
            </h2>
            <p className="mt-1.5 text-ui text-muted-foreground">
              {mode === 'login'
                ? '使用门店账号登录经营工作台'
                : '创建门店账号，注册后默认为导购员'}
            </p>

            {mode === 'login' ? (
              <LoginForm onSwitchMode={() => setMode('register')} />
            ) : (
              <RegisterForm onSwitchMode={() => setMode('login')} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
