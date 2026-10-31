import { useEffect, useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { unwrap } from '@renderer/lib/ipc'
import { AuthBrandPanel } from './AuthBrandPanel'
import { LoginForm } from './LoginForm'
import { RegisterForm } from './RegisterForm'

type AuthMode = 'login' | 'register'

/** 主进程未配置过服务地址时使用的兜底值，与 server-config 的默认值一致 */
const DEFAULT_SERVER = 'http://127.0.0.1:9577'

/**
 * 登录 / 注册页：左侧品牌面板 + 右侧表单，两种模式共用同一页面容器。
 * 登录请求依赖 POS 服务地址，所以这里提供地址配置入口（未登录状态也可读写）。
 */
export function AuthPage() {
  // 版本号由构建时注入，不需要再向主进程请求
  const version = __APP_VERSION__
  const [mode, setMode] = useState<AuthMode>('login')
  const [serverAddress, setServerAddress] = useState(DEFAULT_SERVER)
  const [savedAddress, setSavedAddress] = useState(DEFAULT_SERVER)
  const [internalToken, setInternalToken] = useState('')
  const [addressExpanded, setAddressExpanded] = useState(false)

  // 新电脑首次启动没有配置文件，主进程会返回默认地址；读取失败时保留兜底值
  useEffect(() => {
    let cancelled = false
    window.nova.serverConfig
      .baseUrl()
      .then((result) => {
        if (cancelled || !result.ok) return
        setServerAddress(result.data)
        setSavedAddress(result.data)
      })
      .catch(() => {
        // 忽略读取失败，允许用户手动填写
      })
    return () => {
      cancelled = true
    }
  }, [])

  /** 登录 / 注册前把改动的服务地址与内部令牌写入 ~/.nova/server-config.json */
  const prepareServer = async (): Promise<void> => {
    const value = serverAddress.trim()
    const token = internalToken.trim()
    // 地址未变化且没填令牌时不重复落盘
    if ((!value || value === savedAddress) && !token) return
    const saved = unwrap(
      await window.nova.serverConfig.setBaseUrl({
        baseUrl: value || savedAddress,
        internalToken: token || undefined
      })
    )
    setServerAddress(saved)
    setSavedAddress(saved)
  }

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

            <div className="mt-5 rounded-xl border border-border bg-card px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-meta text-subtle">服务器地址</p>
                  <p className="mt-0.5 truncate text-ui tnum">{serverAddress || DEFAULT_SERVER}</p>
                </div>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto shrink-0 p-0 text-ui"
                  onClick={() => setAddressExpanded((current) => !current)}
                >
                  {addressExpanded ? '收起' : '修改'}
                </Button>
              </div>

              {addressExpanded ? (
                <div className="mt-2 grid gap-2">
                  <Input
                    aria-label="服务器地址"
                    className="h-9"
                    value={serverAddress}
                    placeholder={DEFAULT_SERVER}
                    onChange={(event) => setServerAddress(event.target.value)}
                  />
                  <Input
                    aria-label="内部令牌"
                    className="h-9"
                    value={internalToken}
                    placeholder="内部令牌（跨机部署时填写）"
                    onChange={(event) => setInternalToken(event.target.value)}
                  />
                  <p className="text-meta text-subtle">
                    跨机部署需填写服务端 ~/.nova/server-config.json 的 auth.internalToken；与服务端同机可留空
                  </p>
                </div>
              ) : null}
            </div>

            {mode === 'login' ? (
              <LoginForm
                onSwitchMode={() => setMode('register')}
                beforeSubmit={prepareServer}
              />
            ) : (
              <RegisterForm
                onSwitchMode={() => setMode('login')}
                beforeSubmit={prepareServer}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
