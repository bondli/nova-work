import { useEffect, useState, type ReactNode } from 'react'
import { Info } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@renderer/components/ui/button'
import { PasswordInput } from '@renderer/components/common/PasswordInput'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { unwrap } from '@renderer/lib/ipc'
import { useAuthStore } from '@renderer/stores/auth-store'
import type { DataSettingsInput, DataSettingsView } from '@shared/types/data-config'

/** 卡片外壳：设置项按业务域分组，避免所有字段堆在一起 */
function SettingsCard({
  title,
  description,
  extra,
  children
}: {
  title: string
  description?: string
  extra?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-border">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="text-ui font-medium">{title}</p>
          {description ? (
            <p className="mt-0.5 text-meta text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {extra}
      </header>
      <div className="grid gap-4 p-4">{children}</div>
    </section>
  )
}

/**
 * 数据设置：
 * - POS 服务地址写入 ~/.nova/server-config.json，与 nova-pos-server 共用；
 * - 只读数据库写入 ~/.nova/agent-config.json，仅用于 Agent 查询（同样预置在系统提示词中）。
 * 上传目录、日志目录等属于服务端自身配置，不在这里维护。
 */
export function DataSettingsTab() {
  const isAdmin = useAuthStore((state) => state.user?.role) === 'admin'
  const [view, setView] = useState<DataSettingsView | null>(null)
  const [form, setForm] = useState<DataSettingsInput | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false)
      setForbidden(true)
      return
    }

    void (async () => {
      try {
        const config = unwrap(await window.nova.dataConfig.get())
        setView(config)
        setForm({
          baseUrl: config.baseUrl,
          database: config.database
        })
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '读取数据设置失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [isAdmin])

  const updateDatabase = (patch: Partial<DataSettingsInput['database']>): void => {
    setForm((current) =>
      current ? { ...current, database: { ...current.database, ...patch } } : current
    )
  }

  const save = async (): Promise<void> => {
    if (!form) return
    setSaving(true)
    try {
      const saved = unwrap(await window.nova.dataConfig.set(form))
      setView(saved)
      setForm({
        baseUrl: saved.baseUrl,
        database: saved.database
      })
      toast.success('数据设置已保存')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存数据设置失败')
    } finally {
      setSaving(false)
    }
  }

  if (forbidden) {
    return (
      <div className="flex h-full items-center justify-center text-meta text-muted-foreground">
        仅管理员可查看数据设置
      </div>
    )
  }

  if (loading || !form) {
    return <div className="text-meta text-muted-foreground">正在读取配置…</div>
  }

  const disabled = saving

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
        <div>
          <h2 className="text-body font-semibold">数据连接</h2>
          <p className="mt-0.5 text-meta text-muted-foreground">
            业务数据走 POS 服务；经营分析使用只读账号查询数据库
          </p>
        </div>

        <SettingsCard title="POS 服务" description="桌面端业务请求统一使用该地址">
          <Input
            id="server-base-url"
            aria-label="服务地址"
            value={form.baseUrl}
            placeholder="http://127.0.0.1:9577"
            disabled={disabled}
            onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
          />
        </SettingsCard>

        <SettingsCard
          title="Agent 只读数据库"
          description="Agent 查询经营数据使用；连接信息同时预置在系统提示词中"
          extra={
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-caption font-medium text-emerald-600">
              仅 SELECT
            </span>
          }
        >
          <div className="grid grid-cols-4 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="db-host" className="text-meta text-muted-foreground">
                主机
              </Label>
              <Input
                id="db-host"
                value={form.database.host}
                disabled={disabled}
                onChange={(event) => updateDatabase({ host: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="db-port" className="text-meta text-muted-foreground">
                端口
              </Label>
              <Input
                id="db-port"
                inputMode="numeric"
                className="tnum"
                value={String(form.database.port)}
                disabled={disabled}
                onChange={(event) =>
                  updateDatabase({ port: Number(event.target.value.replace(/\D/g, '')) || 0 })
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="db-name" className="text-meta text-muted-foreground">
                库名
              </Label>
              <Input
                id="db-name"
                value={form.database.database}
                disabled={disabled}
                onChange={(event) => updateDatabase({ database: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="db-user" className="text-meta text-muted-foreground">
                只读账号
              </Label>
              <Input
                id="db-user"
                value={form.database.user}
                disabled={disabled}
                onChange={(event) => updateDatabase({ user: event.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="db-password" className="text-meta text-muted-foreground">
                密码
              </Label>
              <PasswordInput
                id="db-password"
                autoComplete="off"
                value={form.database.password}
                disabled={disabled}
                onChange={(event) => updateDatabase({ password: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-meta text-muted-foreground">表结构快照</Label>
              <div className="flex h-9 items-center gap-2 rounded-md border border-input px-3 text-ui text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                已内置业务表结构与口径
              </div>
            </div>
          </div>
        </SettingsCard>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border pt-3">
        <p className="min-w-0 truncate text-meta text-subtle" title={view?.serverConfigPath}>
          POS 配置保存到 ~/.nova/server-config.json，数据库配置保存到 ~/.nova/agent-config.json
        </p>
        <Button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </Button>
      </div>
    </div>
  )
}
