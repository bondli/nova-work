import { useEffect, useState } from 'react'
import { Info, PlugZap } from 'lucide-react'
import { toast } from 'sonner'
import { PasswordInput } from '@renderer/components/common/PasswordInput'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import { MODEL_OPTIONS } from '@shared/model-options'
import { unwrap } from '@renderer/lib/ipc'
import { useAuthStore } from '@renderer/stores/auth-store'
import type { ModelTestResult } from '@shared/types/model-config'

/** 表单草稿；configPath / 测试结果不参与保存 */
interface Draft {
  enabled: boolean
  baseUrl: string
  apiKey: string
  model: string
}

function formatCheckedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (input: number): string => String(input).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * 模型设置：读写 ~/.nova/agent-config.json 的 model 段。
 * 与 demo 对齐：卡片式模型信息 + 三列接入参数 + 底部自动保存与连接测试。
 * 仅管理员可见；保存后新的分析会话立即使用新配置。
 */
export function ModelSettingsTab() {
  const isAdmin = useAuthStore((state) => state.user?.role) === 'admin'
  const [draft, setDraft] = useState<Draft | null>(null)
  const [configPath, setConfigPath] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [lastTest, setLastTest] = useState<ModelTestResult | null>(null)
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false)
      setForbidden(true)
      return
    }

    void (async () => {
      try {
        const config = unwrap(await window.nova.modelConfig.get())
        setConfigPath(config.configPath)
        setDraft({
          enabled: config.enabled,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model: config.model
        })
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '读取模型配置失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [isAdmin])

  /** 任意字段变更立即落盘，与 demo 的「自动保存」一致 */
  const persist = async (next: Draft): Promise<void> => {
    setSaving(true)
    try {
      const saved = unwrap(await window.nova.modelConfig.set(next))
      setDraft({
        enabled: saved.enabled,
        baseUrl: saved.baseUrl,
        apiKey: saved.apiKey,
        model: saved.model
      })
      setConfigPath(saved.configPath)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存模型设置失败')
    } finally {
      setSaving(false)
    }
  }

  const update = (patch: Partial<Draft>): void => {
    setDraft((current) => (current ? { ...current, ...patch } : current))
  }

  const runTest = async (): Promise<void> => {
    setTesting(true)
    try {
      const result = unwrap(await window.nova.modelConfig.test())
      setLastTest(result)
      if (result.ok) toast.success(result.message)
      else toast.error(result.message)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '模型连接测试失败')
    } finally {
      setTesting(false)
    }
  }

  if (forbidden) {
    return (
      <div className="flex h-full items-center justify-center text-meta text-muted-foreground">
        仅管理员可查看模型设置
      </div>
    )
  }

  if (loading || !draft) {
    return <div className="text-meta text-muted-foreground">正在读取配置…</div>
  }

  const disabled = saving

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-body font-semibold">模型</h2>
        <p className="mt-0.5 text-meta text-muted-foreground">
          用于经营分析对话与报告生成，首版仅支持 DeepSeek
        </p>
      </div>

      <div className="rounded-xl border border-border">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eef2ff] text-[14px] font-bold text-[#4338ca]">
            D
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-ui font-medium">DeepSeek</p>
            <p className="mt-0.5 text-meta text-muted-foreground">
              deepseek-flash · deepseek-v4-pro
            </p>
          </div>
          <span
            className={
              draft.enabled
                ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-caption font-medium text-emerald-600'
                : 'rounded-full bg-muted px-2 py-0.5 text-caption font-medium text-muted-foreground'
            }
          >
            {draft.enabled ? '已启用' : '已停用'}
          </span>
          <Switch
            checked={draft.enabled}
            aria-label="启用 DeepSeek"
            disabled={disabled}
            onCheckedChange={(checked) => {
              if (checked && !draft.apiKey.trim()) {
                toast.error('请先填写 API Key 再启用模型')
                return
              }
              const next = { ...draft, enabled: checked }
              update({ enabled: checked })
              void persist(next)
            }}
          />
        </div>

        <div className="grid grid-cols-3 gap-4 p-4">
          <div className="grid gap-1.5">
            <Label htmlFor="model-api-key" className="text-ui">
              API Key
            </Label>
            <PasswordInput
              id="model-api-key"
              autoComplete="off"
              value={draft.apiKey}
              placeholder="sk-..."
              disabled={disabled}
              onChange={(event) => update({ apiKey: event.target.value })}
              onBlur={() => void persist(draft)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="model-base-url" className="text-ui">
              Base URL
            </Label>
            <Input
              id="model-base-url"
              value={draft.baseUrl}
              placeholder="https://api.deepseek.com"
              disabled={disabled}
              onChange={(event) => update({ baseUrl: event.target.value })}
              onBlur={() => void persist(draft)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="model-default" className="text-ui">
              默认模型
            </Label>
            <Select
              value={draft.model}
              disabled={disabled}
              onValueChange={(value) => {
                update({ model: value })
                void persist({ ...draft, model: value })
              }}
            >
              <SelectTrigger
                id="model-default"
                aria-label="默认模型"
                className="w-full text-ui"
              >
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent>
                {MODEL_OPTIONS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
          <p className="min-w-0 truncate text-caption text-subtle" title={configPath}>
            设置自动保存到 ~/.nova/agent-config.json，API Key 仅保存在本机
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={
                lastTest
                  ? lastTest.ok
                    ? 'text-meta text-emerald-600'
                    : 'text-meta text-destructive'
                  : 'text-meta text-subtle'
              }
            >
              {lastTest
                ? `上次测试：${lastTest.message}（${formatCheckedAt(lastTest.checkedAt)}）`
                : '上次测试：未检测'}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={testing || disabled}
              onClick={() => void runTest()}
            >
              <PlugZap className="h-3.5 w-3.5" aria-hidden="true" />
              {testing ? '测试中…' : '测试连接'}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2.5">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-meta leading-relaxed text-muted-foreground">
          切换模型后仅对新建会话生效，历史会话保持原模型；API Key 不会同步到服务端。
        </p>
      </div>
    </div>
  )
}
