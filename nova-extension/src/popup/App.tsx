/** 插件弹窗即设置面板：配置采集接口地址与上传令牌（采集入口在页面右键菜单） */
import { useEffect, useState } from "react"

import { BrandMark } from "../components/brand-mark"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { cn } from "../lib/utils"
import { buildUploadUrl, getConfig, saveConfig } from "../shared/storage"

type MessageKind = "idle" | "ok" | "err"

interface Message {
  text: string
  kind: MessageKind
}

export function PopupApp() {
  const [endpoint, setEndpoint] = useState("")
  const [token, setToken] = useState("")
  const [message, setMessage] = useState<Message>({ text: "", kind: "idle" })
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    void getConfig().then((config) => {
      setEndpoint(config.endpoint)
      setToken(config.token)
    })
  }, [])

  const uploadUrl = buildUploadUrl(endpoint, token)

  async function save(): Promise<void> {
    const value = endpoint.trim()
    if (!value) {
      setMessage({ text: "请填写采集图片接口地址", kind: "err" })
      return
    }
    if (!buildUploadUrl(value, token)) {
      setMessage({ text: "接口地址格式不正确，需以 http:// 或 https:// 开头", kind: "err" })
      return
    }
    await saveConfig({ endpoint: value, token: token.trim() })
    setMessage({ text: "配置已保存", kind: "ok" })
  }

  async function test(): Promise<void> {
    const url = buildUploadUrl(endpoint, token)
    if (!url) {
      setMessage({ text: "请先填写正确的接口地址", kind: "err" })
      return
    }

    setTesting(true)
    setMessage({ text: "正在检查服务连通性…", kind: "idle" })

    try {
      // 空 POST 探活：令牌校验先于文件校验，401=令牌无效，400=令牌正确但没带文件
      const response = await fetch(url, { method: "POST", signal: AbortSignal.timeout(8000) })
      if (response.status === 401) {
        setMessage({ text: "服务可达，但上传令牌无效或未配置", kind: "err" })
      } else if (response.status === 400) {
        setMessage({ text: "服务可达，上传令牌有效", kind: "ok" })
      } else {
        setMessage({ text: `服务可达（HTTP ${response.status}）`, kind: "ok" })
      }
    } catch {
      setMessage({
        text: "无法连接到该地址，请检查服务是否启动、地址与端口是否正确",
        kind: "err",
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="w-[340px] bg-background font-sans text-foreground">
      <header className="flex items-center gap-2.5 border-b border-border px-3.5 py-3">
        <BrandMark size={28} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold leading-tight">商品图片采集设置</div>
          <div className="text-[11px] leading-tight text-muted-foreground/80">DaveBella POS</div>
        </div>
      </header>

      <div className="p-3.5">
        <Label htmlFor="nova-endpoint" className="mb-1.5">
          采集图片接口地址
        </Label>
        <Input
          id="nova-endpoint"
          value={endpoint}
          spellCheck={false}
          placeholder="http://127.0.0.1:9577"
          className="mb-3 font-mono text-xs"
          onChange={(event) => setEndpoint(event.target.value)}
        />

        <Label htmlFor="nova-token" className="mb-1.5">
          上传令牌
        </Label>
        <Input
          id="nova-token"
          value={token}
          spellCheck={false}
          placeholder="storage.uploadToken"
          className="mb-3 font-mono text-xs"
          onChange={(event) => setToken(event.target.value)}
        />

        <div className="mb-3 break-all rounded-lg bg-muted px-2.5 py-2 font-mono text-[11px] leading-relaxed text-foreground/70">
          {uploadUrl ? `实际请求地址：${uploadUrl}` : "实际请求地址：—"}
        </div>

        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => void save()}>
            保存配置
          </Button>
          <Button variant="outline" disabled={testing} onClick={() => void test()}>
            {testing ? "检测中…" : "测试连通性"}
          </Button>
        </div>

        <p
          className={cn(
            "mt-2.5 min-h-[17px] text-xs",
            message.kind === "ok" && "text-success",
            message.kind === "err" && "text-destructive",
            message.kind === "idle" && "text-muted-foreground",
          )}
        >
          {message.text}
        </p>

        <div className="mt-3 border-t border-border pt-2.5 text-[11px] leading-relaxed text-muted-foreground/80">
          采集方式：在商品图片上<b className="font-semibold text-foreground/70">右键</b>
          ，选择「采集图片到 DaveBella」。
          <br />
          令牌取自 POS 服务配置 <b className="font-semibold text-foreground/70">~/.nova/server-config.json</b>{" "}
          的 <b className="font-semibold text-foreground/70">storage.uploadToken</b>
          ；地址只填服务地址即可，插件会自动补全{" "}
          <b className="font-semibold text-foreground/70">/inventory/uploadImage</b>。
        </div>
      </div>
    </div>
  )
}
