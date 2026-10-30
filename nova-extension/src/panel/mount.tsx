/** 采集浮层挂载：Shadow DOM 隔离宿主页面样式，浮层内部由 React 渲染 */
import { createRoot } from "react-dom/client"

import styles from "../styles/tailwind.css"
import { PanelApp } from "./App"

const HOST_ID = "nova-collect-host"

interface PanelOptions {
  /** 右键点击的图片地址 */
  initialImageUrl?: string
}

export function openPanel(options: PanelOptions = {}): void {
  document.getElementById(HOST_ID)?.remove()

  const host = document.createElement("div")
  host.id = HOST_ID

  const shadow = host.attachShadow({ mode: "open" })
  const style = document.createElement("style")
  style.textContent = styles
  shadow.appendChild(style)

  const container = document.createElement("div")
  shadow.appendChild(container)
  document.documentElement.appendChild(host)

  const root = createRoot(container)
  const close = (): void => {
    host.remove()
    // 交给下一轮事件循环卸载，避免在 React 事件回调内同步卸载当前根
    setTimeout(() => root.unmount(), 0)
  }

  root.render(<PanelApp initialImageUrl={options.initialImageUrl} onClose={close} />)
}
